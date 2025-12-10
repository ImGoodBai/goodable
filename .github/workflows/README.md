# GitHub Actions 工作流说明

## build-mac.yml - macOS ARM 打包工作流

### 触发方式

1. **手动触发**（推荐首次使用）
   - GitHub 仓库 → Actions → Build macOS ARM → Run workflow
   - 可选择是否上传构建产物

2. **Tag 推送触发**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   - 自动打包并发布到 GitHub Release

3. **Pull Request 触发**
   - 仅测试构建，不上传产物

### 构建环境

- **Runner**: `macos-latest-xlarge` (Apple Silicon M1)
- **Node.js**: 20.x
- **架构**: ARM64

### 构建流程

1. 检出代码
2. 安装依赖（npm ci）
3. 生成 Prisma 客户端
4. 构建 Next.js 应用
5. Electron 打包
6. 上传构建产物 / 发布 Release

### 环境变量配置

#### 必需（已自动配置）
- `NODE_ENV=production`
- `DATABASE_URL`
- `PROJECTS_DIR`

#### 可选（需配置 GitHub Secrets）
如需在构建时使用 Anthropic API：
1. GitHub 仓库 → Settings → Secrets and variables → Actions
2. 添加 Secret: `ANTHROPIC_API_KEY`
3. 取消注释 workflow 第 52 行

### 构建产物

- **DMG 安装包**: `dist/Claudable-*.dmg`
- **ZIP 压缩包**: `dist/Claudable-*.zip`
- **校验文件**: `dist/*.blockmap`

### 代码签名（可选）

当前配置禁用了代码签名（`CSC_IDENTITY_AUTO_DISCOVERY: false`）。

如需启用签名：
1. 准备 Apple Developer 证书
2. 配置 GitHub Secrets：
   - `CSC_LINK`: Base64 编码的 p12 证书
   - `CSC_KEY_PASSWORD`: 证书密码
   - `APPLE_ID`: Apple ID
   - `APPLE_ID_PASSWORD`: App-specific password
3. 修改 workflow 删除 `CSC_IDENTITY_AUTO_DISCOVERY: false`

### 常见问题

#### Q: 构建失败怎么办？
A: 查看 GitHub Actions 日志，常见原因：
- 依赖安装失败 → 检查 package.json
- Prisma 生成失败 → 检查 schema.prisma
- 打包失败 → 检查 electron-builder 配置

#### Q: 如何减少构建时间？
A: Workflow 已配置 npm cache，首次构建约 15-20 分钟，后续约 8-12 分钟。

#### Q: 免费额度够用吗？
A: GitHub Actions 免费版：
- Public repo: 无限制
- Private repo: 每月 2000 分钟（macOS 算 10 倍）
- 单次构建约 15 分钟 = 150 分钟扣除

### 本地测试

```bash
# 验证 YAML 语法
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-mac.yml'))"

# 使用 actionlint 检查
brew install actionlint
actionlint .github/workflows/build-mac.yml

# 模拟本地构建
npm ci
npm run prisma:generate
npm run build
npm run package:mac
```

### 维护建议

- **定期更新依赖**:
  - `actions/checkout@v4` → 最新版本
  - `actions/setup-node@v4` → 最新版本
  - `actions/upload-artifact@v4` → 最新版本

- **监控构建时长**: 如超过 30 分钟考虑优化

- **备份构建产物**: Artifacts 默认保留 30 天
