/**
 * SDK stdio 通道诊断脚本
 * 目的：定位生产环境下 "Stream closed" 的根本原因
 */

const { query } = require('@anthropic-ai/claude-agent-sdk');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, `test-log-${Date.now()}.txt`);

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

log('========================================');
log('🔍 SDK Stdio 诊断测试');
log('========================================');
log(`Platform: ${process.platform}`);
log(`NODE_ENV: ${process.env.NODE_ENV}`);
log(`Node version: ${process.version}`);
log(`CWD: ${process.cwd()}`);
log(`Log file: ${logFile}`);
log('========================================\n');

async function testBasicQuery() {
  log('\n📝 测试1: 最基础的 query（无Hook、无canUseTool）');
  log('预期：SDK应该通过默认stdio权限提示\n');

  try {
    const response = query({
      prompt: "创建一个test1.txt文件，内容写入'hello world'",
      options: {
        cwd: __dirname,
        model: 'claude-sonnet-4-5-20250929',
        permissionMode: 'default',
        // 不添加任何Hook和canUseTool
        stderr: (data) => {
          log(`[SDK stderr] ${data}`);
        }
      }
    });

    let hasError = false;
    let messageCount = 0;

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
            log(`  💬 Assistant: ${textContent.text.substring(0, 100)}`);
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
          log(`  ❌ Error detected`);
          hasError = true;
        }
        if (msg.subtype === 'success') {
          log(`  ✅ Success`);
        }
      }
    }

    log(`\n总消息数: ${messageCount}`);

    if (!hasError) {
      log('✅ 测试1通过：SDK默认stdio通道正常\n');
      return true;
    } else {
      log('❌ 测试1失败：SDK报错\n');
      return false;
    }
  } catch (error) {
    log(`❌ 测试1异常: ${error.message}`);
    log(`Stack: ${error.stack}`);
    return false;
  }
}

async function testWithCustomSpawn() {
  log('\n📝 测试2: 使用自定义spawn（明确stdio配置）');
  log('预期：通过明确stdio配置解决通道问题\n');

  try {
    const response = query({
      prompt: "创建一个test2.txt文件，内容写入'custom spawn test'",
      options: {
        cwd: __dirname,
        model: 'claude-sonnet-4-5-20250929',
        permissionMode: 'default',
        stderr: (data) => {
          log(`[SDK stderr] ${data}`);
        },
        spawnClaudeCodeProcess: (options) => {
          log('🔧 Custom spawn called');
          log(`  Command: ${options.command}`);
          log(`  Args count: ${options.args.length}`);
          log(`  CWD: ${options.cwd}`);

          const proc = spawn(options.command, options.args, {
            cwd: options.cwd,
            env: options.env,
            stdio: ['pipe', 'pipe', 'pipe'], // 明确使用pipe
            windowsHide: true,
          });

          log(`  ✅ Process spawned, PID: ${proc.pid}`);
          log(`  📊 Streams: stdin=${!!proc.stdin}, stdout=${!!proc.stdout}, stderr=${!!proc.stderr}`);

          // 监听stream错误
          if (proc.stdin) {
            proc.stdin.on('error', (err) => {
              log(`  ❌ stdin error: ${err.message}`);
            });
            proc.stdin.on('close', () => {
              log(`  🔚 stdin closed`);
            });
          }

          if (proc.stdout) {
            proc.stdout.on('error', (err) => {
              log(`  ❌ stdout error: ${err.message}`);
            });
            proc.stdout.on('close', () => {
              log(`  🔚 stdout closed`);
            });
          }

          if (proc.stderr) {
            proc.stderr.on('error', (err) => {
              log(`  ❌ stderr error: ${err.message}`);
            });
            proc.stderr.on('close', () => {
              log(`  🔚 stderr closed`);
            });
          }

          proc.on('exit', (code, signal) => {
            log(`  🔚 Process exited, code: ${code}, signal: ${signal}`);
          });

          proc.on('error', (err) => {
            log(`  ❌ Process error: ${err.message}`);
          });

          return proc;
        },
      }
    });

    let hasError = false;
    let messageCount = 0;

    for await (const msg of response) {
      messageCount++;
      log(`Message #${messageCount}, type: ${msg.type}`);

      if (msg.type === 'result') {
        log(`  🎯 Result: ${msg.subtype}`);
        if (msg.subtype === 'error' || msg.is_error) {
          hasError = true;
        }
      }
    }

    log(`\n总消息数: ${messageCount}`);

    if (!hasError) {
      log('✅ 测试2通过：自定义spawn修复了问题\n');
      return true;
    } else {
      log('❌ 测试2失败：自定义spawn仍然报错\n');
      return false;
    }
  } catch (error) {
    log(`❌ 测试2异常: ${error.message}`);
    log(`Stack: ${error.stack}`);
    return false;
  }
}

