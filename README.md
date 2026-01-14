<div align="center">
  <img src="resources/icon.png" width="96" height="96" alt="Goodable Logo" />
  <h1>Goodable</h1>

  <p>
    <b>中文</b> | <a href="README_EN.md">English</a>
  </p>

  <p>
    面向非技术人群的 <b>桌面 AI Agent</b>：<b>Code / Work 双模式</b>（开箱即用：内置 Node.js + Python 运行时），集成 ClaudeAgent SDK，内置高质量模板与一键发布能力。
  </p>

  <p>
    <b>哪怕你是文科生，只要会打字、会点鼠标，也能从模板或文件夹任务开始，交付可上线的网站/工具与可用成果。</b>
  </p>

  <p>
    <a href="https://goodable.cn">goodable.cn</a> ·
    <a href="https://github.com/ImGoodBai/goodable/releases">Releases</a> ·
    <a href="https://github.com/ImGoodBai/goodable/issues">Issues</a>
  </p>

  <p>
    <img alt="release" src="https://img.shields.io/github/v/release/ImGoodBai/goodable" />
    <img alt="license" src="https://img.shields.io/github/license/ImGoodBai/goodable" />
    <img alt="stars" src="https://img.shields.io/github/stars/ImGoodBai/goodable?style=flat" />
  </p>
</div>

---

## Work 模式上线（20260113）— work模式 本地文件智能助手

**Work 模式对标 Claude Cowork 的“本地文件夹任务”范式：授权目录 → 计划 → 执行 → 进度汇报。**  
你可以把它理解为：让 AI 在你选定的文件夹里做“整理、提取、生成交付物”的一整套流程。

> 目前已补齐办公场景常用的 Skills（我们已开始内置）。

**已内置 4 个 Work Skills 模板：**
- ✅ **本地文件夹整理**：按规则归档、重命名、生成结构化目录
- ✅ **财务发票 / 报销单生成**：从文件/图片/文本中提取字段，生成报销单/汇总表
- ✅ **合同整理**：批量整理合同文件，提取关键条款与信息，输出清单/摘要
- ✅ **HR 简历整理**：批量整理简历，提取候选人信息，输出结构化表格/筛选结果

**欢迎下载体验最新版本！**（macOS / Windows 安装包已打包发布）

![Work 模式演示](public/screenshot/cowork.gif)

---

## Goodable 是什么？

Goodable 是一个“给普通人用的 AI 工具箱”，核心目标是把“会用 AI”变成“能交付成果”。

你可以把它理解为：**可持续迭代的模板市场 + 强力生成/改造能力 + 一键发布能力**，既能做AI 编程应用交付，也能做办公交付。

![Goodable 首页](public/screenshot/index.png)

---

## 定位与对比

Goodable 走的是“桌面端交付”路线：既支持写代码交付，也支持办公交付。

- **面向专业程序员的 IDE/编程助手**（Cursor/TRAE/Qoder/ClaudeCode）：功能强大且灵活，但通常需要你能处理开发环境、依赖、项目结构，门槛更偏开发者。
- **面向大众的纯 Web AI 工具**（Coze 编程、Manus、海外 Lovable、Base44 等）：强在“点点就出页面”，但受限于浏览器权限，本地资源访问、深度工程能力、私有化空间通常更受限。
- **Claude Cowork 本地办公智能工具**：强调“授权目录内的文件整理与信息提取”。Goodable 的 **Work 模式**对标这一范式，同时提供跨平台桌面端能力，并与模板交付、一键发布打通。
- **Goodable（我们的定位）**：开箱即用 + 本地桌面端 + Code / Work 双模式 + 模板交付 + 一键发布。既照顾非技术用户上手，也给进阶用户保留工程化与私有化空间。

---

## 你能用它做什么？

### Code 模式（应用交付）
- **把 Coze 工作流一键变成网站**（coze2app）
- **把飞书文档一键变成网站**（Feishu Doc → Web）
- **一键发布到阿里云 + 绑定域名**（两分钟上线一个可访问的网站）
- **万能短视频下载**（覆盖国内主流平台）
- **微信群助手机器人** 等常用业务模板
- 以及：持续新增/更新的“可直接跑”的源代码模板库

### Work 模式（办公交付 / Cowork-style）
- 本地文件夹整理、归档、批量重命名、生成清单
- 财务票据/发票/报销材料提取与汇总
- 合同批量整理与信息提取（清单/摘要/结构化字段）
- HR 简历批量整理与筛选（结构化表格/筛选结果）
- （持续新增）更多办公场景 Skills 模板

---

## 核心特性（为非技术用户设计）

- **开箱即用**：内置 Node.js + Python 运行时，尽量不让你被环境折腾
- **双模式**：Code 模式做工程交付；Work 模式做本地文件工作流交付
- **更强的生成/改造能力**：集成 **ClaudeAgent SDK**，适合做“真实任务”的生成、改造与维护
- **模板市场**：一键导入模板；后续可持续拉取新模板/更新
- **一键发布**：阿里云发布 + 域名绑定，把“跑起来”变成“上线可访问”
- **工程化**：模板不是演示代码，是可落地的工程骨架，方便二次开发与交付

### 工程与核心架构（给懂的人看）

