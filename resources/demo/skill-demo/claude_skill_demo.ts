/**
 * Claude Agent SDK - PPTX Skill Demo
 * Test loading and using pptx skill via local plugin
 */

import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs';

function getClaudeCodeExecutablePath(): string {
  return path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
}

function setupEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  // API config - read from environment variables
  env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co';
  env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';

  return env;
}

async function testPptxSkill(): Promise<void> {
  console.log('=== Claude Agent SDK - PPTX Skill Demo ===\n');

  const env = setupEnv();
  const cliPath = getClaudeCodeExecutablePath();
  const cwd = process.cwd();
  const pluginPath = path.join(cwd, 'skill-demo', 'skills-plugin');
  const outputDir = path.join(cwd, 'skill-demo', 'output');

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[Setup] CLI path: ${cliPath}`);
  console.log(`[Setup] Plugin path: ${pluginPath}`);
  console.log(`[Setup] Output dir: ${outputDir}`);
  console.log(`[Setup] API URL: ${env.ANTHROPIC_BASE_URL}\n`);

  // Verify plugin exists
  const pluginManifest = path.join(pluginPath, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(pluginManifest)) {
    console.error(`[Error] Plugin manifest not found: ${pluginManifest}`);
    process.exit(1);
  }
  console.log(`[Setup] Plugin manifest found\n`);

  const options = {
    cwd,
    pathToClaudeCodeExecutable: cliPath,
    env,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,

    // Load local plugin containing pptx skill
    plugins: [
      { type: 'local' as const, path: pluginPath }
    ],

    // Enable Skill tool and tools needed by pptx skill
    allowedTools: [
      'Skill',
      'Bash',
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep'
    ],

    // Load project settings to enable skills discovery
    settingSources: ['project' as const],
  };

  // Simple test prompt - create a basic PPT
  const prompt = `Create a simple 3-slide PowerPoint presentation about "Introduction to AI" and save it to ${outputDir}/test-ai-intro.pptx.

The slides should be:
1. Title slide with the presentation title
2. What is AI - brief definition
3. Summary slide

Keep it simple for testing purposes.`;

  console.log('[User] ' + prompt.split('\n')[0] + '...\n');
  console.log('[Processing...]\n');

  const response = query({
    prompt,
    options,
  });

  let reply = '';
  let sessionId = '';

  for await (const message of response) {
    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`[Init] Skills loaded: ${message.skills?.join(', ') || 'none'}`);
      console.log(`[Init] Plugins: ${message.plugins?.map(p => p.name).join(', ') || 'none'}`);
      console.log(`[Init] Tools: ${message.tools?.join(', ') || 'none'}\n`);
    } else if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            reply += block.text;
          }
        }
      }
    } else if (message.type === 'result') {
      const result = message as SDKResultMessage;
      sessionId = result.session_id;
      console.log(`\n[Result] Duration: ${result.duration_ms}ms`);
      console.log(`[Result] Cost: $${result.total_cost_usd?.toFixed(4) || '0'}`);
    }
  }

  console.log('\n[Assistant Response]');
  console.log(reply.slice(0, 500) + (reply.length > 500 ? '...' : ''));

  // Check if output file was created
  const outputFile = path.join(outputDir, 'test-ai-intro.pptx');
  if (fs.existsSync(outputFile)) {
    console.log(`\n[Success] PPT file created: ${outputFile}`);
  } else {
    console.log(`\n[Note] PPT file not found at expected path. Check assistant response for details.`);
  }

  console.log('\n=== Demo completed ===');
}

testPptxSkill().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
