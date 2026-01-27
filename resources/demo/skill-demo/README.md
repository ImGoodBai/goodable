# Skill Demo

Demo for Claude Agent SDK skill system, including dependency management and BS architecture.

## Features

1. **Skill Copy Mechanism** - Copy skills from builtin-skills to user-skills
2. **Auto Dependency Install** - AI auto-detects and installs npm dependencies
3. **Enable/Disable Skills** - Control via marketplace.json skills array
4. **BS Architecture Server** - Express + SSE for real-time progress
5. **PPTX Generation** - Generate PowerPoint with PDF preview

## Directory Structure

```
skill-demo/
├── builtin-skills/      # Built-in skill templates
├── user-skills/         # User installed skills
├── skills-plugin/       # Plugin manifest
├── output/              # Generated files
├── public/              # Static web files
├── claude_skill_demo.ts # Basic skill demo
├── skill_demo_v2.ts     # V2 with dependency mechanism
└── server.ts            # Express server with SSE
```

## Quick Start

### CLI Demo
```bash
npx ts-node demo/skill-demo/skill_demo_v2.ts
```

### Web Server (BS Architecture)
```bash
npx ts-node demo/skill-demo/server.ts
# Visit http://localhost:3456
```

## Requirements

- LibreOffice (for PDF conversion): `brew install --cask libreoffice`
