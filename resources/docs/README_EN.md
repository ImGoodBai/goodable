<div align="center">
  <img src="resources/icon.png" width="96" height="96" alt="Goodable Logo" />
  <h1>Goodable</h1>

  <p>
    <a href="README.md">中文</a> | <b>English</b>
  </p>

  <p>
    Cowork-first <b>Desktop AI Agent</b> for knowledge workers: authorize a local folder, automate cleanup, extract information, and produce deliverables — with optional quick tool/page generation when needed.
  </p>

  <p>
    Out of the box: built-in Node.js + Python runtime, integrated with Claude Agent SDK, plus production-ready templates and one-click deployment.
  </p>

  <p>
    <b>If you can type and click, you can start from a local folder task and ship lists/spreadsheets/reports — and optionally turn the workflow into a reusable internal tool.</b>
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

## Cowork Mode Launched (2026-01-13) — Local Folder Task Assistant

**Cowork is all about “local folder tasks”: Authorize folder → Plan → Execute → Progress report → Deliverables.**

Think of it as letting AI work inside a folder you choose: organize, extract, summarize, and generate lists/spreadsheets/reports — and when useful, produce a lightweight tool/page to make the workflow reusable.

**Known-good, batteries included: 4 built-in Cowork Skills to turn folders into deliverables (lists / tables / reports / structured data).**

**4 Built-in Cowork Skills Templates:**
- ✅ **Local Folder Cleanup**: archive by rules, batch rename, generate a structured directory
- ✅ **Invoices & Expense Pack**: extract fields from files/images/text, generate expense reports and summary tables
- ✅ **Contract Triage**: batch process contracts, extract key terms/clauses, output checklists and summaries
- ✅ **Resume Triage**: batch process resumes, extract candidate fields, output structured tables and screening results

**Download the latest release to try Cowork Mode now!** (macOS / Windows installers available)

**Typical workflow:**
- **Input:** a messy folder
- **Process:** cleanup + extraction + summarization
- **Output:** lists/spreadsheets/reports (e.g., expense packs / candidate lists / contract highlights) + optional tool/page

![Cowork Mode Demo](public/screenshot/cowork.gif)

---

## What is Goodable?

Goodable is a Cowork-first Desktop Agent for office work.

It specializes in local files and documents: organizing, extracting information, and producing deliverables — with optional programming capability to turn repeated workflows into reusable tools/pages.

![Goodable Homepage](public/screenshot/index.png)

---

## Positioning & Comparison

Goodable takes a “desktop delivery” approach: office deliverables first, and code/tool building when needed.

- **Cowork-style local office tools**: focus on “file organization and information extraction within authorized folders.” Goodable’s **Cowork Mode** is built around this paradigm, with cross-platform desktop capabilities and a path to templates + deployment.
- **Web-based AI tools** (Coze, Manus, Lovable, Base44, etc.): great for “click and get pages,” but constrained by browser sandboxing — limited local access and deeper workflows.
- **Developer IDE/coding assistants** (Cursor, TRAE, Qoder, Claude Code): powerful, but typically require dev environments, dependencies, and project structure — higher barrier for non-developers.
- **Goodable (our positioning)**: out-of-the-box desktop + Cowork-first office workflows + templates + one-click deployment. Friendly for non-technical users, while keeping engineering depth for advanced use.

---

## What Can You Do With It?

### Cowork Mode (Office Deliverables)
- Local folder cleanup, archiving, batch renaming, directory listing
- Receipts/invoices/expense extraction and summarization
- Contract batch triage and information extraction (checklists/summaries/structured fields)
- Resume batch triage and screening (structured tables/filtering results)
- (Continuously expanding) More Cowork Skills for office scenarios

### Tool/Page Packaging (Make Office Workflows Reusable)
When you want to turn a workflow into a reusable internal tool/page, use the built-in templates below:

- **Turn Coze workflows into websites** (coze2app)
- **Turn Feishu documents into websites** (Feishu Doc → Web)
- **One-click deploy to Alibaba Cloud + domain binding** (publish an accessible site in minutes)
- **Universal short video downloader** (covers major Chinese platforms)
- **WeChat group assistant bot** and other business templates
- Plus: a continuously updated library of production-ready source templates

---

## Core Features (Designed for Non-Technical Users)

- **Out of the box**: built-in Node.js + Python runtime — minimal setup
- **One desktop agent, two kinds of tasks**: Cowork office deliverables + optional tool building (pages/scripts/automation)
- **Stronger generation/transformation**: integrated **Claude Agent SDK** for real-world task execution and maintenance
- **Template marketplace**: one-click import; continuous updates and new templates
- **One-click deployment**: Alibaba Cloud deploy + domain binding — turn “runs locally” into “online and accessible”
- **Engineering-grade**: templates are not demos; they are production-ready skeletons for customization and delivery

<details>
<summary><b>Engineering & Core Architecture (For Technical Users)</b></summary>

