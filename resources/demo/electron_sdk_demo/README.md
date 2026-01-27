# Claude Agent SDK Demo - 权限机制验证

## 一、测试目的

验证在 Goodable 的 BS 架构（Electron + Next.js API Route）下，Claude Agent SDK 的 `canUseTool` 回调和 `PreToolUse hook` 是否能正常工作，解决历史上遇到的 "Stream closed" 问题。



---

## 二、测试结论

### 2.1 核心结论

| 验证项 | 结果 | 说明 |
|--------|------|------|
| SDK 在 Next.js API Route 调用 | ✓ | BS 架构可正常工作 |
| PreToolUse Hook | ✓ | **必须使用**，能捕获所有工具调用 |
| canUseTool 回调 | ✗ | 当存在 `allowedTools` 参数时完全不触发 |
| 用户权限确认 UI | ✓ | Promise 等待机制正常，可实现 Allow/Deny |
| Stream closed 错误 | ✓ | **未出现** |

### 2.2 关键发现

1. **PreToolUse hook 是唯一可靠方案**：当 SDK 配置了 `allowedTools`/`settingSources` 参数时，`canUseTool` 回调完全不触发，只有 `PreToolUse hook` 始终触发
2. **SDK 版本升级必需**：0.1.69 版本 `PreToolUse hook` 不触发，必须升级到 **0.1.76+**
3. **Hook 返回格式**：拒绝时必须返回 `{ decision: 'block', reason: '...' }`，不是 `'deny'`
4. **等待机制**：使用 Promise + resolve 函数存储模式，不用轮询
5. **多权限模式可行**：SDK 原生支持四种权限模式，可完整实现

---

## 三、权限模式详解（重要）

### 3.1 SDK 支持的四种模式

| 模式 | 值 | 说明 | canUseTool 触发 |
|------|-----|------|-----------------|
| 默认模式 | `default` | 只读工具自动放行，写入需用户确认 | ✓ 对写入工具触发 |
| 接受编辑 | `acceptEdits` | 文件编辑自动放行，其他写入需确认 | ✓ 对非编辑写入触发 |
| 全放行 | `bypassPermissions` | 所有工具自动放行 | ✗ 完全不触发 |
| 规划模式 | `plan` | 只允许规划，不执行实际操作 | ✓ 但会拒绝执行 |

### 3.2 各模式自动放行的工具

| 模式 | 自动放行工具 |
|------|-------------|
| `default` | Read, Glob, Grep, WebFetch, WebSearch |
| `acceptEdits` | 上述 + Write, Edit |
| `bypassPermissions` | 全部工具 |
| `plan` | 上述只读工具（写入工具被拦截） |

### 3.3 集成建议

**推荐在项目/会话级别配置权限模式**：

```typescript
// 项目配置示例
interface ProjectConfig {
  permission_mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowed_tools?: string[];  // 额外自动放行的工具
}
```

**UI 实现建议**：

1. **项目设置页**：添加权限模式下拉选择
2. **会话级覆盖**：允许单次会话临时切换模式
3. **模式说明提示**：向用户解释各模式含义

### 3.4 完整权限判断逻辑

```typescript
// 参考 Cherry Studio 实现
const canUseTool = async (toolName, input, options) => {
  // 1. 全放行模式直接通过
  if (permissionMode === 'bypassPermissions') {
    return { behavior: 'allow', updatedInput: input };
  }

  // 2. 检查是否在自动放行列表
  const autoAllowTools = getAutoAllowTools(permissionMode);
  if (autoAllowTools.has(toolName)) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 3. 规划模式拒绝执行类工具
  if (permissionMode === 'plan' && isExecutionTool(toolName)) {
    return { behavior: 'deny', message: 'Plan mode does not allow execution' };
  }

  // 4. 需要用户确认
  return await promptForUserApproval(toolName, input, options);
};

function getAutoAllowTools(mode: string): Set<string> {
  const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
  const editTools = ['Write', 'Edit'];

  switch (mode) {
    case 'default':
      return new Set(readOnlyTools);
    case 'acceptEdits':
      return new Set([...readOnlyTools, ...editTools]);
    case 'plan':
      return new Set(readOnlyTools);
    default:
      return new Set();
  }
}
```

