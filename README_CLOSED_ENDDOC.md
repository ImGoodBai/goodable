# Claude SDK "Stream Closed" 问题完整分析报告

> 最后更新：2025-12-16
> 目的：记录 permissionMode 演变历史、stdio 问题根因、最终解决方案

---

## 📋 问题概述

### 核心现象
- **环境**：Windows 系统（开发环境和打包环境）
- **错误**：`Tool permission request failed: Error: Stream closed`
- **影响**：所有需要权限的工具（Write、Edit、Glob 等）调用失败
- **时间点**：在 `permissionMode: 'default'` + `canUseTool` 模式下出现

### 关键发现
- **Mac/Linux**：`default` 模式正常运行
- **Windows**：`default` 模式 stdio 通道不稳定，出现 Stream closed
- **acceptEdits 模式**：所有平台都正常（绕过 stdio）

---

## 🕐 历史演变时间线

### 阶段 1：初期（2025-12-04 之前）
```
permissionMode: 'bypassPermissions'
```
- 完全绕过权限检查
- 无安全限制
- 功能稳定

### 阶段 2：引入三机制（2025-12-04, b6fa97e）
**提交**：b6fa97e "TodoWrite可视化、触发源头追踪"

**同时引入三个机制**：
```typescript
permissionMode: 'bypassPermissions'  // 保持旧模式

hooks: {
  PreToolUse: [...]   // 路径重写：/tmp/xxx/ → 项目路径
  PostToolUse: [...]  // 文件复制：临时文件 → 项目目录
}

canUseTool: async (toolName, input) => {
  const updated = rewriteTmpPaths(input);
  return { behavior: 'allow', updatedInput: updated };  // 全部放行
}
```

- **PreToolUse**：重写临时路径
- **PostToolUse**：复制临时文件
- **canUseTool**：简单路径重写，全部放行（无安全检查）

### 阶段 3：canUseTool 增强（2025-12-12, 1ff8280）
**提交**：1ff8280 "工具执行权限改为 default 模式，严格越界检查"

**重大变化**：
```typescript
permissionMode: 'default'  // ← 从 bypassPermissions 改为 default

canUseTool: async (toolName, input) => {
  // 新增：安全检查（78行代码）
  if (['Read', 'Write', 'Edit', 'Glob', 'NotebookEdit'].includes(toolName)) {
    const absolutePath = path.resolve(projectPath, filePath);

    if (!isInProject) {
      return {
        behavior: 'deny',  // ← 新增：拒绝越界操作
        reason: '安全限制：文件操作必须在项目目录内'
      };
    }
  }

  return { behavior: 'allow', updatedInput: absolutePath };
}
```

- **PreToolUse/PostToolUse**：保持不变
- **canUseTool**：从"简单放行"改为"严格检查+拒绝能力"
- **permissionMode**：从 `bypassPermissions` 改为 `default`

### 阶段 4：发现 stdio 问题（2025-12-15, 2f589c5）
**提交**：2f589c5 "跳转权限模式为default后，sdk调用出现了closed问题"

- 只添加测试文件和文档
- 代码无修改
- 记录问题：Windows 下 stdio 通道失败

---

## 🔍 技术机制详解

### 三机制的触发顺序（permissionMode: 'default'）

```
SDK 工具调用
    ↓
① PreToolUse Hook（最早触发）
    ↓ 修改输入、路径重写
② Deny Rules 检查
    ↓
③ Allow Rules 检查
    ↓
④ Ask Rules 检查
    ↓
⑤ Permission Mode 检查（default/acceptEdits/plan/bypassPermissions）
    ↓
⑥ canUseTool Callback（权限决策）
    ↓ 返回 allow 或 deny
⑦ 执行工具
    ↓
⑧ PostToolUse Hook（工具成功后）
```

### 各机制特性对比

| 机制 | 运行方式 | 触发时机 | 可修改输入 | 可拒绝 | 使用 stdio | 项目中用途 |
|------|----------|----------|------------|--------|-----------|-----------|
| **PreToolUse** | In-process 回调 | 工具执行前（最早） | ✅ | ✅ (通过 permissionDecision) | ❌ | 路径重写 |
| **canUseTool** | In-process 回调 | Permission Mode 检查后 | ✅ | ✅ (返回 deny) | ⚠️ 异常时 fallback | 安全检查+拒绝 |
| **PostToolUse** | In-process 回调 | 工具成功后（最晚） | ❌ | ❌ | ❌ | 复制文件 |

---

