# Claude Agent SDK "Stream Closed" 问题解决方案

## 📋 问题概述

### 现象
Windows 打包安装后（生产环境），所有需要权限（主要时writer，mkdir等写入权限）的工具调用失败，报错：
```
Tool permission request failed: Error: Stream closed
```

### 影响范围
- ✅ 开发环境（npm run dev:desktop）：正常
- ❌ 生产环境（打包安装的 .exe）：Write、Edit、cat heredoc、dd、test 等工具全部失败
- ⏱️ 错误时序：SDK 子进程 stdin 在启动后约 7.5 秒自动关闭

---

## 🔍 根本原因

### 三重技术冲突

#### 1. ASAR + stdio 根本冲突
- **问题**：Electron ASAR 打包只支持 `execFile`，不支持 `spawn`/`fork`
- **结果**：stdio 通道在 ASAR 环境下无法正常连接
- **证据**：[Electron Issue #9459](https://github.com/electron/electron/issues/9459)

#### 2. Next.js standalone 模块路径问题
- **问题**：`output: "standalone"` 模式不复制所有依赖
- **结果**：子进程中找不到正确的 node_modules 路径
- **表现**：CLI 路径指向开发环境 `C:\Users\admin\Documents\goodable\node_modules\...` 而非生产环境
- **证据**：[Next.js Discussion #41346](https://github.com/vercel/next.js/discussions/41346)

#### 3. SDK canUseTool Bug
- **问题**：canUseTool 回调在某些执行路径被跳过
- **结果**：SDK 检测到 canUseTool 不可用后，fallback 到 stdio 模式
- **表现**：启动参数包含 `--permission-prompt-tool stdio`
- **证据**：[SDK Issue #29](https://github.com/anthropics/claude-agent-sdk-typescript/issues/29)

### 问题链条

```
Next.js standalone 打包
  → SDK CLI 路径解析错误（指向开发路径）
  → canUseTool 函数无法被 SDK 识别
  → SDK fallback 到 stdio 模式
  → ASAR 环境 stdio 连接失败
  → stdin 在 7.5 秒后关闭
  → 所有工具权限请求失败："Stream closed"
```

---

## 🎯 解决方案

### 方案 A：acceptEdits + 输入改写（临时方案）⭐⭐⭐⭐

#### 原理
- 使用 `permissionMode: 'acceptEdits'` 绕过 stdio 通道
- 在 PreToolUse Hook 中检测危险路径并改写输入
- 累计违规次数，达到阈值后中断会话

#### 优点
- ✅ 5 分钟即可实施
- ✅ 立即恢复生产功能
- ✅ 安全性较高（改写输入 + 审计日志 + 多次违规中断）
- ✅ 无主进程阻塞风险

#### 缺点
- ⚠️ 无法在工具执行前强制阻止
- ⚠️ 只能通过改写输入让危险操作失效
- ⚠️ 仍是临时方案

#### 安全等级
⭐⭐⭐⭐ (4/5) - 90% 场景可有效防护

---

### 方案 B：迁移到 Electron 主进程（长期方案）⭐⭐⭐⭐⭐

#### 原理
- 将 SDK query 调用迁移到 Electron 主进程
- 通过 IPC 与 Next.js 进程通信
- canUseTool 在主进程中运行，完全避开跨进程问题

#### 优点
- ✅ 完全解决，无技术限制
- ✅ canUseTool 强制拦截能力
- ✅ 长期稳定可靠
- ✅ Demo 测试已验证可行

#### 缺点
- ⚠️ 需要 3-5 小时开发
- ⚠️ 需要注意主进程阻塞（使用异步流式处理）
- ⚠️ 需要完善错误处理机制

#### 安全等级
⭐⭐⭐⭐⭐ (5/5) - 完全控制

---

## 📝 实施步骤

### 阶段 1：方案 A 上线（今天，紧急恢复）

#### 1.1 修改配置文件

**文件**：`lib/services/cli/claude.ts` (约 1290-1410 行)

**修改前**：
```typescript
const response = query({
  options: {
    permissionMode: 'default',
    canUseTool: actualCanUseTool,
    // ...
  }
});
```

**修改后**：
```typescript
const response = query({
  options: {
    permissionMode: 'acceptEdits',  // ← 改为 acceptEdits
    // canUseTool: actualCanUseTool,  // ← 删除或注释掉

    hooks: {
      PreToolUse: [{
        matcher: '.*',
        hooks: [
          (() => {
            let violationCount = 0;
            const MAX_VIOLATIONS = 3;

            return async (hookInput: any) => {
              const input = hookInput?.tool_input;
              const toolName = hookInput?.tool_name;
              const filePath = extractPathFromInput(input);

              // 文件操作工具的路径检查
              if (['Write', 'Edit', 'Read'].includes(toolName) && filePath) {
                const absolutePath = path.resolve(absoluteProjectPath, filePath);
                const projectPathNormalized = path.normalize(absoluteProjectPath) + path.sep;
                const filePathNormalized = path.normalize(absolutePath) + path.sep;
                const isInProject = filePathNormalized.startsWith(projectPathNormalized) ||
                                   path.normalize(absolutePath) === path.normalize(absoluteProjectPath);

                if (!isInProject) {
                  violationCount++;

                  console.error(`[SECURITY] ⚠️⚠️⚠️ Path Violation #${violationCount}/${MAX_VIOLATIONS}`);
                  console.error(`[SECURITY] Tool: ${toolName}, Path: ${filePath}`);
                  console.error(`[SECURITY] Resolved: ${absolutePath}`);
                  console.error(`[SECURITY] Project: ${absoluteProjectPath}`);

                  // 记录到审计日志
                  try {
                    timelineLogger.logSDK(
                      projectId,
                      `SECURITY VIOLATION: ${toolName} attempted to access ${filePath}`,
                      'error',
                      requestId,
                      {
                        tool: toolName,
                        originalPath: filePath,
                        resolvedPath: absolutePath,
                        violationCount
                      },
                      'security.violation'
                    ).catch(() => {});
                  } catch {}

                  // 改写路径使操作失效
                  const blockedInput = { ...input };
                  blockedInput.file_path = `/___SECURITY_BLOCKED___/${toolName}_violation_${violationCount}.txt`;
                  blockedInput.filepath = blockedInput.file_path;
                  blockedInput.filePath = blockedInput.file_path;

                  // 如果违规次数过多，中断会话
                  if (violationCount >= MAX_VIOLATIONS) {
                    console.error('[SECURITY] 🚨 Too many violations, interrupting session!');

                    // 记录严重安全事件
                    try {
                      timelineLogger.logSDK(
                        projectId,
                        `CRITICAL: Session interrupted due to ${MAX_VIOLATIONS} security violations`,
                        'error',
                        requestId,
                        { violationCount },
                        'security.session_terminated'
                      ).catch(() => {});
                    } catch {}

                    // 尝试中断（可能不总是成功）
                    setTimeout(() => {
                      const queryInstance = activeQueryInstances.get(requestId);
                      if (queryInstance) {
                        queryInstance.interrupt().catch(console.error);
                      }
                    }, 100);

                    throw new Error(`Security: ${MAX_VIOLATIONS} violations detected, session terminated`);
                  }

                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse',
                      updatedInput: blockedInput,
                    }
                  };
                }
              }

              // 路径安全或非文件操作，放行
              return {
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse',
                  updatedInput: input,
                }
              };
            };
          })()
        ]
      }]
      // ... 保留 PostToolUse Hook
    }
  }
});
```

#### 1.2 类型检查和打包

```bash
# 类型检查
npm run type-check

