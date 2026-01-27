/**
 * Chat API Route - Claude Agent SDK Demo
 * Phase 2: SDK called from Next.js API Route (like Goodable)
 * With user permission confirmation
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import { createPendingPermission } from '../permissions';

// Log helper
function log(type: string, ...args: any[]) {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(`[${type}] ${message}`);
}

// Read-only tools that auto-approve
const AUTO_APPROVE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);

export async function POST(request: NextRequest) {
  const { prompt, autoApprove = false } = await request.json();

  log('USER', prompt);
  log('CONFIG', `Auto-approve mode: ${autoApprove}`);

  try {
    // Use main project's SDK cli.js (demo doesn't have its own)
    const cliPath = '/Users/good/Downloads/goodable/node_modules/@anthropic-ai/claude-agent-sdk/cli.js';
    const cwd = process.cwd();

    log('SDK', 'CLI path:', cliPath);
    log('SDK', 'Working directory:', cwd);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || 'http://api.100agent.co',
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN || '',
    };

    log('ENV', 'ANTHROPIC_BASE_URL:', env.ANTHROPIC_BASE_URL);

    // canUseTool with user confirmation
    const canUseTool = async (toolName: string, input: any, options: any) => {
      log('TOOL', `canUseTool called: ${toolName}`);
      log('TOOL', `options keys: ${Object.keys(options || {}).join(', ')}`);
      log('TOOL', `toolUseID: ${options?.toolUseID}`);

      // Auto-approve if in auto mode or read-only tool
      if (autoApprove || AUTO_APPROVE_TOOLS.has(toolName)) {
        log('TOOL', `Auto-approved: ${toolName}`);
        return { behavior: 'allow' as const, updatedInput: input };
      }

      // Get tool ID from options
      const toolId = options?.toolUseID || `tool_${Date.now()}`;

      // Wait for user confirmation
      log('TOOL', `Waiting for user approval: ${toolName} (id: ${toolId})`);
      const approved = await createPendingPermission(toolId, toolName, input);

      if (approved) {
        log('TOOL', `User approved: ${toolName}`);
        return { behavior: 'allow' as const, updatedInput: input };
      } else {
        log('TOOL', `User denied: ${toolName}`);
        return { behavior: 'deny' as const, message: 'User denied permission' };
      }
    };

    // PreToolUse hook for logging
    const preToolUseHook = async (input: any, toolUseID: string, options: any) => {
      if (input.hook_event_name !== 'PreToolUse') {
        return {};
      }

      log('HOOK', `PreToolUse: ${input.tool_name} (id: ${toolUseID})`);
      log('HOOK', `Permission mode: ${input.permission_mode}`);

      return {};
    };

    log('SDK', 'Starting query...');

    // Test with main program's extra parameters (plugins, allowedTools, settingSources)
    const testWithMainProgramParams = true;

    const baseOptions: any = {
      cwd,
      pathToClaudeCodeExecutable: cliPath,
      env,
      permissionMode: 'default',
      canUseTool,
      hooks: {
        PreToolUse: [{
          hooks: [preToolUseHook]
        }]
      }
    };

    // Add main program's extra parameters to test if they cause the issue
    if (testWithMainProgramParams) {
      log('SDK', '>>> Testing with main program params: allowedTools, settingSources');
      baseOptions.allowedTools = ['Skill', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];
      baseOptions.settingSources = ['project'];
      baseOptions.additionalDirectories = [cwd];
      // Note: plugins not added as demo doesn't have plugin dir
    }

    const response = query({
      prompt,
      options: baseOptions,
    });

    let reply = '';
    let toolCallCount = 0;
    const logs: { type: string; message: string; timestamp: string }[] = [];

    const addLog = (type: string, message: string) => {
      log(type, message);
      logs.push({ type, message, timestamp: new Date().toISOString() });
    };

    for await (const message of response) {
      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              reply += block.text;
            } else if (block.type === 'tool_use') {
              toolCallCount++;
              addLog('STREAM', `Tool use: ${block.name}`);
            }
          }
        }
      } else if (message.type === 'result') {
        addLog('RESULT', `Session ID: ${message.session_id}`);
        addLog('RESULT', `Tool calls: ${toolCallCount}`);
      } else if ((message as any).type === 'error') {
        addLog('ERROR', (message as any).error?.message || 'Unknown error');
      }
    }

    addLog('ASSISTANT', reply.substring(0, 200) + (reply.length > 200 ? '...' : ''));

    return NextResponse.json({ success: true, reply, toolCallCount, logs });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('ERROR', errorMsg);

    if (errorMsg.includes('Stream closed')) {
      log('ERROR', '>>> Stream closed detected!');
    }

    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