## 🐛 stdio 问题根因分析

### SDK 工作原理

```
你的代码（Node.js 进程）
    ↓ query()
SDK 包 (@anthropic-ai/claude-agent-sdk)
    ↓ spawn 子进程
Claude Code CLI (node_modules/.../cli.js)
    ↓ stdio 通道（stdin/stdout/stderr）
Hook 回调 / canUseTool 回调
```

### 关键发现

#### 正常情况（Mac/Linux，开发环境）
- Hook 和 canUseTool 作为 **in-process 回调**直接在 Node.js 进程中执行
- SDK 通过内部机制调用回调函数
- **不依赖 stdio 通道**
- ✅ 运行正常

#### 异常情况（Windows，或打包环境）
- SDK 无法正常识别 canUseTool 回调函数
- SDK 检测到 canUseTool 不可用
- **Fallback 到 stdio 模式**：启动 CLI 时添加 `--permission-prompt-tool stdio`
- stdio 通道在 Windows/ASAR 环境下不稳定
- stdin 在约 7.5 秒后关闭
- ❌ 报错：`Stream closed`

### 问题链条

```
permissionMode: 'default' + canUseTool 配置
    ↓
【Windows/打包环境】SDK 无法识别 canUseTool
    ↓
SDK fallback 到 stdio 模式（--permission-prompt-tool stdio）
    ↓
Windows 环境 stdio 通道不稳定
    ↓
stdin 在 7.5 秒后自动关闭
    ↓
所有权限请求失败：Error: Stream closed
```

### 为什么 Mac 正常但 Windows 不正常？

1. **进程管理差异**：
   - Mac/Linux：`spawn` 子进程和 stdio 通道稳定
   - Windows：子进程 stdio 通道容易断开（已知 Node.js 问题）

2. **SDK 回调识别差异**：
   - Mac：canUseTool 回调正常识别，不 fallback
   - Windows：某些情况下回调识别失败，触发 stdio fallback

3. **打包环境（ASAR）**：
   - Electron ASAR 打包只支持 `execFile`，不完全支持 `spawn`
   - stdio 通道在 ASAR 环境下无法正常连接
   - 参考：[Electron Issue #9459](https://github.com/electron/electron/issues/9459)

---

## ✅ 最终解决方案：平台差异化策略

### 方案设计

```typescript
const isWindows = process.platform === 'win32';

const response = query({
  options: {
    permissionMode: isWindows ? 'acceptEdits' : 'default',

    // Windows 下不使用 hooks 和 canUseTool
    ...(isWindows ? {} : {
      hooks: {
        PreToolUse: [...],   // Mac/Linux 保留
        PostToolUse: [...]   // Mac/Linux 保留
      },
      canUseTool: async (toolName, input) => { ... }  // Mac/Linux 保留
    })
  }
});
```

### 模式对比

#### Mac/Linux（permissionMode: 'default'）
```typescript
permissionMode: 'default'
hooks: { PreToolUse, PostToolUse }
canUseTool: async (toolName, input) => {
  // 严格路径检查
  if (!isInProject) {
    return { behavior: 'deny', reason: '路径越界' };
  }
  return { behavior: 'allow' };
}
```

**安全等级**：⭐⭐⭐⭐⭐ (5/5)
- ✅ 事前拦截：canUseTool 主动检查并拒绝
- ✅ 路径归一化：强制使用项目内绝对路径
- ✅ 完整日志：记录所有检查和拒绝
- ✅ 无 stdio 问题（回调正常识别）

#### Windows（permissionMode: 'acceptEdits'）
```typescript
permissionMode: 'acceptEdits'  // 完全绕过权限系统和 stdio
// 无 hooks
// 无 canUseTool

// 依赖以下保障：
options: {
  cwd: projectPath,  // 相对路径限制在项目内
  systemPrompt: `
    ⚠️ 【Windows 环境路径安全警告】
    - 当前环境路径检查已禁用
    - 严格遵守以下规则：
      1. 禁止使用绝对路径（如 C:\\、D:\\）
      2. 禁止使用 ../ 跳出项目目录
      3. 仅使用项目内相对路径
    - 违规操作将被标记为 ### PATH-NOSAFE
  `
}

// 日志审计
timelineLogger.logSDK(
  projectId,
  `### PATH-NOSAFE: ${toolName} - ${filePath}`,
  'warning',
  requestId,
  { platform: 'windows', noSafetyCheck: true },
  'sdk.path_unsafe'
);
```

**安全等级**：⭐⭐⭐ (3/5)
- ✅ cwd 限制：相对路径自动限制在项目内
- ✅ 提示词约束：系统提示要求不越界
- ✅ 日志审计：所有操作标记 `### PATH-NOSAFE`
- ⚠️ 事后检测：无法事前拦截
- ⚠️ 依赖 AI：需要模型遵守提示词规则

