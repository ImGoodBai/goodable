import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';

// Read from environment variables
process.env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co';
process.env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';

const targetDir = path.join(__dirname, 'TEST_DIR');

async function main() {
  const response = query({
    prompt: `Please organize files in "${targetDir}" by type into subfolders (e.g., images/, documents/, videos/). Execute directly.`,
    options: {
      cwd: targetDir,
      permissionMode: 'bypassPermissions',
    },
  });

  for await (const msg of response) {
    if (msg.type === 'assistant') {
      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') process.stdout.write(block.text);
        }
      }
    }
  }
}

main().catch(console.error);