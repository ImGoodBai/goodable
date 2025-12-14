#!/usr/bin/env node

/**
 * 测试脚本：验证 AI 在不同场景下的 exitplan 工具调用行为
 * 
 * 测试流程：
 * 1. 启动独立的测试服务实例
 * 2. 发送简单问候"你好"，验证不应触发 exitplan
 * 3. 请求生成 helloworld，可能触发 exitplan
 * 4. 循环请求"生成最终计划"直到触发 exitplan
 * 5. 生成测试报告并关闭服务
 */

const http = require('http');
const { spawn } = require('child_process');
const { randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

// 使用独立的测试端口，避免与开发服务冲突
const TEST_PORT = 3007;
let CURRENT_PORT = TEST_PORT;
const PROJECT_ID = `test-exitplan-${Date.now()}-${randomBytes(6).toString('hex')}`;
const REPORT_DIR = path.join(__dirname, 'test-reports');

let serverProcess = null;

console.log('\n=== 开始测试 ExitPlan 工具调用流程 ===\n');
console.log(`项目ID: ${PROJECT_ID}`);
console.log(`测试端口: ${TEST_PORT}`);
console.log(`测试时间: ${new Date().toLocaleString('zh-CN')}\n`);

// 测试报告数据
const testReport = {
    projectId: PROJECT_ID,
    testPort: TEST_PORT,
    startTime: new Date().toISOString(),
    endTime: null,
    steps: [],
    result: 'running',
    summary: {},
};

/**
 * 检查服务器是否就绪
 */
async function checkServerHealth() {
    return new Promise((resolve) => {
        const req = http.request(
            {
                hostname: 'localhost',
                port: CURRENT_PORT,
                path: '/api/projects',
                method: 'GET',
                timeout: 2000,
            },
            (res) => {
                resolve(res.statusCode === 200 || res.statusCode === 404);
            }
        );

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

/**
 * 启动测试服务器
 */
async function startTestServer() {
    return new Promise((resolve, reject) => {
        console.log('🚀 启动测试服务器...\n');

        // 记录启动日志
        const serverStartupLogs = {
            stdout: [],
            stderr: [],
            startTime: new Date().toISOString(),
            endTime: null,
            success: false,
            error: null,
        };

        const env = {
            ...process.env,
            PORT: TEST_PORT.toString(),
            NODE_ENV: 'test',
        };

        serverProcess = spawn('npm', ['run', 'dev', '--', '--port', TEST_PORT.toString()], {
          cwd: path.join(__dirname, '..'),
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let isResolved = false;

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            const timestamp = new Date().toISOString();

            // 记录到日志
            serverStartupLogs.stdout.push({ timestamp, content: output });

            // 实时显示
            console.log('[STDOUT]', output.trim());

            try {
                const m1 = output.match(/Starting Next\.js dev server on http:\/\/localhost:(\d+)/);
                const m2 = output.match(/Local:\s*http:\/\/localhost:(\d+)/);
                const portStr = (m1 && m1[1]) || (m2 && m2[1]);
                if (portStr) {
                    const parsed = parseInt(portStr, 10);
                    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 65535) {
                        if (CURRENT_PORT !== parsed) {
                            CURRENT_PORT = parsed;
                            console.log(`🔄  检测到服务端口变更为 ${CURRENT_PORT}`);
                        }
                    }
                }
            } catch {}
        });

        serverProcess.stderr.on('data', (data) => {
            const output = data.toString();
            const timestamp = new Date().toISOString();

            // 记录到日志
            serverStartupLogs.stderr.push({ timestamp, content: output });

            // 实时显示
            console.error('[STDERR]', output.trim());
        });

        serverProcess.on('error', (err) => {
            if (!isResolved) {
                isResolved = true;
                serverStartupLogs.error = err.message;
                serverStartupLogs.endTime = new Date().toISOString();
                testReport.serverStartupLogs = serverStartupLogs;
                reject(new Error(`Failed to start server: ${err.message}`));
            }
        });

        serverProcess.on('exit', (code) => {
            if (!isResolved && code !== 0) {
                isResolved = true;
                serverStartupLogs.error = `Server exited with code ${code}`;
                serverStartupLogs.endTime = new Date().toISOString();
                testReport.serverStartupLogs = serverStartupLogs;
                reject(new Error(`Server exited with code ${code}`));
            }
        });

        // 等待服务器启动并进行健康检查
        const startTime = Date.now();
        const maxWaitTime = 60000; // 60秒

        const healthCheck = setInterval(async () => {
            const isHealthy = await checkServerHealth();

            if (isHealthy) {
                clearInterval(healthCheck);
                if (!isResolved) {
                    isResolved = true;
                    serverStartupLogs.success = true;
                    serverStartupLogs.endTime = new Date().toISOString();
                    testReport.serverStartupLogs = serverStartupLogs;

                    console.log(`\n✅ 测试服务器已启动并就绪 (端口 ${TEST_PORT})\n`);

                    // 保存启动日志到文件
                    const logPath = path.join(REPORT_DIR, `server-startup-${Date.now()}.json`);
                    if (!fs.existsSync(REPORT_DIR)) {
                        fs.mkdirSync(REPORT_DIR, { recursive: true });
                    }
                    fs.writeFileSync(logPath, JSON.stringify(serverStartupLogs, null, 2));
                    console.log(`📝 服务器启动日志已保存到: ${logPath}\n`);

                    // 再等待2秒确保完全就绪
                    setTimeout(() => resolve(), 2000);
                }
            } else if (Date.now() - startTime > maxWaitTime) {
                clearInterval(healthCheck);
                if (!isResolved) {
                    isResolved = true;
                    serverStartupLogs.error = 'Health check timeout';
                    serverStartupLogs.endTime = new Date().toISOString();
                    testReport.serverStartupLogs = serverStartupLogs;

                    // 保存启动日志到文件（即使失败也保存）
                    const logPath = path.join(REPORT_DIR, `server-startup-failed-${Date.now()}.json`);
                    if (!fs.existsSync(REPORT_DIR)) {
                        fs.mkdirSync(REPORT_DIR, { recursive: true });
                    }
                    fs.writeFileSync(logPath, JSON.stringify(serverStartupLogs, null, 2));
                    console.log(`\n📝 服务器启动日志（失败）已保存到: ${logPath}\n`);

                    reject(new Error('Server health check timeout'));
                }
            } else {
                // 显示等待进度
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                process.stdout.write(`\r⏳ 等待服务器就绪... ${elapsed}秒`);
            }
        }, 2000); // 每2秒检查一次
    });
}

/**
 * 停止测试服务器
 */
async function stopTestServer() {
    if (serverProcess) {
        console.log('\n🛑 停止测试服务器...\n');

        return new Promise((resolve) => {
            serverProcess.kill('SIGTERM');

            // 等待进程退出或超时
            const timeout = setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    console.log('⚠️  SIGTERM 无效，强制杀死进程...\n');
                    serverProcess.kill('SIGKILL');
                }
                resolve();
            }, 3000);

            serverProcess.on('exit', () => {
                clearTimeout(timeout);
                console.log('✅ 测试服务器已停止\n');
                resolve();
            });
        });
    }
}