---

## 🔒 安全性评估

### 风险对比表

| 风险类型 | Mac/Linux (default) | Windows (acceptEdits) | 缓解措施 |
|---------|---------------------|----------------------|----------|
| **AI 误操作越界** | ❌ 事前拦截 | ⚠️ 允许但记录 | 提示词强约束 + 日志审计 |
| **恶意指令** | ❌ 事前拦截 | ⚠️ 允许但记录 | 用户输入审查 + 告警 |
| **相对路径越界** | ❌ 事前拦截 | ✅ cwd 限制 | 无风险 |
| **绝对路径越界** | ❌ 事前拦截 | ⚠️ 允许但记录 | 日志审计 + 定期检查 |
| **日志可追溯性** | ✅ 完整 | ✅ 完整（PATH-NOSAFE 标记） | 审计工具 |

### 三重安全保障（Windows）

#### 1. cwd 工作目录限制
- SDK 的 `cwd` 参数限制相对路径解析
- 例：`app/page.tsx` → `{projectPath}/app/page.tsx`
- **无法使用相对路径越界**

#### 2. 系统提示词约束
```typescript
const systemPrompt = isWindows ? `
${SYSTEM_PROMPT_EXECUTION}

⚠️ 【Windows 环境路径安全警告】
- 当前环境路径检查已禁用，所有文件操作都会被审计日志记录
- 严格遵守以下规则，否则操作会被标记为安全违规：
  1. 禁止使用绝对路径（如 C:\\Windows、D:\\Data）
  2. 禁止使用 ../ 跳出项目目录
  3. 仅使用项目内相对路径（如 app/page.tsx、lib/utils.ts）
- 违规操作将被记录到审计日志，并可能导致项目暂停
` : SYSTEM_PROMPT_EXECUTION;
```

#### 3. 审计日志标记
```typescript
// Windows 下所有文件操作都标记 PATH-NOSAFE
if (isWindows && fileOperationTools.includes(toolName)) {
  await timelineLogger.logSDK(
    projectId,
    `### PATH-NOSAFE: ${toolName} - ${JSON.stringify(input)}`,
    'warning',
    requestId,
    {
      platform: 'windows',
      noSafetyCheck: true,
      toolName,
      input
    },
    'sdk.path_unsafe'
  );
}
```

### 可选：事后路径审计
```typescript
async function auditWindowsPaths(projectId, requestId) {
  const logs = await getTimelineLogs(projectId, requestId);

  const violations = logs.filter(log =>
    log.message.includes('PATH-NOSAFE') &&
    (log.metadata.input?.file_path?.includes('..') ||
     path.isAbsolute(log.metadata.input?.file_path))
  );

  if (violations.length > 0) {
    await timelineLogger.logSDK(
      projectId,
      `🚨 检测到 ${violations.length} 个可疑路径操作`,
      'error',
      requestId,
      { violations },
      'audit.path_violation'
    );
  }
}
```

---

## 📝 实施指南

### 代码修改（lib/services/cli/claude.ts）

#### 1. 检测平台
```typescript
// 在 executeClaude 函数开始处
const isWindows = process.platform === 'win32';