- **ClaudeAgent SDK**：流式输出、可控的会话与工具调用
- **支持多个项目并发**：任务队列/并发调度/进程级隔离
- **稳定性**：进程同步锁、重入保护、异常恢复
- **多开能力**：多窗口/多工作区并行
- **IDE 形态**：Chat + 文件树 + 控制台 + 预览（接近 Manus 的多视图）
- **Plan 模式**：先计划后执行（可扩展为多智能体编排）
- **进度可视化**：任务步骤、状态流转、实时展示
- **私有化**：源码可控、本地数据/本地运行时、可做企业内网部署
- **Web 化**：同一套能力可抽成“纯 Web 服务/对外 API”（作为开发者向能力）


---

## 截图预览

| 模板市场 | 万能视频下载 |
|---|---|
| ![](public/screenshot/02.png) | ![](public/screenshot/07.png) |

| 阿里云发布 | 配置页 |
|---|---|
| ![](public/screenshot/03.png) | ![](public/screenshot/04.png) |

| coze2app | 飞书 → 网站 |
|---|---|
| ![](public/screenshot/05.png) | ![](public/screenshot/06.png) |

---

## 使用方式

### 普通用户：3 步上手

1. 下载安装对应平台安装包 → 运行 → 导入模板或选择 Work 模式的文件夹任务 → 运行/发布

> 一键下载安装包即可使用，无需本地配置 Python / Node.js。

| macOS (Apple Silicon / ARM) | macOS (Intel / x86) | Windows |
|---|---|---|
| [⬇️ 下载](https://github.com/ImGoodBai/goodable/releases/latest) | [⬇️ 下载](https://github.com/ImGoodBai/goodable/releases/latest) | [⬇️ 下载](https://github.com/ImGoodBai/goodable/releases/latest) |

**说明**：进入 Release 页面后，选择对应平台的安装包下载即可。

---

### 开发者：二次开发与私有化

**源码运行**：
```bash
git clone https://github.com/ImGoodBai/goodable.git
cd goodable
npm install
npm run dev:electron
```

**进阶能力**：

* 本地/内网私有化部署
* 把桌面能力抽成 Web 服务（API 方式对外提供）
* 自定义模板/上架模板
* 接入企业流程（CI、内网网关、权限）

---

## 模板与能力清单

### 已内置的模板

* ✅ **coze2app**：Coze 工作流一键转网站
* ✅ **Feishu Doc → Web**：飞书文档一键转网站
* ✅ **万能短视频下载**：支持国内主流平台
* ✅ **微信群助手机器人**：常用业务骨架模板

### 已内置的 Work Skills（办公场景模板）

* ✅ 本地文件夹整理
* ✅ 财务发票 / 报销单生成
* ✅ 合同整理
* ✅ HR 简历整理

### 更多模板马上推出

* 🔲 公众号/小红书内容助手（采集/改写/发布工作流）
* 🔲 电商选品与上架助手
* 🔲 企业知识库问答站（私有化部署）
* 🔲 招聘/简历筛选助手（更完整的流程化版本）
* 🔲 合同/标书生成与审阅助手（更完整的流程化版本）
* 🔲 客服工单自动化助手
* 🔲 自动化数据采集与清洗工具
* 🔲 营销文案生成与 A/B 测试助手
* 🔲 会议记录自动整理与分发工具
* 🔲 多平台内容同步与管理工具

> 支持一键导入 + 后续持续拉取新模板更新

---

## Roadmap（路线图）

> 方向只有一个：让“普通人使用 AI”从写代码，变成“持续交付应用 / 交付成果”。

* **更多一键发布**

  * 一键发布到：微信小程序 / 支付宝小程序 / 抖音小程序 / 快应用（规划）
  * 一键生成并发布：Android / iOS App（规划）

* **更强的“复刻/重构”能力**

  * 一键复刻任意网站（参考 open-lovable 的体验，但更偏“可交付工程”）
  * 从“克隆 UI”升级为“复刻产品能力 + 数据结构 + 部署形态”

* **模板市场升级**

  * 支持用户上架模板（模板分发、评分、版本、变更日志）
  * 模板市场达到 **100 款可交付应用**（对应「100agent」计划：我会持续开发/开源 100 个 agent/应用模板）

* **更好的非技术体验**

  * “一键完成环境/密钥/发布”引导式向导
  * 内置诊断与修复（端口、依赖、权限、发布失败自动定位）

* **Work 模式增强（Cowork-style）**

  * 常用办公 Skills 持续补齐（票据/合同/HR/资料整理/会议等）
  * 更强的预览与缩略图视图（图片/PDF/Office 快速预览）
  * 任务日志与可回滚（避免误操作）
  * 权限与安全闸门（危险动作二次确认、白名单策略）

---

## 文档与支持

* 联系： [我](https://goodable.cn)
* 使用/反馈：GitHub Issues（建议附截图/日志）
* 贡献：见 `CONTRIBUTING.md`
* 安全：见 `SECURITY.md`

---

## License

当前仓库为 **MIT License**

---

## 免责声明

* 请在遵守各平台协议与当地法律法规的前提下使用相关能力（例如：内容下载、自动化发布、机器人等场景）。