async function testWithHook() {
  log('\n📝 测试3: 添加PreToolUse Hook');
  log('预期：验证Hook回调通道是否正常\n');

  try {
    let hookCallCount = 0;

    const response = query({
      prompt: "创建一个test3.txt文件，内容写入'hook test'",
      options: {
        cwd: __dirname,
        model: 'claude-sonnet-4-5-20250929',
        permissionMode: 'default',
        stderr: (data) => {
          log(`[SDK stderr] ${data}`);
        },
        hooks: {
          PreToolUse: [{
            matcher: '.*',
            hooks: [
              async (hookInput) => {
                hookCallCount++;
                log(`🪝 PreToolUse Hook called! (count: ${hookCallCount})`);
                log(`  Tool: ${hookInput.tool_name}`);
                log(`  Input keys: ${Object.keys(hookInput.tool_input || {}).join(', ')}`);

                return {
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                  }
                };
              }
            ]
          }]
        }
      }
    });

    let hasError = false;
    let messageCount = 0;

    for await (const msg of response) {
      messageCount++;
      log(`Message #${messageCount}, type: ${msg.type}`);

      if (msg.type === 'result') {
        log(`  🎯 Result: ${msg.subtype}`);
        if (msg.subtype === 'error' || msg.is_error) {
          hasError = true;
        }
      }
    }

    log(`\n总消息数: ${messageCount}`);
    log(`Hook调用次数: ${hookCallCount}`);

    if (!hasError && hookCallCount > 0) {
      log('✅ 测试3通过：Hook回调通道正常\n');
      return true;
    } else if (hookCallCount === 0) {
      log('⚠️  测试3警告：Hook未被调用\n');
      return false;
    } else {
      log('❌ 测试3失败：Hook报错\n');
      return false;
    }
  } catch (error) {
    log(`❌ 测试3异常: ${error.message}`);
    log(`Stack: ${error.stack}`);
    return false;
  }
}

async function runAllTests() {
  log('\n🚀 开始诊断测试...\n');

  const results = {
    basic: false,
    customSpawn: false,
    hook: false,
  };

  // 测试1: 基础query
  try {
    results.basic = await testBasicQuery();
  } catch (err) {
    log(`测试1执行失败: ${err.message}`);
  }

  await new Promise(resolve => setTimeout(resolve, 2000)); // 间隔2秒

  // 测试2: 自定义spawn
  try {
    results.customSpawn = await testWithCustomSpawn();
  } catch (err) {
    log(`测试2执行失败: ${err.message}`);
  }

  await new Promise(resolve => setTimeout(resolve, 2000)); // 间隔2秒

  // 测试3: Hook
  try {
    results.hook = await testWithHook();
  } catch (err) {
    log(`测试3执行失败: ${err.message}`);
  }

  // 汇总结果
  log('\n========================================');
  log('📊 诊断结果汇总');
  log('========================================');
  log(`测试1 (基础query):       ${results.basic ? '✅ PASS' : '❌ FAIL'}`);
  log(`测试2 (自定义spawn):     ${results.customSpawn ? '✅ PASS' : '❌ FAIL'}`);
  log(`测试3 (Hook回调):        ${results.hook ? '✅ PASS' : '❌ FAIL'}`);
  log('========================================\n');

  // 分析结论
  log('🔍 问题定位分析：');
  if (results.basic && results.customSpawn && results.hook) {
    log('✅ 所有测试通过，SDK通道正常工作');
    log('   问题可能在业务代码的其他配置上');
  } else if (!results.basic && results.customSpawn) {
    log('✅ 自定义spawn修复了问题');
    log('   根因：默认spawn的stdio配置在当前环境有问题');
    log('   方案：在生产代码中使用spawnClaudeCodeProcess配置');
  } else if (!results.basic && !results.customSpawn) {
    log('❌ 默认和自定义spawn都失败');
    log('   根因：可能是环境配置或SDK版本问题');
    log('   建议：检查环境配置、升级SDK版本、查看stderr日志');
  } else if (!results.hook) {
    log('⚠️  Hook回调失败');
    log('   根因：stdio回调通道在当前环境不可用');
    log('   影响：所有需要回调的机制（Hook + canUseTool）都会失败');
  }

  log(`\n完整日志已保存到: ${logFile}`);
  log('\n测试完成！');
}

// 执行测试
runAllTests().catch(err => {
  log(`测试运行失败: ${err.message}`);
  log(`Stack: ${err.stack}`);
  process.exit(1);
});