console.log(`[ClaudeService] Platform: ${process.platform}, Safe mode: ${!isWindows}`);
```

#### 2. 条件配置 permissionMode
```typescript
// 行号约 1150
const response = query({
  prompt: instruction,
  options: {
    cwd: absoluteProjectPath,
    additionalDirectories: [absoluteProjectPath],
    model: resolvedModel,
    resume: sessionId,

    // 根据平台选择模式
    permissionMode: isWindows ? 'acceptEdits' : 'default',

    systemPrompt: systemPromptText,  // 使用增强的提示词
    maxOutputTokens,
    // ...
```

#### 3. 条件包含 hooks 和 canUseTool
```typescript
    // Windows 下不使用 hooks 和 canUseTool
    ...(isWindows ? {} : {
      hooks: {
        PreToolUse: [
          {
            matcher: '.*',
            hooks: [
              async (hookInput: any) => {
                // 现有的 PreToolUse 逻辑
                const updated = rewriteTmpPaths(hookInput.tool_input);
                // ...
              }
            ]
          }
        ],
        PostToolUse: [
          {
            matcher: '.*',
            hooks: [
              async (hookInput: any) => {
                // 现有的 PostToolUse 逻辑
                // ...
              }
            ]
          }
        ]
      },

      canUseTool: async (toolName: string, input: Record<string, unknown>, _opts: any) => {
        // 现有的 canUseTool 逻辑
        const fileOperationTools = ['Read', 'Write', 'Edit', 'Glob', 'NotebookEdit'];
        if (fileOperationTools.includes(toolName)) {
          // 安全检查
          if (!isInProject) {
            return {
              behavior: 'deny',
              reason: '安全限制：文件操作必须在项目目录内'
            } as any;
          }
        }
        return { behavior: 'allow', updatedInput: updated } as any;
      }
    }),

    stderr: (data: string) => {
      // 现有的 stderr 处理
      // ...
    }
  }
});
```

#### 4. Windows 日志标记（可选增强）
```typescript
// 在消息处理循环中，检测到工具使用时
if (message.type === 'tool_use' && isWindows) {
  const toolName = message.tool_name;
  const fileOperationTools = ['Read', 'Write', 'Edit', 'Glob', 'NotebookEdit'];

  if (fileOperationTools.includes(toolName)) {
    try {
      await timelineLogger.logSDK(
        projectId,
        `### PATH-NOSAFE: ${toolName} - ${JSON.stringify(message.tool_input)}`,
        'warning',
        requestId,
        {
          platform: 'windows',
          noSafetyCheck: true,
          toolName,
          input: message.tool_input
        },
        'sdk.path_unsafe'
      );
    } catch {}
  }
}
```

#### 5. 增强系统提示词
```typescript
// 在 systemPromptText 生成时
const systemPromptText = isWindows
  ? `${finalSystemPrompt}

⚠️ 【Windows 环境路径安全警告】
- 当前环境路径检查已禁用，所有文件操作都会被审计日志记录
- 严格遵守以下规则，否则操作会被标记为安全违规：
  1. 禁止使用绝对路径（如 C:\\Windows、D:\\Data、C:\\Users\\...）
  2. 禁止使用 ../ 或 ..\\ 跳出项目目录
  3. 仅使用项目内相对路径（如 app/page.tsx、lib/utils.ts、components/Button.tsx）
- 所有违规操作将被记录到审计日志
- 示例正确路径：app/page.tsx、src/index.ts、README.md
- 示例错误路径：../../../etc/passwd、C:\\Windows\\System32\\file.txt、D:\\other-project\\file.ts
`
  : finalSystemPrompt;
```

### 验证步骤

#### 1. 类型检查
```bash
npm run type-check
```

#### 2. 功能测试（Windows）
```powershell
# 启动开发环境
npm run dev:web

