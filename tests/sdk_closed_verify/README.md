# SDK stdio 通道诊断测试 - Electron 完整环境

完整的 Electron 打包测试环境，用于验证 Claude Agent SDK 在 Electron 打包后的 stdio 通道问题及解决方案。

## 环境说明

这是一个独立的 Electron 应用，模拟 goodable 项目的打包环境，可以快速验证：
1. SDK 在 Electron 默认 spawn 配置下是否正常
2. 自定义 spawnClaudeCodeProcess 是否解决问题
3. Hook 回调机制是否受影响

## 快速开始

### 1. 安装依赖

```bash
cd C:\Users\admin\Documents\sdk-stdio-test
npm install
```

### 2. 配置 API（使用已有配置）

确保已设置环境变量：
```bash
set ANTHROPIC_AUTH_TOKEN=sk-6WtM66cmhfWv6Wirw34bh5S0FeyBTkLlOcV6UqQXgA
set ANTHROPIC_BASE_URL=https://api.100agent.co
```

或使用已有的 Claude Code 认证（SDK 会自动读取）。

## 测试方式

### 方式1：开发模式测试（快速验证）

```bash
npm run test:dev
# 或
npm start
```

这会启动 Electron 应用并打开测试界面。

### 方式2：生产模式测试（模拟打包后）

```bash
npm run test:prod
```

设置 NODE_ENV=production 运行，更接近打包后环境。

### 方式3：完整打包测试（最准确）

**快速打包（推荐）：**
```bash
npm run build
```
生成目录：`dist\win-unpacked\SDKStdioTest.exe`

**完整打包（生成安装包）：**
```bash
npm run build:full
```
生成安装程序：`dist\SDKStdioTest Setup 1.0.0.exe`

## 测试内容

应用启动后会显示一个图形界面，包含4个测试场景：

### 测试1: 默认 Spawn
- **配置**: SDK 默认 spawn
- **预期**: 在打包后可能失败（Stream closed）
- **目的**: 重现问题

### 测试2: 自定义 Spawn ⭐
- **配置**: 自定义 spawnClaudeCodeProcess，明确 stdio: ['pipe', 'pipe', 'pipe']
- **预期**: 修复问题，正常工作
- **目的**: 验证解决方案

### 测试3: 默认 Spawn + Hook
- **配置**: SDK 默认 spawn + PreToolUse Hook
- **预期**: Hook 回调可能失败
- **目的**: 验证 Hook 是否受影响

### 测试4: 自定义 Spawn + Hook ⭐
- **配置**: 自定义 spawn + PreToolUse Hook
- **预期**: 完整功能正常
- **目的**: 验证完整解决方案

### 🚀 一键全测试
点击 "运行全部测试" 按钮，依次执行全部4个测试。

## 查看结果

### 1. 应用界面
- 实时显示测试日志
- 彩色结果提示（成功/失败）
- 显示环境信息（是否打包、NODE_ENV等）

### 2. 日志文件
完整日志保存在：
```
C:\Users\admin\AppData\Roaming\sdk-stdio-electron-test\electron-test-{timestamp}.log
```

应用界面会显示具体路径。

### 3. 控制台输出
开发者工具（F12）可查看完整控制台日志。

## 预期结果

### 开发模式（npm start）
- ✅ 所有测试应该通过
- SDK 通道正常工作

### 打包后（npm run build）
**如果问题存在：**
- ❌ 测试1失败：Stream closed 错误
- ❌ 测试3失败：Hook callback 错误
- ✅ 测试2通过：自定义spawn修复
- ✅ 测试4通过：完整功能正常

**如果解决方案有效：**
- ✅ 所有测试通过
- 证明 spawnClaudeCodeProcess 方案有效

## 关键差异对比

### 默认 Spawn（测试1/3）
```javascript
// SDK 内部使用默认配置
// Electron ASAR 打包后可能导致 stdio 配置异常
```

### 自定义 Spawn（测试2/4）
```javascript
spawnClaudeCodeProcess: (options) => {
  return spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'], // 明确配置
    windowsHide: true,
  });
}
```

## 故障排查

### 如果所有测试都失败
1. 检查 API 密钥配置
2. 检查网络连接
3. 查看日志文件详细错误
4. 确认 SDK 版本：0.1.69

### 如果打包失败
```bash
# 清理后重试
rm -rf dist node_modules
npm install
npm run build
```

### 如果无法启动
```bash
# 检查 Electron 版本
npx electron --version

# 重新安装依赖
npm install electron --save-dev
```

## 文件结构

```
sdk-stdio-test/
├── package.json              # 项目配置和打包设置
├── electron-main.js          # Electron 主进程
├── test-sdk-electron.js      # SDK 测试逻辑
├── index.html                # 测试界面
├── test.js                   # 原始 Node.js 测试（可选）
├── README.md                 # 本文档
└── dist/                     # 打包输出目录（自动生成）
    └── win-unpacked/         # Windows 打包结果
        └── SDKStdioTest.exe  # 可执行文件
```

## 与 goodable 项目的关联

这个测试环境模拟了 goodable 项目的：
- Electron 环境
- ASAR 打包
- SDK 调用方式
- 自定义 spawn 配置

如果测试2/4通过，可以确认：
1. **问题根因**：Electron 打包后 stdio 配置问题
2. **解决方案**：spawnClaudeCodeProcess 配置有效
3. **下一步**：在 goodable 项目中应用同样方案（已完成）

## 下一步

1. **运行开发模式测试** - 确认基础环境正常
2. **运行打包测试** - 验证问题是否存在
3. **对比测试结果** - 确认解决方案有效性
4. **应用到 goodable** - 使用相同配置修复主项目

---

**准备好开始测试了吗？**

运行 `npm start` 启动应用，或者 `npm run build` 直接打包测试！