async function createProject() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            project_id: PROJECT_ID,
            name: PROJECT_ID,
            preferredCli: 'claude'
        });
        const req = http.request(
            {
                hostname: 'localhost',
                port: CURRENT_PORT,
                path: '/api/projects',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const ok = Boolean(result?.success) && result?.data?.id === PROJECT_ID;
                        if (res.statusCode === 201 && ok) {
                            console.log('✅ 创建项目成功\n');
                            resolve(true);
                        } else {
                            reject(new Error(`创建项目失败: code=${res.statusCode} body=${data}`));
                        }
                    } catch (err) {
                        reject(new Error(`解析创建项目响应失败: ${data}`));
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * 检查消息中是否包含 exitplan 相关的工具调用
 */
function containsExitPlanTool(message) {
    if (!message || !message.metadata) {
        return false;
    }

    const metadata = message.metadata;

    // 检查工具名称
    const toolName = metadata.toolName || metadata.tool_name || '';
    if (typeof toolName === 'string') {
        const lowerToolName = toolName.toLowerCase();
        if (lowerToolName.includes('exitplan') ||
            lowerToolName.includes('exit_plan') ||
            lowerToolName.includes('plan') && lowerToolName.includes('exit')) {
            return true;
        }
    }

    // 检查 planPhase 或 planStatus
    if (metadata.planPhase === 'completed' || metadata.planStatus === 'completed') {
        return true;
    }

    // 检查内容中是否包含计划完成的标志
    const content = message.content || '';
    if (typeof content === 'string') {
        const lowerContent = content.toLowerCase();
        if ((lowerContent.includes('plan') && lowerContent.includes('completed')) ||
            lowerContent.includes('exit') && lowerContent.includes('plan')) {
            return true;
        }
    }

    return false;
}

/**
 * 监听 SSE 流并收集消息
 */
function listenToStream(projectId, onMessage) {
    return new Promise((resolve, reject) => {
        const messages = [];
        let isResolved = false;

        const req = http.request(
            {
                hostname: 'localhost',
                port: CURRENT_PORT,
                path: `/api/chat/${projectId}/stream`,
                method: 'GET',
                headers: {
                    Accept: 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            },
            (res) => {
                console.log('📡 SSE 连接已建立\n');

                let buffer = '';

                res.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));

                                // 收集消息
                                if (data.type === 'message' && data.data) {
                                    messages.push(data.data);

                                    // 调用回调函数
                                    if (onMessage) {
                                        const shouldStop = onMessage(data.data);
                                        if (shouldStop && !isResolved) {
                                            isResolved = true;
                                            req.destroy();
                                            resolve(messages);
                                        }
                                    }
                                }
                            } catch (err) {
                                // 忽略解析错误
                            }
                        }
                    }
                });

                res.on('end', () => {
                    if (!isResolved) {
                        console.log('\n📡 SSE 连接已关闭\n');
                        isResolved = true;
                        resolve(messages);
                    }
                });

                res.on('error', (err) => {
                    if (!isResolved) {
                        console.error('SSE 连接错误:', err);
                        isResolved = true;
                        reject(err);
                    }
                });
            }
        );

        req.on('error', (err) => {
            if (!isResolved) {
                console.error('SSE 请求错误:', err);
                isResolved = true;
                reject(err);
            }
        });

        req.end();

        // 设置超时（5分钟）
        setTimeout(() => {
            if (!isResolved) {
                console.log('\n⏱️  SSE 监听超时（5分钟）\n');
                isResolved = true;
                req.destroy();
                resolve(messages);
            }
        }, 5 * 60 * 1000);
    });
}