# 创建测试项目
$body = @{ project_id='test-win'; name='Windows Test'; preferredCli='claude' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/projects' -Method Post -ContentType 'application/json' -Body $body

# 测试文件操作
$body = @{ instruction='创建 app/page.tsx'; cliPreference='claude'; selectedModel='claude-sonnet-4.5' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/chat/test-win/act' -Method Post -ContentType 'application/json' -Body $body

# 检查日志
# - 应该看到 [ClaudeService] Platform: win32, Safe mode: false
# - 应该看到 ### PATH-NOSAFE: 标记
# - 不应该看到 "Stream closed" 错误
```

#### 3. 功能测试（Mac/Linux，如有）
```bash
# 同样的测试步骤
# - 应该看到 Platform: darwin/linux, Safe mode: true
# - 应该看到 canUseTool 检查日志
# - 不应该看到 PATH-NOSAFE 标记
```

#### 4. 越界测试（可选）
```powershell
# 尝试越界操作（仅用于测试日志记录）
$body = @{ instruction='读取 C:\Windows\System32\drivers\etc\hosts'; cliPreference='claude' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/chat/test-win/act' -Method Post -ContentType 'application/json' -Body $body

# 检查日志
# - Windows: 应该记录 ### PATH-NOSAFE，但可能会执行（取决于 AI 是否遵守提示词）
# - Mac: 应该被 canUseTool 拒绝，返回 deny
```

---

## 📊 方案评价

### 优点
- ✅ **务实**：解决实际问题，不过度设计
- ✅ **渐进**：保留 Mac 最佳实践，Windows 可后续优化
- ✅ **可追溯**：所有操作有审计日志（PATH-NOSAFE 标记）
- ✅ **低风险**：cwd + 提示词 + 日志三重保障
- ✅ **可维护**：清晰的平台分支逻辑
- ✅ **兼容性**：Mac/Linux 保持最高安全性，Windows 功能可用

### 缺点
- ⚠️ **双模式**：需要维护两套逻辑
- ⚠️ **事后检测**：Windows 无法事前拦截
- ⚠️ **依赖用户**：需要用户定期审计日志
- ⚠️ **依赖 AI**：Windows 安全依赖模型遵守提示词

### 适用场景
- ✅ 开发/测试环境（可接受）
- ✅ 内部团队使用（可控）
- ⚠️ 生产环境（需加强监控，推荐使用 Mac/Linux 部署）
- ❌ 公开 SaaS（风险偏高，建议强制 Mac/Linux 或实施方案 B）

---

## 🔮 后续优化方向

### 短期（1-2 周）
1. **增强审计**：
   - 前端 UI 显示 PATH-NOSAFE 标记
   - 定期扫描和告警可疑操作
   - 统计越界操作频率

2. **用户体验**：
   - 在 Windows 启动时显示安全模式提示
   - 提供手动切换 safe/unsafe 模式（高级用户）

### 中期（1-2 月）
1. **方案 B 实施**：
   - 将 SDK query 迁移到 Electron 主进程
   - 通过 IPC 通信
   - **注意**：方案 B 无法解决 stdio 问题（stdio 仍然存在）
   - 但可以统一代码路径，避免平台差异

2. **容器化部署**：
   - 提供 Docker 镜像（Linux 环境）
   - 统一使用 `default` 模式

### 长期（3+ 月）
1. **SDK 升级**：
   - 关注 SDK 对 Windows stdio 的修复
   - 升级到稳定版本后重新评估

2. **自定义工具**：
   - 实现自定义文件操作工具
   - 绕过 SDK 内置工具和权限系统
   - 完全掌控安全检查逻辑

---

## 🔗 相关资源

### 代码位置
- **核心实现**：`lib/services/cli/claude.ts` (约 1140-1330 行)
- **日志工具**：`lib/services/timeline-logger.ts`
- **系统提示词**：`lib/prompts/system-prompts.ts`

### Git 历史
- **b6fa97e** (2025-12-04)：引入 PreToolUse/PostToolUse/canUseTool
- **1ff8280** (2025-12-12)：canUseTool 增强，改为 default 模式
- **2f589c5** (2025-12-15)：记录 Stream closed 问题

### 官方文档
- [Agent SDK - TypeScript](https://docs.claude.com/en/api/agent-sdk/typescript)
- [Handling Permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)
- [Hooks Reference](https://docs.anthropic.com/en/docs/claude-code/hooks)

### 相关 Issue
- [SDK Issue #29](https://github.com/anthropics/claude-agent-sdk-typescript/issues/29) - canUseTool fallback 问题
- [Electron Issue #9459](https://github.com/electron/electron/issues/9459) - ASAR + stdio 冲突

---

## 📌 快速参考

### 当前配置（已实施平台差异化）

```typescript
// Windows
permissionMode: 'acceptEdits'
// 无 hooks，无 canUseTool
// 依赖：cwd + 提示词 + PATH-NOSAFE 日志

// Mac/Linux
permissionMode: 'default'
hooks: { PreToolUse, PostToolUse }
canUseTool: (检查并拒绝越界)
```

### 日志关键字

- `[ClaudeService] Platform: win32, Safe mode: false` - Windows 模式
- `[ClaudeService] Platform: darwin, Safe mode: true` - Mac 模式
- `### PATH-NOSAFE:` - Windows 文件操作标记（需审计）
- `canUseTool DENIED - path outside project` - Mac 拒绝越界
- `Stream closed` - stdio 问题（不应再出现）

### 故障排查

| 问题 | 平台 | 检查项 | 解决方法 |
|------|------|-------|---------|
| Stream closed | Windows | permissionMode 是否为 acceptEdits | 确保 isWindows 判断正确 |
| 路径越界未拦截 | Windows | 是否有 PATH-NOSAFE 日志 | 增强提示词，定期审计 |
| 路径越界未拦截 | Mac | canUseTool 是否返回 deny | 检查 isInProject 逻辑 |
| hooks 不执行 | Mac | permissionMode 是否为 default | 检查平台判断逻辑 |

---

**报告结束** | 最后更新：2025-12-16 | 维护者：开发团队
