/**
 * Skill Demo V2 - Verify skills dependency and copy mechanism
 *
 * This demo verifies:
 * 1. Skill copy from builtin-skills to user-skills
 * 2. AI auto-detects and installs dependencies
 * 3. Enable/disable via marketplace.json skills array
 */

import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs';

const DEMO_DIR = path.join(process.cwd(), 'resources', 'demo', 'skill-demo');
const BUILTIN_SKILLS_DIR = path.join(DEMO_DIR, 'builtin-skills');
const USER_SKILLS_DIR = path.join(DEMO_DIR, 'user-skills');
const OUTPUT_DIR = path.join(DEMO_DIR, 'output');

function getClaudeCodeExecutablePath(): string {
  return path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
}

function setupEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co';
  env.ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';
  return env;
}

/**
 * Copy directory recursively
 */
function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Ensure skill exists in user-skills directory
 * If not, copy from builtin-skills
 */
function ensureSkillInUserDir(skillName: string): boolean {
  const builtinPath = path.join(BUILTIN_SKILLS_DIR, skillName);
  const userPath = path.join(USER_SKILLS_DIR, skillName);

  // Check if skill exists in builtin
  if (!fs.existsSync(builtinPath)) {
    console.log(`[Error] Builtin skill not found: ${builtinPath}`);
    return false;
  }

  // Check if already copied to user-skills
  if (fs.existsSync(userPath)) {
    console.log(`[Setup] Skill already in user-skills: ${skillName}`);
    return true;
  }

  // Copy from builtin to user-skills
  console.log(`[Setup] Copying skill from builtin to user-skills: ${skillName}`);
  copyDirSync(builtinPath, userPath);
  console.log(`[Setup] Skill copied successfully`);
  return true;
}

/**
 * Check if skill has dependencies installed
 */
function checkSkillDependencies(skillName: string): { hasPkgJson: boolean; hasNodeModules: boolean } {
  const skillPath = path.join(USER_SKILLS_DIR, skillName);
  const pkgJsonPath = path.join(skillPath, 'package.json');
  const nodeModulesPath = path.join(skillPath, 'node_modules');

  return {
    hasPkgJson: fs.existsSync(pkgJsonPath),
    hasNodeModules: fs.existsSync(nodeModulesPath)
  };
}

/**
 * Clean output directory
 */
function cleanOutputDir(): void {
  if (fs.existsSync(OUTPUT_DIR)) {
    // Remove all files except node_modules (if exists)
    const entries = fs.readdirSync(OUTPUT_DIR);
    for (const entry of entries) {
      if (entry === 'node_modules') continue;
      const fullPath = path.join(OUTPUT_DIR, entry);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    console.log(`[Setup] Cleaned output directory`);
  } else {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[Setup] Created output directory`);
  }
}

async function runSkillDemo(): Promise<void> {
  console.log('=== Skill Demo V2 - Dependency & Copy Mechanism ===\n');

  // Step 1: Ensure pptx skill is in user-skills
  console.log('[Step 1] Ensure skill in user-skills directory');
  if (!ensureSkillInUserDir('pptx')) {
    process.exit(1);
  }

  // Step 2: Check dependency status BEFORE running
  console.log('\n[Step 2] Check dependency status');
  const depStatus = checkSkillDependencies('pptx');
  console.log(`  - package.json exists: ${depStatus.hasPkgJson}`);
  console.log(`  - node_modules exists: ${depStatus.hasNodeModules}`);

  if (!depStatus.hasNodeModules) {
    console.log('  => AI will need to install dependencies');
  }

  // Step 3: Clean output directory
  console.log('\n[Step 3] Clean output directory');
  cleanOutputDir();

  // Step 4: Setup SDK options
  console.log('\n[Step 4] Setup SDK options');
  const env = setupEnv();
  const cliPath = getClaudeCodeExecutablePath();

  console.log(`  - CLI path: ${cliPath}`);
  console.log(`  - User skills dir: ${USER_SKILLS_DIR}`);
  console.log(`  - Output dir: ${OUTPUT_DIR}`);

  const options = {
    cwd: OUTPUT_DIR,  // AI works in output directory
    pathToClaudeCodeExecutable: cliPath,
    env,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,

    // Use user-skills directory as plugin
    plugins: [
      { type: 'local' as const, path: USER_SKILLS_DIR }
    ],

    allowedTools: [
      'Skill',
      'Bash',
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep'
    ],

    settingSources: ['project' as const],
  };

  // Step 5: Run SDK query
  console.log('\n[Step 5] Run SDK query - Create PPT');

  const prompt = `Create a simple 2-slide PowerPoint presentation about "Hello World" and save it to ./hello.pptx.

Slide 1: Title slide with "Hello World"
Slide 2: A simple message "This is a test presentation"

IMPORTANT:
- The pptx skill is located at: ${USER_SKILLS_DIR}/pptx
- If you need to install dependencies, install them in the skill directory: ${USER_SKILLS_DIR}/pptx
- Check if ${USER_SKILLS_DIR}/pptx/node_modules exists first
- If not, run: cd "${USER_SKILLS_DIR}/pptx" && npm install

Keep it simple for testing.`;

  console.log('[User] Creating a simple 2-slide PPT...\n');

  const response = query({
    prompt,
    options,
  });

  let reply = '';

  for await (const message of response) {
    if (message.type === 'system' && message.subtype === 'init') {
      console.log(`[Init] Skills loaded: ${message.skills?.join(', ') || 'none'}`);
      console.log(`[Init] Tools: ${message.tools?.slice(0, 5).join(', ')}...`);
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
      console.log(`\n[Result] Duration: ${result.duration_ms}ms`);
      console.log(`[Result] Cost: $${result.total_cost_usd?.toFixed(4) || '0'}`);
    }
  }

  // Step 6: Verify results
  console.log('\n[Step 6] Verify results');

  // Check if dependencies were installed
  const depStatusAfter = checkSkillDependencies('pptx');
  console.log(`  - node_modules exists now: ${depStatusAfter.hasNodeModules}`);

  // Check if PPT was created
  const pptPath = path.join(OUTPUT_DIR, 'hello.pptx');
  const pptExists = fs.existsSync(pptPath);
  console.log(`  - PPT file created: ${pptExists}`);

  if (pptExists) {
    const stats = fs.statSync(pptPath);
    console.log(`  - PPT file size: ${stats.size} bytes`);
  }

  // Print summary
  console.log('\n=== Summary ===');
  console.log(`Dependencies installed: ${!depStatus.hasNodeModules && depStatusAfter.hasNodeModules ? 'YES (by AI)' : depStatusAfter.hasNodeModules ? 'Already existed' : 'NO'}`);
  console.log(`PPT created: ${pptExists ? 'YES' : 'NO'}`);
  console.log(`Test result: ${pptExists ? 'SUCCESS' : 'FAILED'}`);

  console.log('\n[Assistant Response Preview]');
  console.log(reply.slice(0, 300) + (reply.length > 300 ? '...' : ''));

  console.log('\n=== Demo completed ===');
}

runSkillDemo().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});