/**
 * 提交任务到 API
 */
async function submitTask(instruction) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            instruction: instruction,
            cliPreference: 'claude',
        });

        const req = http.request(
            {
                hostname: 'localhost',
                port: CURRENT_PORT,
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

/**
 * 等待 AI 回复完成（异步任务）
 */
async function waitForAIResponse(timeoutMs = 300000) {
    return new Promise((resolve) => {
        let hasExitPlan = false;
        let lastAssistantMessage = null;
        let messageCount = 0;
        let assistantCount = 0;
        let taskCompletedCount = 0;
        let sseConnected = false;

        console.log('📡 启动 SSE 监听...\n');

        const streamPromise = listenToStream(PROJECT_ID, (message) => {
            const timestamp = new Date().toLocaleTimeString('zh-CN');
            messageCount++;

            if (!sseConnected) {
                sseConnected = true;
                console.log('✅ SSE 连接成功\n');
            }

            // 检测 task_started
            if (message.type === 'task_started') {
                console.log(`[${timestamp}] 🚀 任务开始: ${message.data?.requestId || 'N/A'}`);
            }

            // 检测 planning_completed 状态
            if (message.type === 'status' && message.data?.status === 'planning_completed') {
                hasExitPlan = true;
                console.log(`[${timestamp}] ✅✅✅ 检测到 planning_completed 状态!`);
            }

            // 记录助手消息
            if (message.role === 'assistant') {
                assistantCount++;
                lastAssistantMessage = message;
                const preview = typeof message.content === 'string' ? message.content.substring(0, 50) : '';
                console.log(`[${timestamp}] 💬 收到 AI 回复: ${preview}...`);

                // 检查是否包含 exitplan
                if (containsExitPlanTool(message)) {
                    hasExitPlan = true;
                    console.log(`[${timestamp}] ✅✅✅ 检测到 ExitPlanMode 工具调用`);
                }
            }

            // 检查工具消息
            if (message.role === 'tool' || message.messageType === 'tool_use') {
                const toolName = message.metadata?.toolName || message.metadata?.tool_name || 'Unknown';
                console.log(`[${timestamp}] 🔧 工具调用: ${toolName}`);

                if (containsExitPlanTool(message)) {
                    hasExitPlan = true;
                    console.log(`[${timestamp}] ✅✅✅ 检测到 ExitPlanMode 工具调用（工具消息）`);
                }
            }

            // 检测任务完成或中断
            if (message.type === 'task_completed' || message.type === 'task_interrupted') {
                taskCompletedCount++;
                console.log(`[${timestamp}] 🏁 任务${message.type === 'task_completed' ? '完成' : '中断'} (第${taskCompletedCount}次)`);

                // 如果已检测到 ExitPlan，直接结束
                if (hasExitPlan) {
                    console.log(`[${timestamp}] ✅ ExitPlan已检测到，结束监听\n`);
                    return true; // 停止监听
                } else {
                    // 未检测到 ExitPlan，发送追问
                    console.log(`[${timestamp}] ⚠️  ExitPlan未检测到，发送追问...\n`);
                    sendFollowUpMessage().catch(err => {
                        console.error('追问失败:', err.message);
                    });
                }
            }

            return false; // 继续监听
        }).catch((err) => {
            console.error('监听流时出错:', err.message);
        });

        // 超时处理
        setTimeout(() => {
            console.log(`\n⏱️  等待超时（${timeoutMs / 1000}秒），停止监听\n`);
            resolve({ hasExitPlan, lastMessage: lastAssistantMessage, messageCount, assistantCount });
        }, timeoutMs);
    });
}

/**
 * 发送追问消息
 */
async function sendFollowUpMessage() {
    const instruction = '不要再问我,请按标准版设计,给我最终计划就好';
    console.log(`📤 发送追问: "${instruction}"\n`);

    try {
        const result = await submitTask(instruction);
        console.log(`✅ 追问已提交 (Request ID: ${result.requestId || 'N/A'})\n`);
        return result;
    } catch (err) {
        console.error(`❌ 追问提交失败: ${err.message}\n`);
        throw err;
    }
}

/**
 * 执行测试步骤
 */
async function executeStep(stepNumber, description, instruction, expectedExitPlan) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`步骤 ${stepNumber}: ${description}`);
    console.log(`${'='.repeat(60)}\n`);

    const stepData = {
        step: stepNumber,
        description,
        instruction,
        expectedExitPlan,
        startTime: new Date().toISOString(),
        endTime: null,
        result: 'running',
        hasExitPlan: false,
        response: null,
        error: null,
    };

    try {
        // 先启动 SSE 监听（异步任务需要先监听再提交）
        console.log('📡 准备监听 AI 响应...\n');
        const responsePromise = waitForAIResponse();

        // 等待一小段时间确保 SSE 连接建立
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 提交任务（任务会在后台异步执行）
        console.log(`📤 提交指令: "${instruction}"\n`);
        const submitResult = await submitTask(instruction);
        console.log(`✅ 任务已提交到后台异步执行 (Request ID: ${submitResult.requestId || 'N/A'})\n`);

        // 等待 AI 异步回复
        console.log('⏳ 等待 AI 异步回复...\n');
        const { hasExitPlan, lastMessage, messageCount, assistantCount } = await responsePromise;

        console.log(`\n📊 收到 ${messageCount || 0} 条消息\n`);

        stepData.hasExitPlan = hasExitPlan;
        stepData.response = lastMessage;
        stepData.endTime = new Date().toISOString();

        if (expectedExitPlan === null) {
            // 不强制要求 ExitPlan,只要收到消息即可
            if (assistantCount > 0 || messageCount > 0) {
                stepData.result = 'passed';
                console.log(`\n✅ 步骤 ${stepNumber} 完成: 收到 ${messageCount} 条消息 (助手消息: ${assistantCount})`);
            } else {
                stepData.result = 'failed';
                console.log(`\n❌ 步骤 ${stepNumber} 失败: 未收到任何消息`);
            }
        } else if (expectedExitPlan === hasExitPlan) {
            // ExitPlan 判定符合即可
            stepData.result = 'passed';
            console.log(`\n✅ 步骤 ${stepNumber} 通过: ExitPlan 判定符合 (期望:${expectedExitPlan}, 实际:${hasExitPlan})`);
        } else {
            stepData.result = 'failed';
            console.log(`\n❌ 步骤 ${stepNumber} 失败: ExitPlan 判定不符 (期望:${expectedExitPlan}, 实际:${hasExitPlan})`);
        }

    } catch (error) {
        stepData.result = 'error';
        stepData.error = error.message || String(error);
        stepData.endTime = new Date().toISOString();
        console.error(`\n❌ 步骤 ${stepNumber} 出错:`, error.message || error);
    }

    testReport.steps.push(stepData);
    return stepData;
}

