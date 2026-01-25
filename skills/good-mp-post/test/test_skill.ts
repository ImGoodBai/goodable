/**
 * Automated test for good-mp-post skill
 * Test flow: upload image + create draft article
 */

import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load all environment variables from skill's .env
function loadSkillEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env file not found at ${envPath}, please copy from .env.example and fill credentials`);
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath));

  if (!envConfig.WECHAT_APP_ID || !envConfig.WECHAT_APP_SECRET) {
    throw new Error('WECHAT_APP_ID and WECHAT_APP_SECRET must be set in .env file');
  }

  // Return all env vars (WeChat + Claude API)
  return {
    ...process.env,
    WECHAT_APP_ID: envConfig.WECHAT_APP_ID,
    WECHAT_APP_SECRET: envConfig.WECHAT_APP_SECRET,
    ANTHROPIC_BASE_URL: envConfig.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co',
    ANTHROPIC_AUTH_TOKEN: envConfig.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN || '',
  };
}

// Get test image path
function getTestImagePath(): string {
  const imagePath = path.join(process.cwd(), 'public', 'screenshot', '01.png');
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Test image not found: ${imagePath}`);
  }
  return imagePath;
}

// Send message to AI via SDK
async function sendMessage(
  prompt: string,
  env: NodeJS.ProcessEnv,
  cwd: string
): Promise<{ reply: string; sessionId: string }> {
  const cliPath = path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');

  const options: any = {
    cwd,
    pathToClaudeCodeExecutable: cliPath,
    env,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
  };

  const response = query({
    prompt,
    options,
  });

  let reply = '';
  let resultSessionId = '';

  for await (const message of response) {
    if (message.type === 'assistant') {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            reply += block.text;
            process.stdout.write(block.text);
          }
        }
      }
    } else if (message.type === 'result') {
      const result = message as SDKResultMessage;
      resultSessionId = result.session_id;
    }
  }

  return { reply, sessionId: resultSessionId };
}

// Check if task succeeded
function checkSuccess(reply: string): boolean {
  const successKeywords = [
    'media_id',
    '发布成功',
    '草稿创建成功',
    'draft created',
    'successfully',
  ];

  const lowerReply = reply.toLowerCase();
  return successKeywords.some(keyword => lowerReply.includes(keyword.toLowerCase()));
}

async function main() {
  console.log('=== Good-MP-Post Skill Test ===\n');

  try {
    // Step 1: Load credentials
    console.log('[1/4] Loading credentials...');
    const env = loadSkillEnv();

    console.log(`  ✓ WeChat APP_ID: ${env.WECHAT_APP_ID?.substring(0, 6)}***`);
    console.log(`  ✓ Claude API: ${env.ANTHROPIC_BASE_URL}\n`);

    // Step 2: Prepare test image
    console.log('[2/4] Preparing test image...');
    const imagePath = getTestImagePath();
    console.log(`  ✓ Image path: ${imagePath}\n`);

    // Step 3: Send prompt to AI
    console.log('[3/4] Sending task to AI...');
    const skillDir = path.join(__dirname, '..');
    const prompt = `Please publish a WeChat Official Account article with the following details:
- Title: "Goodable Skill Test"
- Author: "TestBot"
- Content: <p>Hello World from Goodable! This is an automated test.</p>
- Cover image: ${imagePath}

Execute the complete workflow: upload image, create draft, and publish.`;

    console.log(`\n--- AI Response ---\n`);
    const result = await sendMessage(prompt, env, skillDir);
    console.log(`\n--- End of AI Response ---\n`);

    // Step 4: Check result
    console.log('[4/4] Validating result...');
    const success = checkSuccess(result.reply);

    if (success) {
      console.log('\n✅ TEST PASSED: Skill executed successfully!');
      console.log(`   Session ID: ${result.sessionId}`);
      process.exit(0);
    } else {
      console.log('\n❌ TEST FAILED: Success keywords not found in response');
      console.log(`   Session ID: ${result.sessionId}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