# 打包（Windows）
powershell -ExecutionPolicy Bypass -File build-windows.ps1
```

#### 1.3 测试验证

**测试用例**：
1. **合法路径**：`创建 app/page.tsx` → ✅ 应该成功
2. **相对路径越界**：`创建 ../../etc/passwd` → ❌ 应该失败（路径被改写）
3. **绝对路径越界**：`写入 C:\Windows\System32\test.txt` → ❌ 应该失败
4. **多次违规**：连续 3 次尝试越界 → 🚨 会话应被中断

**预期日志**：
```
[SECURITY] ⚠️⚠️⚠️ Path Violation #1/3
[SECURITY] Tool: Write, Path: ../../etc/passwd
[SECURITY] Resolved: C:\Users\admin\AppData\Roaming\goodable\etc\passwd
Tool permission request failed: ENOENT: no such file or directory '/___SECURITY_BLOCKED___/Write_violation_1.txt'
```

---

### 阶段 2：方案 B 开发（本周，长期方案）

#### 2.1 创建 Electron 主进程 SDK 服务

**新建文件**：`electron/claude-sdk-service.js`

```javascript
const { query } = require('@anthropic-ai/claude-agent-sdk');
const path = require('path');
const activeQueries = new Map();

// 启动查询
async function startQuery(params) {
  const { projectId, instruction, requestId, projectPath, model, sessionId } = params;

  try {
    const response = query({
      prompt: instruction,
      options: {
        cwd: projectPath,
        additionalDirectories: [projectPath],
        model: model,
        resume: sessionId,
        permissionMode: 'default',

        // ✅ canUseTool 在主进程，完全可用
        canUseTool: async (toolName, input, opts) => {
          console.log(`[MAIN-CANUSE] ${toolName} called`);

          const fileOperationTools = ['Read', 'Write', 'Edit', 'Glob', 'NotebookEdit'];
          if (fileOperationTools.includes(toolName)) {
            const filePath = extractPathFromInput(input);

            if (filePath) {
              let absolutePath;
              if (path.isAbsolute(filePath)) {
                absolutePath = path.normalize(filePath);
              } else {
                absolutePath = path.normalize(path.resolve(projectPath, filePath));
              }

              const projectPathNorm = path.normalize(projectPath) + path.sep;
              const filePathNorm = path.normalize(absolutePath) + path.sep;
              const isInProject = filePathNorm.startsWith(projectPathNorm) ||
                                 path.normalize(absolutePath) === path.normalize(projectPath);

              if (!isInProject) {
                console.error(`[MAIN-CANUSE] DENIED: ${filePath} outside project`);
                return {
                  behavior: 'deny',
                  reason: `安全限制：文件操作必须在项目目录内。\n项目目录：${projectPath}\n你尝试访问：${filePath}`
                };
              }

              // 路径规范化
              return {
                behavior: 'allow',
                updatedInput: { ...input, file_path: absolutePath }
              };
            }
          }

          return { behavior: 'allow' };
        },

        hooks: {
          // 保留现有的 PreToolUse/PostToolUse Hook
        }
      }
    });

    activeQueries.set(requestId, response);
    return { success: true, response };

  } catch (error) {
    console.error('[MAIN-SDK] Query start error:', error);
    return { success: false, error: error.message };
  }
}

