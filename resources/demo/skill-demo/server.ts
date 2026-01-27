/**
 * PPTX Skill Demo Server
 * Express server with SDK integration and PDF preview
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { execSync, exec } from 'child_process';
import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';

const app = express();
const PORT = 3456;

// Directories
const ROOT_DIR = process.cwd();
const SKILL_DEMO_DIR = path.join(ROOT_DIR, 'skill-demo');
const OUTPUT_DIR = path.join(SKILL_DEMO_DIR, 'output');
const PUBLIC_DIR = path.join(SKILL_DEMO_DIR, 'public');
const PLUGIN_PATH = path.join(SKILL_DEMO_DIR, 'skills-plugin');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/output', express.static(OUTPUT_DIR));

// Check LibreOffice installation
function checkLibreOffice(): string | null {
  const paths = [
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const result = execSync('which soffice', { encoding: 'utf-8' }).trim();
    if (result) return result;
  } catch {}
  return null;
}

// Convert PPTX to PDF using LibreOffice
async function convertToPdf(pptxPath: string): Promise<string> {
  const sofficePath = checkLibreOffice();
  if (!sofficePath) {
    throw new Error('LibreOffice not installed. Run: brew install --cask libreoffice');
  }

  const outputDir = path.dirname(pptxPath);
  const cmd = `"${sofficePath}" --headless --convert-to pdf --outdir "${outputDir}" "${pptxPath}"`;

  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`PDF conversion failed: ${stderr || error.message}`));
        return;
      }
      const pdfPath = pptxPath.replace(/\.pptx$/i, '.pdf');
      if (fs.existsSync(pdfPath)) {
        resolve(pdfPath);
      } else {
        reject(new Error('PDF file not created'));
      }
    });
  });
}

// Setup SDK environment
function setupEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co';
  env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';
  return env;
}

// Generate PPTX using SDK with SSE progress
async function generatePptxWithProgress(
  prompt: string,
  filename: string,
  onProgress: (msg: string) => void
): Promise<{ pptxPath: string; reply: string; duration: number; cost: number }> {
  const env = setupEnv();
  const cliPath = path.join(ROOT_DIR, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  const pptxPath = path.join(OUTPUT_DIR, filename);

  const fullPrompt = `${prompt}

Save the PowerPoint file to: ${pptxPath}

Keep it simple and clean.`;

  const options = {
    cwd: ROOT_DIR,
    pathToClaudeCodeExecutable: cliPath,
    env,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    plugins: [{ type: 'local' as const, path: PLUGIN_PATH }],
    allowedTools: ['Skill', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    settingSources: ['project' as const],
  };

  onProgress('Starting SDK...');
  const response = query({ prompt: fullPrompt, options });

  let reply = '';
  let duration = 0;
  let cost = 0;

  for await (const message of response) {
    if (message.type === 'system' && 'subtype' in message && message.subtype === 'init') {
      onProgress(`Skills loaded: ${(message as any).skills?.join(', ') || 'none'}`);
    } else if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            reply += block.text;
          } else if (block.type === 'tool_use') {
            onProgress(`Tool: ${block.name}`);
          }
        }
      }
    } else if (message.type === 'result') {
      const result = message as SDKResultMessage;
      duration = result.duration_ms;
      cost = result.total_cost_usd || 0;
      onProgress('Generation complete');
    }
  }

  return { pptxPath, reply, duration, cost };
}

// API: Generate PPTX with SSE progress
app.get('/api/generate', async (req, res) => {
  const prompt = req.query.prompt as string;

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type: string, data: any) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    } catch {}
  };

  // Keep-alive heartbeat every 15s
  const heartbeat = setInterval(() => {
    sendEvent('ping', { time: Date.now() });
  }, 15000);

  const timestamp = Date.now();
  const filename = `ppt-${timestamp}.pptx`;

  try {
    sendEvent('progress', { message: 'Starting generation...' });

    // Generate PPTX with progress
    const { pptxPath, reply, duration, cost } = await generatePptxWithProgress(
      prompt,
      filename,
      (msg) => sendEvent('progress', { message: msg })
    );

    // Check if PPTX was created
    if (!fs.existsSync(pptxPath)) {
      sendEvent('error', { message: 'PPTX file not created' });
      res.end();
      return;
    }

    // Convert to PDF
    sendEvent('progress', { message: 'Converting to PDF...' });
    const pdfPath = await convertToPdf(pptxPath);
    const pdfFilename = path.basename(pdfPath);

    sendEvent('done', {
      pptx: `/output/${filename}`,
      pdf: `/output/${pdfFilename}`,
      duration,
      cost: cost.toFixed(4)
    });

  } catch (error) {
    console.error('[SSE Error]', error);
    sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// API: Health check
app.get('/api/health', (req, res) => {
  const loPath = checkLibreOffice();
  res.json({
    status: 'ok',
    libreOffice: loPath ? 'installed' : 'not installed',
    libreOfficePath: loPath
  });
});

// Start server
app.listen(PORT, () => {
  const loPath = checkLibreOffice();
  console.log(`\n=== PPTX Skill Demo Server ===`);
  console.log(`http://localhost:${PORT}`);
  console.log(`LibreOffice: ${loPath || 'NOT INSTALLED - run: brew install --cask libreoffice'}\n`);
});
