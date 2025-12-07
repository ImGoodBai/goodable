# Claudable 安装与启动指南

## 环境要求

- Node.js >= 20.0.0
- npm >= 10.0.0
- Git

## 安装步骤

### 1. 克隆项目
```bash
git clone https://github.com/opactorai/Claudable.git
cd Claudable
```

### 2. 安装依赖

**正常安装：**
```bash
npm install
```

**遇到npm缓存权限问题时：**
```bash
# 使用临时缓存目录
npm install --cache /tmp/npm-cache-claudable
```

**说明：**
- 安装时会自动执行 `postinstall` 脚本
- 自动配置环境变量（.env 和 .env.local）
- 默认端口为 3000
- 自动初始化数据库（SQLite）

## 启动方式

### 方式1：自动配置启动（默认3000端口）

```bash
npm run dev
```

**特点：**
- 每次启动会自动检测可用端口
- 自动更新 .env 配置文件
- 端口范围：3000-3099

### 方式2：手动指定端口（推荐用于固定端口）

**启动到 4006 端口：**
```bash
PORT=4006 WEB_PORT=4006 NEXT_PUBLIC_APP_URL=http://localhost:4006 npx next dev --port 4006
```

**通用格式：**
```bash
PORT=端口号 WEB_PORT=端口号 NEXT_PUBLIC_APP_URL=http://localhost:端口号 npx next dev --port 端口号
```

**特点：**
- 绕过自动配置脚本
- 端口固定不变
- 适合开发调试

## 访问地址

启动成功后访问：
- 本地：http://localhost:端口号
- 网络：http://局域网IP:端口号

## 常见问题

### 1. npm缓存权限错误
```
npm error errno -13
npm error EACCES: permission denied
```

**解决方案：**
```bash
npm install --cache /tmp/npm-cache-claudable
```

### 2. 端口被占用

**现象：**
启动时提示端口已被使用

**解决方案：**
- 使用 `npm run dev` 会自动切换到其他可用端口
- 或手动指定其他端口启动

### 3. 数据库初始化失败

**解决方案：**
```bash
npm run prisma:reset
```

### 4. 依赖冲突

**解决方案：**
```bash
npm run clean      # 清理依赖
npm install        # 重新安装
```

## 关键注意事项

1. **启动脚本自动重置端口**
   - `npm run dev` 会调用 `scripts/setup-env.js`
   - 自动检测端口并更新配置文件
   - 若需固定端口，使用手动启动方式

2. **环境变量配置**
   - `.env` - 项目默认配置
   - `.env.local` - 本地覆盖配置
   - 启动脚本会同时更新两个文件

3. **端口范围规划**
   - Web服务：3000-3099（默认）
   - 预览服务：3100-3999（项目预览端口池）

4. **数据库文件位置**
   - 路径：`data/prod.db`
   - 类型：SQLite
   - 首次运行自动创建

## 其他命令

```bash
# 构建生产版本
npm run build

# 启动生产服务
npm start

# 数据库管理
npm run prisma:studio    # 打开数据库管理界面
npm run prisma:reset     # 重置数据库

# 清理
npm run clean            # 清理依赖
npm run db:backup        # 备份数据库
```

## 桌面应用

```bash
# 开发模式
npm run dev:desktop

# 构建桌面应用
npm run build:desktop

# 打包特定平台
npm run package:mac      # macOS
npm run package:win      # Windows
npm run package:linux    # Linux
```