/**
 * 循环请求直到检测到 ExitPlan
 */
async function loopUntilExitPlan(maxAttempts = 5) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`步骤 3: 循环请求"生成最终计划"直到检测到 ExitPlan`);
    console.log(`${'='.repeat(60)}\n`);

    const stepData = {
        step: 3,
        description: '循环请求最终计划',
        startTime: new Date().toISOString(),
        endTime: null,
        result: 'running',
        attempts: [],
        totalAttempts: 0,
        foundExitPlan: false,
    };

    for (let i = 1; i <= maxAttempts; i++) {
        console.log(`\n--- 尝试 ${i}/${maxAttempts} ---\n`);

        // 第一次尝试用模糊指令,后续尝试用具体指令
        const instruction = i === 1
            ? '请帮我生成最终计划'
            : '我要做一个待办事项列表应用,请帮我生成最终实现计划';

        const attemptData = {
            attemptNumber: i,
            instruction: instruction,
            startTime: new Date().toISOString(),
            endTime: null,
            hasExitPlan: false,
            response: null,
        };

        try {
            // 先启动 SSE 监听
            console.log('📡 准备监听 AI 响应...\n');
            const responsePromise = waitForAIResponse();

            // 等待一小段时间确保 SSE 连接建立
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 提交任务
            console.log(`📤 提交指令: "${instruction}"\n`);
            const submitResult = await submitTask(instruction);
            console.log(`✅ 任务已提交到后台异步执行 (Request ID: ${submitResult.requestId || 'N/A'})\n`);

            // 等待 AI 异步回复
            console.log('⏳ 等待 AI 异步回复...\n');
            const { hasExitPlan, lastMessage, messageCount, assistantCount } = await responsePromise;

            console.log(`\n📊 收到 ${messageCount || 0} 条消息\n`);

            attemptData.hasExitPlan = hasExitPlan;
            attemptData.assistantCount = assistantCount;
            attemptData.response = lastMessage;
            attemptData.endTime = new Date().toISOString();

            if (hasExitPlan) {
                console.log(`\n✅ 第 ${i} 次尝试成功检测到 ExitPlan！`);
                stepData.foundExitPlan = true;
                stepData.totalAttempts = i;
                stepData.result = 'passed';
                stepData.attempts.push(attemptData);
                break;
            } else {
                console.log(`\n⚠️  第 ${i} 次尝试未检测到 ExitPlan，继续尝试...`);
                stepData.attempts.push(attemptData);
            }

        } catch (error) {
            attemptData.error = error.message || String(error);
            attemptData.endTime = new Date().toISOString();
            console.error(`\n❌ 第 ${i} 次尝试出错:`, error.message || error);
            stepData.attempts.push(attemptData);
        }

        // 等待一段时间再继续
        if (i < maxAttempts && !stepData.foundExitPlan) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    stepData.endTime = new Date().toISOString();

    if (!stepData.foundExitPlan) {
        stepData.result = 'failed';
        stepData.totalAttempts = maxAttempts;
        console.log(`\n❌ 步骤 3 失败: 经过 ${maxAttempts} 次尝试仍未检测到 ExitPlan`);
    }

    testReport.steps.push(stepData);
    return stepData;
}

