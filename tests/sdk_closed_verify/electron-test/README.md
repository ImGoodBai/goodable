# Electron SDK Stdio Test

测试 Claude Agent SDK 在 Electron 打包后环境的 stdio 通道问题。

## 环境配置

**与 goodable 项目完全一致：**
- Electron: ^39.0.0
- electron-builder: ^25.1.6
- @anthropic-ai/claude-agent-sdk: ^0.1.69
- asar: true（启用ASAR打包）
- asarUnpack: node_modules（解包node_modules）

## 测试内容

1. **自定义spawn配置** - 使用spawnClaudeCodeProcess明确stdio配置
2. **PreToolUse Hook** - 验证Hook回调通道是否正常
3. **生产环境模拟** - 在ASAR打包后的环境测试

## 快速开始

### 1. 安装依赖

```bash
cd C:\Users\admin\Documents\sdk-stdio-test\electron-test
npm install
```

### 2. 打包测试

```bash
npm run pack:win
```

这会在 `dist/win-unpacked/` 目录生成打包后的应用。

### 3. 运行打包后的应用

```bash
cd dist/win-unpacked
ElectronSDKTest.exe
```

或直接双击 `ElectronSDKTest.exe`

## 测试流程

1. 应用启动后自动运行SDK测试
2. 测试会调用Claude API创建一个hello.txt文件
3. 监控stdio streams状态和Hook回调
4. 显示测试结果和详细日志

## 日志位置

测试日志保存在：
```
C:\Users\admin\AppData\Roaming\electron-sdk-stdio-test\electron-sdk-test-{timestamp}.log
```

可通过应用界面的"Open Log File"按钮直接打开。

## 预期结果

### ✅ 成功（stdio通道正常）

日志应显示：
```
🔧 Custom spawn called
  ✅ Process spawned, PID: xxxx
  📊 Streams: stdin=true, stdout=true, stderr=true
🪝 PreToolUse Hook called! Tool: Write
✅ Success
```

### ❌ 失败（stdio通道异常）

日志会显示：
```
❌ stdin error: Stream closed
Error in hook callback: Error: Stream closed
Tool permission request failed: Error: Stream closed
```

## 对比测试

运行此测试后，对比goodable生产环境的表现：

| 项目 | Electron配置 | ASAR | 预期结果 |
|------|-------------|------|---------|
| electron-test | ✅ 相同 | ✅ 启用 | 通过/失败 |
| goodable | ✅ 相同 | ✅ 启用 | 通过/失败 |

如果electron-test通过但goodable失败，说明问题在业务代码的其他配置。
如果两者都失败，说明需要进一步调整spawn配置或SDK版本。

## 故障排查

1. **查看完整日志**：点击"Open Log File"查看详细诊断信息
2. **检查streams状态**：确认stdin/stdout/stderr都为true
3. **对比开发环境**：用`npm start`运行开发版本对比
4. **检查进程退出码**：Process exited的code应为0

## 清理

删除测试文件和日志：
```bash
# 清理构建产物
rm -rf dist

# 清理用户数据（日志）
# Windows: C:\Users\admin\AppData\Roaming\electron-sdk-stdio-test
```
