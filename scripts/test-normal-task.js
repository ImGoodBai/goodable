#!/usr/bin/env node

/**
 * 测试脚本：提交一个正常任务并监控执行过程
 * 重点监控 install 和预览环节的错误日志
 */

const http = require('http');
const { randomBytes } = require('crypto');

const BASE_URL = 'http://localhost:3006';
const PROJECT_ID = `test-${Date.now()}-${randomBytes(6).toString('hex')}`;

console.log('\n=== 开始测试正常任务流程 ===\n');
console.log(`项目ID: ${PROJECT_ID}`);
console.log(`项目路径: /Users/good/good_cc_web_subproject/${PROJECT_ID}\n`);

// 简单的提示词，测试基础功能
const TEST_INSTRUCTION = `
创建一个简单的待办事项应用，要求：
1. 使用 Next.js 15 App Router
2. 使用 Tailwind CSS 进行样式设计
3. 包含添加、删除、完成待办事项的功能
4. 数据存储在本地状态中即可（不需要数据库）
`.trim();

// 用于监听 SSE 事件的函数
function listenToStream(projectId) {
  const logs = {
    phases: [],
    errors: [],
    events: [],
  };

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3006,
        path: `/api/chat/${projectId}/stream`,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      },
      (res) => {
        console.log('📡 SSE 连接已建立，开始监听事件...\n');

        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const timestamp = new Date().toLocaleTimeString('zh-CN');

                // 记录所有事件
                logs.events.push({ timestamp, type: data.type, data });

                // 输出关键事件
                if (data.type === 'message') {
                  console.log(`[${timestamp}] 💬 消息: ${data.data?.role || 'unknown'}`);
                } else if (data.type === 'sdk_completed') {
                  console.log(`[${timestamp}] ✅ SDK 完成: ${data.data?.message || ''}`);
                  logs.phases.push({ phase: 'sdk_completed', timestamp, data: data.data });
                } else if (data.type === 'preview_installing') {
                  console.log(`[${timestamp}] 📦 预览安装: ${data.data?.message || '开始安装依赖'}`);
                  logs.phases.push({ phase: 'preview_installing', timestamp, data: data.data });
                } else if (data.type === 'preview_starting') {
                  console.log(`[${timestamp}] 🚀 预览启动: ${data.data?.message || '启动开发服务器'}`);
                  logs.phases.push({ phase: 'preview_starting', timestamp, data: data.data });
                } else if (data.type === 'preview_ready') {
                  console.log(`[${timestamp}] ✨ 预览就绪: ${data.data?.message || '预览已就绪'}`);
                  console.log(`    预览URL: ${data.data?.url || 'unknown'}`);
                  logs.phases.push({ phase: 'preview_ready', timestamp, data: data.data });
                } else if (data.type === 'preview_running') {
                  console.log(`[${timestamp}] ▶️  预览运行: ${data.data?.url || ''}`);
                  logs.phases.push({ phase: 'preview_running', timestamp, data: data.data });
                } else if (data.type === 'preview_error') {
                  console.error(`[${timestamp}] ❌ 预览错误: ${data.data?.message || ''}`);
                  console.error(`    错误类型: ${data.data?.errorType || 'unknown'}`);
                  console.error(`    建议: ${data.data?.suggestion || 'N/A'}`);
                  logs.errors.push({ timestamp, data: data.data });
                } else if (data.type === 'log') {
                  const logData = data.data;
                  const level = logData?.level || 'info';
                  const content = logData?.content || '';
                  const phase = logData?.phase || '';
                  const errorType = logData?.errorType || '';

                  // 只输出重要的日志
                  if (
                    level === 'error' ||
                    errorType ||
                    content.toLowerCase().includes('error') ||
                    content.toLowerCase().includes('fail')
                  ) {
                    console.error(`[${timestamp}] 🔴 错误日志 [${phase || 'unknown'}]: ${content}`);
                    if (errorType) {
                      console.error(`    错误类型: ${errorType}`);
                    }
                    if (logData?.suggestion) {
                      console.error(`    建议: ${logData.suggestion}`);
                    }
                    logs.errors.push({ timestamp, phase, content, errorType, suggestion: logData?.suggestion });
                  } else if (
                    content.includes('npm install') ||
                    content.includes('npm run dev') ||
                    content.includes('Starting') ||
                    content.includes('Ready')
                  ) {
                    console.log(`[${timestamp}] 📝 日志 [${phase || 'unknown'}]: ${content.substring(0, 100)}`);
                  }
                }
              } catch (err) {
                // 忽略解析错误
              }
            }
          }
        });

        res.on('end', () => {
          console.log('\n📡 SSE 连接已关闭\n');
          resolve(logs);
        });

        res.on('error', (err) => {
          console.error('SSE 连接错误:', err);
          resolve(logs);
        });
      }
    );

    req.on('error', (err) => {
      console.error('SSE 请求错误:', err);
      resolve(logs);
    });

    req.end();

    // 30分钟后超时
    setTimeout(() => {
      console.log('\n⏱️  测试超时（30分钟），停止监听\n');
      req.destroy();
      resolve(logs);
    }, 30 * 60 * 1000);
  });
}

// 提交任务
async function submitTask() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      instruction: TEST_INSTRUCTION,
      cliPreference: 'claude',
    });

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3006,
        path: `/api/chat/${PROJECT_ID}/act`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (err) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// 主流程
async function main() {
  try {
    // 先启动 SSE 监听
    const logsPromise = listenToStream(PROJECT_ID);

    // 等待一秒确保 SSE 连接建立
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 提交任务
    console.log('📤 提交任务到 API...\n');
    const result = await submitTask();
    console.log('✅ 任务提交成功:', result);
    console.log(`   Request ID: ${result.requestId || 'N/A'}`);
    console.log(`   User Message ID: ${result.userMessageId || 'N/A'}\n`);

    // 等待日志收集完成（或超时）
    const logs = await logsPromise;

    // 输出总结
    console.log('\n=== 测试总结 ===\n');
    console.log(`📊 阶段统计:`);
    console.log(`   - 总事件数: ${logs.events.length}`);
    console.log(`   - 阶段事件数: ${logs.phases.length}`);
    console.log(`   - 错误事件数: ${logs.errors.length}\n`);

    if (logs.phases.length > 0) {
      console.log('✨ 已完成的阶段:');
      for (const phase of logs.phases) {
        console.log(`   - [${phase.timestamp}] ${phase.phase}`);
      }
      console.log('');
    }

    if (logs.errors.length > 0) {
      console.log('❌ 错误详情:');
      for (const error of logs.errors) {
        console.log(`   - [${error.timestamp}] ${error.phase || 'unknown'}`);
        console.log(`     ${error.content || error.data?.message || 'No message'}`);
        if (error.errorType || error.data?.errorType) {
          console.log(`     类型: ${error.errorType || error.data?.errorType}`);
        }
        if (error.suggestion || error.data?.suggestion) {
          console.log(`     建议: ${error.suggestion || error.data?.suggestion}`);
        }
        console.log('');
      }
    }

    console.log(`\n📁 项目目录: /Users/good/good_cc_web_subproject/${PROJECT_ID}`);
    console.log('💡 建议：进入项目目录手动检查和调试\n');

    // 保存日志到文件
    const fs = require('fs');
    const logFilePath = `/Users/good/Documents/vscode_projects/100agent/Claudable/test_normal_task_${Date.now()}.json`;
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
    console.log(`📝 完整日志已保存到: ${logFilePath}\n`);
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

main();