/**
 * 生成测试报告
 */
function generateReport() {
    testReport.endTime = new Date().toISOString();

    // 计算总结
    const totalSteps = testReport.steps.length;
    const passedSteps = testReport.steps.filter(s => s.result === 'passed').length;
    const failedSteps = testReport.steps.filter(s => s.result === 'failed').length;
    const errorSteps = testReport.steps.filter(s => s.result === 'error').length;

    testReport.summary = {
        totalSteps,
        passedSteps,
        failedSteps,
        errorSteps,
        successRate: totalSteps > 0 ? ((passedSteps / totalSteps) * 100).toFixed(2) + '%' : '0%',
    };

    // 判断整体结果
    if (failedSteps > 0 || errorSteps > 0) {
        testReport.result = 'failed';
    } else if (passedSteps === totalSteps) {
        testReport.result = 'passed';
    } else {
        testReport.result = 'partial';
    }

    // 保存报告
    if (!fs.existsSync(REPORT_DIR)) {
        fs.mkdirSync(REPORT_DIR, { recursive: true });
    }

    const reportPath = path.join(REPORT_DIR, `exitplan-test-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(testReport, null, 2));

    // 打印报告
    console.log(`\n${'='.repeat(60)}`);
    console.log('测试报告');
    console.log(`${'='.repeat(60)}\n`);
    console.log(`项目ID: ${testReport.projectId}`);
    console.log(`测试端口: ${testReport.testPort}`);
    console.log(`开始时间: ${new Date(testReport.startTime).toLocaleString('zh-CN')}`);
    console.log(`结束时间: ${new Date(testReport.endTime).toLocaleString('zh-CN')}`);
    console.log(`总体结果: ${testReport.result.toUpperCase()}\n`);
    console.log(`总步骤数: ${totalSteps}`);
    console.log(`通过: ${passedSteps}`);
    console.log(`失败: ${failedSteps}`);
    console.log(`错误: ${errorSteps}`);
    console.log(`成功率: ${testReport.summary.successRate}\n`);

    console.log('步骤详情:');
    testReport.steps.forEach((step, index) => {
        const icon = step.result === 'passed' ? '✅' : step.result === 'failed' ? '❌' : '⚠️';
        console.log(`  ${icon} 步骤 ${step.step || index + 1}: ${step.description || 'N/A'} - ${step.result.toUpperCase()}`);
    });

    console.log(`\n📝 完整报告已保存到: ${reportPath}\n`);

    return testReport;
}

/**
 * 主测试流程
 */
async function main() {
    try {
        // 启动测试服务器
        await startTestServer();

        console.log('📥 创建项目...\n');
        await createProject();

        // 步骤 1: 简单问候测试
        const step1 = await executeStep(
            1,
            '简单问候测试',
            '你好',
            false // 不应该包含 ExitPlan
        );

        // 如果步骤1失败（检测到了 ExitPlan），则测试失败并退出
        if (step1.result === 'failed') {
            console.log('\n⚠️  步骤 1 失败，简单问候不应触发 ExitPlan。测试终止。\n');
            generateReport();
            await stopTestServer();
            process.exit(1);
        }

        // 步骤 2: 请求生成 helloworld
        const step2 = await executeStep(
            2,
            '请求生成 HelloWorld',
            '我要做一个网页版的 Hello World 项目。要求：1.打开浏览器就能看到 "Hello World" 文字 2.使用 Next.js 框架 3.只需要最基本的首页即可。请直接生成实现方案。',
            true // 应该触发 ExitPlan
        );

        // 生成最终报告
        const finalReport = generateReport();

        // 停止测试服务器
        await stopTestServer();

        // 根据结果退出
        if (finalReport.result === 'passed') {
            console.log('🎉 所有测试通过！\n');
            process.exit(0);
        } else {
            console.log('❌ 测试失败，请查看报告了解详情。\n');
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ 测试执行过程中发生错误:', error);
        testReport.result = 'error';
        testReport.endTime = new Date().toISOString();
        generateReport();
        await stopTestServer();
        process.exit(1);
    }
}

// 处理进程退出信号
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  收到中断信号，正在清理...\n');
    await stopTestServer();
    process.exit(130);
});

process.on('SIGTERM', async () => {
    console.log('\n\n⚠️  收到终止信号，正在清理...\n');
    await stopTestServer();
    process.exit(143);
});

// 运行测试
main();