---

## 四、目录结构

```
demo/electron_sdk_demo/
├── README.md                    # 本文档
├── package.json                 # 根目录依赖（Electron）
│
├── # 阶段一：纯 Electron 验证
├── main.js                      # Electron 主进程（SDK 直接调用）
├── preload.js                   # IPC 桥接
├── index.html                   # 简单 UI
├── renderer.js                  # 渲染进程逻辑
│
├── # 阶段二：BS 架构验证（与主程序一致）
├── main-bs.js                   # Electron 主进程（加载 Next.js）
├── electron-builder-bs.yml      # BS 架构打包配置
│
└── next-app/                    # Next.js 应用
    ├── package.json
    ├── next.config.js
    └── app/
        ├── page.tsx             # 前端页面（带权限确认 UI）
        ├── layout.tsx
        └── api/
            ├── chat/route.ts    # SDK 调用入口（核心）
            ├── permissions.ts   # 权限状态管理（globalThis）
            ├── pending/route.ts # 获取待确认权限
            └── confirm/route.ts # 确认/拒绝权限
```

---

## 四、运行方式

### 4.1 安装依赖

```bash
cd demo/electron_sdk_demo
npm install
cd next-app && npm install
```

### 4.2 阶段一：纯 Electron

```bash
npm start
```

### 4.3 阶段二：BS 架构（推荐）

```bash
npm run start:bs
```

或单独运行 Next.js：

```bash
cd next-app && npm run dev
# 浏览器访问 http://localhost:3456
```

---

## 五、与主程序的核心区别

### 5.1 当前主程序配置

文件：`lib/services/cli/claude.ts`

```typescript
const response = query({
  prompt: instruction,
  options: {
    cwd: absoluteProjectPath,
    permissionMode: 'bypassPermissions',  // 完全放行
    // 没有 canUseTool
    // 没有 hooks
  },
});
```

### 5.2 Demo 配置（支持权限确认）

```typescript
const response = query({
  prompt,
  options: {
    cwd,
    permissionMode: 'default',  // 改为 default
    canUseTool,                 // 添加权限回调
    hooks: {                    // 添加 hooks
      PreToolUse: [{
        hooks: [preToolUseHook]
      }]
    }
  },
});
```

### 5.3 核心差异总结

| 配置项 | 主程序 | Demo | 说明 |
|--------|--------|------|------|
| permissionMode | bypassPermissions | default | 需改为 default 才能触发权限检查 |
| canUseTool | 无 | 有 | 权限确认回调 |
| hooks.PreToolUse | 无 | 有 | 捕获所有工具调用 |
| 状态管理 | 无 | globalThis | 需要持久化待确认状态 |

---

## 六、集成方案

### 6.1 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `lib/services/cli/claude.ts` | 添加 canUseTool、PreToolUse hook、permissionMode 切换 |
| `lib/services/permissions.ts` | 新建：权限状态管理（参考 demo 的 permissions.ts） |
| `app/api/permissions/pending/route.ts` | 新建：获取待确认权限 API |
| `app/api/permissions/confirm/route.ts` | 新建：确认/拒绝权限 API |
| 前端组件 | 新建：权限确认弹窗组件 |

### 6.2 集成步骤

#### 步骤 1：创建权限状态管理

创建 `lib/services/permissions.ts`：

```typescript
interface PendingPermission {
  toolName: string;
  input: any;
  resolve: (approved: boolean) => void;
  timestamp: number;
}

const globalForPermissions = globalThis as unknown as {
  pendingPermissions: Map<string, PendingPermission> | undefined;
};

const pendingPermissions = globalForPermissions.pendingPermissions ?? new Map();
globalForPermissions.pendingPermissions = pendingPermissions;

export function createPendingPermission(
  toolUseID: string,
  toolName: string,
  input: any
): Promise<boolean> {
  return new Promise((resolve) => {
    pendingPermissions.set(toolUseID, {
      toolName,
      input,
      resolve,
      timestamp: Date.now(),
    });

    // 60秒超时自动拒绝
    setTimeout(() => {
      if (pendingPermissions.has(toolUseID)) {
        pendingPermissions.delete(toolUseID);
        resolve(false);
      }
    }, 60000);
  });
}

export function getPendingPermissions() { /* ... */ }
export function resolvePermission(id: string, approved: boolean) { /* ... */ }
```

