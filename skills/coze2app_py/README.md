# Coze OAuth 授权 Demo

这是一个最简化的Coze OAuth授权和Bot调用Demo，用最少的代码实现完整的授权流程和Bot对话功能。

## 功能特性

✅ OAuth 2.0 授权码模式授权
✅ 自动获取用户Bot列表
✅ 选择Bot进行对话
✅ 会话管理（conversation_id）
✅ 单文件Python后端 + 单文件HTML前端
✅ 美观的Material Design风格界面

## 文件结构

```
demo/coze2app/
├── README.md      # 本使用说明
├── arch.md        # 架构设计文档（包含详细API参数）
├── app.py         # Python Flask后端（约230行）
└── index.html     # HTML前端（约350行）
```

## 快速开始

### 1. 前置准备

#### 1.1 在Coze开放平台创建OAuth应用

1. 访问 [Coze开放平台](https://www.coze.cn/open)
2. 登录并创建OAuth应用
3. 配置回调地址：`http://localhost:5000/callback`
4. 申请权限：Bot列表、Bot对话等
5. 获取 `Client ID` 和 `Client Secret`

#### 1.2 安装Python依赖

```bash
pip install flask requests
```

### 2. 配置应用

编辑 `app.py` 文件，修改配置：

```python
CLIENT_ID = 'YOUR_CLIENT_ID'        # 替换为你的Client ID
CLIENT_SECRET = 'YOUR_CLIENT_SECRET' # 替换为你的Client Secret
```

或者使用环境变量（推荐）：

```bash
export COZE_CLIENT_ID="YOUR_CLIENT_ID"
export COZE_CLIENT_SECRET="YOUR_CLIENT_SECRET"
```

### 3. 运行应用

```bash
cd demo/coze2app
python app.py
```

启动成功后会看到：

```
============================================================
Coze OAuth Demo Server
============================================================
Client ID: 你的Client ID
Redirect URI: http://localhost:5000/callback
Server: http://localhost:5000
============================================================

请确保在Coze开放平台配置了正确的回调地址!
访问 http://localhost:5000 开始使用
```

### 4. 使用流程

1. 打开浏览器访问 `http://localhost:5000`
2. 点击「授权Coze账号」按钮
3. 在Coze授权页面点击「同意授权」
4. 自动返回并加载Bot列表
5. 选择一个Bot
6. 开始对话！

## 接口说明

### 后端API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 返回前端页面 |
| `/auth` | GET | 发起OAuth授权 |
| `/callback` | GET | OAuth回调处理 |
| `/api/auth/status` | GET | 检查授权状态 |
| `/api/auth/logout` | GET | 退出登录 |
| `/api/bots` | GET | 获取Bot列表 |
| `/api/chat` | POST | 发送消息到Bot |

详细API参数见 [arch.md](arch.md)

## 常见问题

### Q1: 授权后显示"加载Bot列表失败"

**原因**：可能是权限不足或工作空间ID未配置

**解决**：
1. 确认OAuth应用申请了Bot列表权限
2. 如果需要指定工作空间，在`app.py`中修改`get_bots()`函数添加space_id参数

### Q2: 发送消息没有回复

**原因**：Bot ID错误或Bot未发布

**解决**：
1. 确认选择的Bot已发布
2. 检查Bot是否配置了正确的回复逻辑
3. 查看浏览器控制台和Python终端的错误信息

### Q3: 回调地址错误

**原因**：Coze开放平台配置的回调地址与代码不一致

**解决**：
1. 确保开放平台配置的回调地址是 `http://localhost:5000/callback`
2. 或修改`app.py`中的`REDIRECT_URI`为你配置的地址

### Q4: Token过期怎么办

**当前版本**：Token存储在session中，重启服务会失效

**解决**：重新授权即可（点击"授权Coze账号"）

**生产建议**：实现Refresh Token刷新机制（见扩展建议）

## 技术细节

### OAuth 2.0 授权流程

```
1. 用户点击授权 -> /auth
2. 重定向到Coze授权页面（带state防CSRF）
3. 用户同意授权
4. Coze重定向到 /callback?code=xxx&state=xxx
5. 后端验证state，用code换取access_token
6. 存储token到session
7. 授权完成
```

### 安全措施

- ✅ State参数防止CSRF攻击
- ✅ Session管理用户状态
- ✅ 随机密钥保护session
- ⚠️ Demo版本token存储在内存（生产环境应使用数据库）

## 扩展建议

### 生产环境改进

1. **HTTPS部署**
   - 使用SSL证书
   - 配置域名和正式回调地址

2. **Token持久化**
   ```python
   # 使用Redis或数据库存储token
   redis.set(f'token:{user_id}', access_token, ex=expires_in)
   ```

3. **Refresh Token刷新**
   ```python
   def refresh_access_token():
       response = requests.post(TOKEN_URL, json={
           'grant_type': 'refresh_token',
           'refresh_token': refresh_token
       })
   ```

4. **多用户支持**
   - 添加用户表
   - Token与用户ID关联

5. **错误处理**
   - 添加重试机制
   - 详细的错误日志

6. **流式对话**
   - 使用WebSocket或SSE
   - 实现实时流式输出

### 功能扩展

- [ ] 支持多轮对话上下文
- [ ] 添加对话历史记录
- [ ] 支持图片、文件上传
- [ ] Bot创建和管理功能
- [ ] 工作流(Workflow)调用
- [ ] 多Bot并发对话

## 代码统计

- `app.py`: 约230行（包含注释）
- `index.html`: 约350行（包含CSS和JS）
- **总计**: 约580行代码实现完整功能

## 相关资源

- [Coze开放平台](https://www.coze.cn/open)
- [Coze OAuth文档](https://www.coze.cn/docs/developer_guides/oauth)
- [Coze API文档](https://www.coze.cn/docs/developer_guides/api)
- [架构设计文档](arch.md)

## 许可证

MIT License

---

**🎉 现在你已经掌握了Coze OAuth授权的核心流程！**

基于这个Demo，你可以快速构建自己的Coze应用，比如：
- 企业内部AI助手
- 客服机器人网站
- 个人知识库问答系统
- AI工作流自动化平台

祝你开发愉快！