// 中断查询
async function interruptQuery(requestId) {
  const response = activeQueries.get(requestId);
  if (response) {
    try {
      await response.interrupt();
      activeQueries.delete(requestId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Query not found' };
}

// 提取路径的辅助函数
function extractPathFromInput(input) {
  const pathKeys = ['filePath', 'file_path', 'filepath', 'path', 'targetPath', 'target_path', 'notebook_path'];
  for (const key of pathKeys) {
    if (input && input[key]) {
      return input[key];
    }
  }
  return null;
}

module.exports = {
  startQuery,
  interruptQuery
};
```

#### 2.2 注册 IPC Handler

**文件**：`electron/main.js`

```javascript
const { ipcMain } = require('electron');
const claudeSDK = require('./claude-sdk-service');

// 启动查询
ipcMain.handle('claude-query-start', async (event, params) => {
  const result = await claudeSDK.startQuery(params);

  if (result.success) {
    const { response } = result;

    // 异步流式处理，不阻塞主进程
    (async () => {
      try {
        for await (const chunk of response) {
          event.sender.send('claude-chunk', {
            requestId: params.requestId,
            chunk
          });
        }
        event.sender.send('claude-complete', {
          requestId: params.requestId
        });
      } catch (error) {
        event.sender.send('claude-error', {
          requestId: params.requestId,
          error: error.message
        });
      }
    })();
  }

  return result;
});

// 中断查询
ipcMain.handle('claude-query-interrupt', async (event, { requestId }) => {
  return await claudeSDK.interruptQuery(requestId);
});
```

#### 2.3 修改 Next.js 端调用

**文件**：`lib/services/cli/claude.ts`

```typescript
import { ipcRenderer } from 'electron';

export async function* claudeQueryStream(
  projectId: string,
  instruction: string,
  requestId: string,
  sessionId?: string
) {
  // 准备参数
  const params = {
    projectId,
    instruction,
    requestId,
    sessionId,
    projectPath: getProjectPath(projectId),
    model: getModel(),
  };

  // 启动查询（主进程）
  const result = await ipcRenderer.invoke('claude-query-start', params);

  if (!result.success) {
    throw new Error(result.error);
  }

  // 创建异步生成器
  let resolve: any, reject: any;
  const chunks: any[] = [];

  const chunkHandler = (event: any, { requestId: rid, chunk }: any) => {
    if (rid === requestId) {
      chunks.push(chunk);
    }
  };

  const completeHandler = (event: any, { requestId: rid }: any) => {
    if (rid === requestId) {
      cleanup();
      resolve(chunks);
    }
  };

  const errorHandler = (event: any, { requestId: rid, error }: any) => {
    if (rid === requestId) {
      cleanup();
      reject(new Error(error));
    }
  };

  const cleanup = () => {
    ipcRenderer.removeListener('claude-chunk', chunkHandler);
    ipcRenderer.removeListener('claude-complete', completeHandler);
    ipcRenderer.removeListener('claude-error', errorHandler);
  };

  ipcRenderer.on('claude-chunk', chunkHandler);
  ipcRenderer.on('claude-complete', completeHandler);
  ipcRenderer.on('claude-error', errorHandler);

  // 等待完成
  await new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  // 逐个 yield chunk
  for (const chunk of chunks) {
    yield chunk;
  }
}

// 中断函数
export async function interruptClaudeQuery(requestId: string) {
  return await ipcRenderer.invoke('claude-query-interrupt', { requestId });
}
```

#### 2.4 测试验证

**开发环境测试**：
```bash
npm run dev:desktop
```

**生产环境测试**：
```bash
npm run build
powershell -ExecutionPolicy Bypass -File build-windows.ps1
# 安装并测试
```

**压力测试**：
- 并发 3 个查询
- 长时间运行（30 分钟）
- 监控主进程 CPU/内存

---

## ⚠️ 注意事项

### 方案 A 注意事项

1. **路径改写可能失效的场景**
   - Bash 命令中的硬编码路径（如 `cd /etc && cat passwd`）
   - 符号链接绕过（先创建 symlink 再访问）

2. **多次违规中断可能失败**
   - 中断是异步的，不保证立即生效
   - 极端情况下可能需要手动杀进程

3. **审计日志必须持久化**
   - 确保 timelineLogger 正常工作
   - 定期检查安全事件

### 方案 B 注意事项

1. **主进程阻塞**
   - **绝对不要**在主进程中同步等待 query 完成
   - **必须**使用异步流式处理（示例代码已包含）
   - 监控主进程 CPU 占用

2. **并发限制**
   - 建议最多 3 个并发查询
   - 超过限制返回错误，前端排队重试

3. **错误处理**
   - 所有错误都要通过 `claude-error` 事件传递
   - 超时机制（建议 10 分钟）

4. **内存管理**
   - 定期清理 activeQueries Map
   - 监控内存增长

5. **Electron 版本兼容性**
   - 测试 ipcMain/ipcRenderer 在你的 Electron 版本是否正常
   - 当前项目使用 Electron 39.2.4

---

## ✅ 验证清单

### 方案 A 验证

- [ ] 类型检查通过（`npm run type-check`）
- [ ] 打包成功
- [ ] 合法路径操作成功（Write/Edit/Read）
- [ ] 相对路径越界被阻止（看到 SECURITY 日志）
- [ ] 绝对路径越界被阻止
- [ ] 3 次违规后会话中断
- [ ] 审计日志正确记录到 timeline

### 方案 B 验证

- [ ] 开发环境 canUseTool 正常工作（看到 `[MAIN-CANUSE]` 日志）
- [ ] 生产环境 canUseTool 正常工作
- [ ] 流式输出正常（消息实时显示）
- [ ] 中断功能正常
- [ ] 并发 3 个查询不卡顿
- [ ] 30 分钟长时间运行无内存泄漏
- [ ] 错误能正确传递到前端

---

## 📚 相关资源

### 官方文档
- [Claude SDK Permissions](https://code.claude.com/docs/en/sdk/sdk-permissions)
- [Agent SDK TypeScript Reference](https://docs.claude.com/en/api/agent-sdk/typescript)
- [Electron ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- [Electron IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)

### 相关 Issues
- [SDK Issue #29: canUseTool callback skipped](https://github.com/anthropics/claude-agent-sdk-typescript/issues/29)
- [Electron #9459: ASAR spawn issues](https://github.com/electron/electron/issues/9459)
- [Next.js #41346: Child process module not found](https://github.com/vercel/next.js/discussions/41346)

### 项目文件
- 配置文件：`lib/services/cli/claude.ts`
- Demo 测试：`C:\Users\admin\Documents\sdk-stdio-test\`
- 测试日志：`prod-fix4.log`（最新完整验证日志）
- 路径配置：`lib/config/paths.ts`

---

## 📞 技术支持

### 问题上报
遇到问题时，收集以下信息：
1. 完整控制台日志（包含 `[DEBUG-ENV]`, `[SPAWN]`, `[SECURITY]` 等标签）
2. timeline 日志（`PROJECTS_DIR/logs/` 目录下的 JSON 文件）
3. 复现步骤
4. 系统环境（Windows 版本、Node.js 版本）

### 联系方式
- GitHub Issues: https://github.com/anthropics/claude-agent-sdk-typescript/issues
- 项目内部：参考 `CLAUDE.md` 文档

---

## 📊 预期时间表

| 阶段 | 任务 | 预计时间 | 责任人 |
|------|------|----------|--------|
| 1 | 方案 A 实施 | 1-2 小时 | 开发 |
| 2 | 方案 A 测试验证 | 1 小时 | 测试 |
| 3 | 方案 A 上线 | 0.5 小时 | 运维 |
| 4 | 方案 B 开发 | 3-4 小时 | 开发 |
| 5 | 方案 B 测试（开发环境） | 2 小时 | 测试 |
| 6 | 方案 B 测试（生产环境） | 2 小时 | 测试 |
| 7 | 方案 B 上线 | 1 小时 | 运维 |

**总计**：方案 A 今天上线，方案 B 本周完成。

---

## 🎯 成功标准

### 方案 A
- ✅ 生产环境 Write/Edit/Read 工具可以正常工作
- ✅ 危险路径被成功阻止（90% 以上成功率）
- ✅ 审计日志完整记录所有安全事件
- ✅ 用户体验基本正常（偶尔出现操作失败可接受）

### 方案 B
- ✅ 生产环境 canUseTool 100% 工作
- ✅ 所有危险操作被强制拦截
- ✅ 主进程 CPU 占用 < 20%
- ✅ 3 个并发查询无卡顿
- ✅ 长时间运行无内存泄漏

---

**最后更新**：2025-12-15
**文档版本**：v1.0
**维护人**：待指派