#### 步骤 2：修改 claude.ts

```typescript
import { createPendingPermission } from '@/lib/services/permissions';

// 自动放行的只读工具
const AUTO_APPROVE_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);

// 根据项目配置决定权限模式
const permissionMode = project.autoApprove ? 'bypassPermissions' : 'default';

const canUseTool = async (toolName: string, input: any, options: any) => {
  // 自动放行模式或只读工具
  if (permissionMode === 'bypassPermissions' || AUTO_APPROVE_TOOLS.has(toolName)) {
    return { behavior: 'allow', updatedInput: input };
  }

  // 等待用户确认
  const approved = await createPendingPermission(options.toolUseID, toolName, input);
  return approved
    ? { behavior: 'allow', updatedInput: input }
    : { behavior: 'deny', message: 'User denied' };
};

const preToolUseHook = async (input: any, toolUseID: string, options: any) => {
  if (input.hook_event_name !== 'PreToolUse') return {};

  console.log(`[HOOK] PreToolUse: ${input.tool_name}`);
  // 可在此记录工具调用日志

  return {};
};

const response = query({
  prompt: instruction,
  options: {
    // ... 现有配置
    permissionMode,
    canUseTool,
    hooks: {
      PreToolUse: [{
        hooks: [preToolUseHook]
      }]
    }
  },
});
```

#### 步骤 3：创建 API 端点

`app/api/permissions/pending/route.ts`：

```typescript
import { getPendingPermissions } from '@/lib/services/permissions';

export async function GET() {
  return Response.json({ pending: getPendingPermissions() });
}
```

`app/api/permissions/confirm/route.ts`：

```typescript
import { resolvePermission } from '@/lib/services/permissions';

export async function POST(req: Request) {
  const { id, approved } = await req.json();
  const resolved = resolvePermission(id, approved);
  return Response.json({ success: resolved });
}
```

#### 步骤 4：前端权限确认组件

在聊天界面添加轮询和弹窗：
- 轮询 `/api/permissions/pending`
- 显示待确认工具信息
- 提供 Allow/Deny 按钮
- 点击后调用 `/api/permissions/confirm`

---

## 七、风险评估

### 7.1 低风险

| 风险 | 说明 | 缓解措施 |
|------|------|---------|
| 兼容性 | 新增配置向后兼容 | 默认保持 bypassPermissions 模式 |
| 性能 | 轮询增加请求量 | 500ms 间隔，仅在等待时轮询 |

### 7.2 中风险

| 风险 | 说明 | 缓解措施 |
|------|------|---------|
| 状态丢失 | Next.js 热重载可能丢失 globalThis | 生产环境无热重载；可考虑 Redis |
| 超时处理 | 用户长时间不响应 | 60秒超时自动拒绝 |

### 7.3 需要注意

1. **canUseTool 不是万能的**：部分工具不触发，必须配合 PreToolUse hook
2. **permissionMode 必须改为 default**：bypassPermissions 模式下所有回调都不触发
3. **打包注意**：生产打包需要 Next.js standalone 模式

---

## 八、参考资料

- Cherry Studio 源码：https://github.com/kangfenmao/cherry-studio
- Claude Agent SDK 文档：https://docs.anthropic.com/en/docs/claude-code/sdk
- 关键文件：`src/main/services/agents/services/claudecode/index.ts`

---

## 九、测试命令速查

```bash
# 启动 Next.js 开发服务器
cd next-app && npm run dev

# 测试 API（自动放行模式）
curl -X POST http://localhost:3456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"list files","autoApprove":true}'

# 测试 API（需要权限确认）
curl -X POST http://localhost:3456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt":"create test.txt","autoApprove":false}'

# 查看待确认权限
curl http://localhost:3456/api/pending

# 确认权限
curl -X POST http://localhost:3456/api/confirm \
  -H "Content-Type: application/json" \
  -d '{"id":"tool_id_here","approved":true}'
```

---

*文档生成时间：2026-01-20*
