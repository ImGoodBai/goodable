/**
 * SDK 测试逻辑 - Electron 环境版本
 * 使用动态 import 支持 ES Module
 */

const { spawn } = require('child_process');

/**
 * 运行 SDK 测试
 * @param {Object} config - 测试配置
 */
async function runSDKTest(config) {
  const { name, useCustomSpawn, useHook, logFn, workDir } = config;
  const log = logFn || console.log;

  log(`\n📝 测试: ${name}`);
  log(`工作目录: ${workDir}`);
  log(`使用自定义spawn: ${useCustomSpawn ? '是' : '否'}`);
  log(`使用Hook: ${useHook ? '是' : '否'}`);
  log('');

  const startTime = Date.now();
  let hookCallCount = 0;
  let messageCount = 0;
  let hasError = false;
  let errorDetails = null;

  try {
    // 动态导入 ES Module
    log('正在加载 Claude Agent SDK...');
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    log('SDK 加载成功');

    const queryOptions = {
      cwd: workDir,
      model: 'claude-sonnet-4-5-20250929',
      permissionMode: 'default',
      stderr: (data) => {
        const line = String(data).trimEnd();
        if (line) {
          log(`[SDK stderr] ${line}`);
        }
      },
    };

    // 如果使用自定义spawn
    if (useCustomSpawn) {
      queryOptions.spawnClaudeCodeProcess = (options) => {
        const spawnStartTime = Date.now();
        const timeLog = (msg) => log(`  [+${Date.now()-spawnStartTime}ms] ${msg}`);

        log('🔧 使用自定义spawn配置');
        log(`  Command: ${options.command}`);
        log(`  Args count: ${options.args.length}`);
        log(`  CWD: ${options.cwd}`);

        // 修正ASAR路径：将 .asar 替换为 .asar.unpacked
        const fixedArgs = options.args.map(arg => {
          if (typeof arg === 'string' && arg.includes('.asar\\node_modules')) {
            const fixed = arg.replace(/\.asar\\node_modules/g, '.asar.unpacked\\node_modules');
            if (fixed !== arg) {
              log(`  🔧 ASAR path fixed: ${arg.substring(arg.length - 60)} -> ...unpacked...`);
            }
            return fixed;
          }
          return arg;
        });

        const proc = spawn(options.command, fixedArgs, {
          cwd: options.cwd,
          env: options.env,
          stdio: ['pipe', 'pipe', 'pipe'], // 明确使用pipe
          windowsHide: true,
        });

        timeLog(`✅ Process spawned, PID: ${proc.pid}`);
        timeLog(`📊 Initial stream state:`);
        timeLog(`   stdin: writable=${proc.stdin?.writable}, destroyed=${proc.stdin?.destroyed}`);
        timeLog(`   stdout: readable=${proc.stdout?.readable}, destroyed=${proc.stdout?.destroyed}`);
        timeLog(`   stderr: readable=${proc.stderr?.readable}, destroyed=${proc.stderr?.destroyed}`);

        // 【增强】监听stdin状态变化
        if (proc.stdin) {
          proc.stdin.on('close', () => {
            timeLog('🔚 stdin CLOSED');
            timeLog(`   stdin state: writable=${proc.stdin.writable}, destroyed=${proc.stdin.destroyed}`);
          });
          proc.stdin.on('finish', () => {
            timeLog('🔚 stdin FINISHED (ended from write side)');
          });
          proc.stdin.on('error', (err) => {
            timeLog(`❌ stdin ERROR: ${err.message}`);
            timeLog(`   stdin state: writable=${proc.stdin.writable}, destroyed=${proc.stdin.destroyed}`);
          });
          proc.stdin.on('drain', () => {
            timeLog('💧 stdin DRAIN (buffer emptied)');
          });
        }

        // 【增强】监听stdout状态变化
        if (proc.stdout) {
          proc.stdout.on('close', () => {
            timeLog('🔚 stdout CLOSED');
          });
          proc.stdout.on('end', () => {
            timeLog('🔚 stdout ENDED (no more data)');
          });
          proc.stdout.on('error', (err) => {
            timeLog(`❌ stdout ERROR: ${err.message}`);
          });
        }

        // 【增强】监听stderr
        if (proc.stderr) {
          proc.stderr.on('close', () => {
            timeLog('🔚 stderr CLOSED');
          });
          proc.stderr.on('error', (err) => {
            timeLog(`❌ stderr ERROR: ${err.message}`);
          });
        }

        // 【增强】监听进程状态
        proc.on('exit', (code, signal) => {
          timeLog(`🔚 Process EXIT: code=${code}, signal=${signal}`);
        });

        proc.on('error', (err) => {
          timeLog(`❌ Process ERROR: ${err.message}`);
        });

        // 【新增】定期检查stream状态（每500ms）
        const stateCheckInterval = setInterval(() => {
          if (proc.killed || proc.exitCode !== null) {
            clearInterval(stateCheckInterval);
            return;
          }
          timeLog(`🔍 Periodic check: stdin.writable=${proc.stdin?.writable}, stdout.readable=${proc.stdout?.readable}`);
        }, 500);

        proc.on('exit', () => clearInterval(stateCheckInterval));

        return proc;
      };
    } else {
      log('使用SDK默认spawn配置');
    }

    // 如果使用Hook
    if (useHook) {
      queryOptions.hooks = {
        PreToolUse: [{
          matcher: '.*',
          hooks: [
            async (hookInput) => {
              hookCallCount++;
              const hookStartTime = Date.now();
              log(`🪝 [+${hookStartTime-startTime}ms] PreToolUse Hook CALLED (count: ${hookCallCount})`);
              log(`  Tool: ${hookInput.tool_name}`);
              log(`  Input: ${JSON.stringify(hookInput.tool_input).substring(0, 100)}...`);

              // 【新增】尝试返回结果，看是否触发Stream closed
              try {
                const result = {
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                  }
                };
                log(`  ✅ [+${Date.now()-hookStartTime}ms] Hook returning result`);
                return result;
              } catch (err) {
                log(`  ❌ Hook return error: ${err.message}`);
                throw err;
              }
            }
          ]
        }]
      };
    }

    // 【新增】添加 canUseTool 回调用于调试 permissionMode: 'default'
    queryOptions.canUseTool = async (toolName, input, opts) => {
      const permStartTime = Date.now();
      log(`🔐 [+${permStartTime-startTime}ms] canUseTool CALLED`);
      log(`  Tool: ${toolName}`);
      log(`  Input: ${JSON.stringify(input).substring(0, 100)}...`);

      try {
        const result = { behavior: 'allow', updatedInput: input };
        log(`  ✅ [+${Date.now()-permStartTime}ms] canUseTool returning: allow`);
        return result;
      } catch (err) {
        log(`  ❌ canUseTool return error: ${err.message}`);
        throw err;
      }
    };

    const response = query({
      prompt: "创建一个hello.txt文件，内容写入'Hello from Electron'",
      options: queryOptions,
    });

    for await (const msg of response) {
      messageCount++;
      log(`Message #${messageCount}, type: ${msg.type}`);

      if (msg.type === 'system' && msg.subtype === 'init') {
        log(`  ✅ Session initialized: ${msg.session_id}`);
      }

      if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          const textContent = content.find(c => c.type === 'text');
          if (textContent?.text) {
            log(`  💬 Assistant: ${textContent.text.substring(0, 80)}`);
          }
          const toolUse = content.find(c => c.type === 'tool_use');
          if (toolUse) {
            log(`  🔧 Tool use: ${toolUse.name}`);
          }
        }
      }

      if (msg.type === 'result') {
        log(`  🎯 Result: ${msg.subtype}`);
        if (msg.subtype === 'error' || msg.is_error) {
          hasError = true;
          errorDetails = msg;
        }
        if (msg.subtype === 'success') {
          log(`  ✅ Success`);
        }
      }
    }

    const duration = Date.now() - startTime;
    log(`\n总消息数: ${messageCount}`);
    if (useHook) {
      log(`Hook调用次数: ${hookCallCount}`);
    }
    log(`耗时: ${(duration / 1000).toFixed(2)}s`);

    const success = !hasError && messageCount > 0;
    log(success ? '\n✅ 测试通过' : '\n❌ 测试失败');

    return {
      success,
      messageCount,
      hookCallCount,
      duration,
      hasError,
      errorDetails,
    };

  } catch (error) {
    log(`\n❌ 测试异常: ${error.message}`);
    log(`Stack: ${error.stack}`);

    return {
      success: false,
      error: error.message,
      stack: error.stack,
    };
  }
}

module.exports = {
  runSDKTest,
};