- **Claude Agent SDK**: streaming output, controllable sessions and tool invocations
- **Multiple concurrent projects**: task queue, concurrent scheduling, process-level isolation
- **Stability**: process synchronization locks, re-entry protection, exception recovery
- **Multi-instance capability**: multi-window/multi-workspace parallel operation
- **IDE-like interface**: chat + file tree + console + preview (similar to Manus multi-view)
- **Plan mode**: plan first, execute later (extensible to multi-agent orchestration)
- **Progress visualization**: task steps, state transitions, real-time display
- **On-prem / local deployment**: controllable source, local data/runtime, deployable in enterprise intranet
- **Optional API/Web service**: expose the same capabilities as Web services or APIs (developer-oriented)

</details>

---

## Screenshot Preview

| Template Marketplace | Cowork Mode Workspace |
|---|---|
| ![](public/screenshot/02.png) | ![](public/screenshot/cowork.png) |

| Universal Video Downloader | Alibaba Cloud Deployment |
|---|---|
| ![](public/screenshot/07.png) | ![](public/screenshot/03.png) |

---

## How to Use

### Regular Users: Get Started in 3 Steps

1. Download and install the package for your platform → Run → Import a template or select a Cowork folder task → Run/Deploy

> One-click installer — no need to configure Python or Node.js locally.

| macOS (Apple Silicon) | macOS (Intel) | Windows |
|---|---|---|
| [⬇️ Download](https://github.com/ImGoodBai/goodable/releases/latest) | [⬇️ Download](https://github.com/ImGoodBai/goodable/releases/latest) | [⬇️ Download](https://github.com/ImGoodBai/goodable/releases/latest) |

**Note**: Open the Releases page and pick the installer for your platform.

---

### Developers: Customization and Extension

**Run from source**:
```bash
git clone https://github.com/ImGoodBai/goodable.git
cd goodable
npm install
npm run dev:electron
```

**Advanced capabilities**:

* On-prem / intranet deployment
* Expose desktop capabilities as Web services (provide externally via API)
* Customize templates / publish your own templates
* Integrate with enterprise workflows (CI, intranet gateway, permissions)

---

## Templates & Capability List

### Built-in Templates (Tool/Page Packaging)

* ✅ **coze2app**: turn Coze workflows into websites with one click
* ✅ **Feishu Doc → Web**: turn Feishu documents into websites with one click
* ✅ **Universal short video downloader**: support major Chinese platforms
* ✅ **WeChat group assistant bot**: common business skeleton template

### Built-in Cowork Skills (Office Workflows)

* ✅ Local folder cleanup
* ✅ Invoices & expense pack generation
* ✅ Contract triage
* ✅ Resume triage

### More Templates Coming Soon

* 🔲 WeChat Official Account / Xiaohongshu content assistant (collect/rewrite/publish workflows)
* 🔲 E-commerce product selection and listing assistant
* 🔲 Enterprise knowledge base Q&A site (self-hosted)
* 🔲 Recruitment / resume screening assistant (comprehensive workflow version)
* 🔲 Contract / tender generation and review assistant (comprehensive workflow version)
* 🔲 Customer service ticket automation assistant
* 🔲 Automated data collection and cleaning tool
* 🔲 Marketing copy generation and A/B testing assistant
* 🔲 Meeting minutes automatic organization and distribution tool
* 🔲 Multi-platform content synchronization and management tool

> One-click import + continuous updates for new templates

---

## Roadmap

> One direction: turning office work into repeatable Cowork deliverables — and packaging workflows into lightweight tools when needed.

* **More one-click deployments**

  * One-click deploy to: WeChat Mini Program / Alipay Mini Program / Douyin Mini Program / Quick App (planned)
  * One-click generate and deploy: Android / iOS apps (planned)

* **Stronger “clone/refactor” capabilities**

  * One-click clone any website (inspired by open-lovable, but production engineering oriented)
  * Upgrade from “clone UI” to “clone capability + data structure + deployment architecture”

* **Template marketplace upgrade**

  * Support user-published templates (distribution, ratings, versioning, changelogs)
  * Reach **100 production-ready applications** (the “100agent” initiative: open source 100 agent/app templates)

* **Better non-technical experience**

  * Guided wizard for “one-click setup/keys/deploy”
  * Built-in diagnostics and repair (ports, dependencies, permissions, deployment failures)

* **Cowork Mode enhancements**

  * Expand office Cowork Skills (receipts/contracts/HR/material organization/meetings, etc.)
  * Stronger preview and thumbnail views (image/PDF/Office quick preview)
  * Task logs and rollback (avoid accidental operations)
  * Permissions and safety gates (dangerous action confirmations, whitelist policies)

---

## Documentation & Support

* Contact: [Me](https://goodable.cn)
* Usage / Feedback: GitHub Issues (please attach screenshots/logs)
* Contribution: See `resources/docs/CONTRIBUTING.md`
* Security: See `resources/docs/SECURITY.md`

---

## License

This repository is under **MIT License**

---

## Disclaimer

* Please use all capabilities (e.g., content download, automated publishing, bots, etc.) in compliance with platform agreements and local laws and regulations.
