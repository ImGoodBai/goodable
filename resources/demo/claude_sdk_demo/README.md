# Claude SDK Demo

Basic Claude Agent SDK demo for multi-turn conversation.

## Features

1. **Multi-turn Conversation** - Demonstrates SDK query() API
2. **Environment Setup** - Windows builtin runtime paths (Node, Git)
3. **Message Handling** - Process SDK response stream

## Files

```
claude_sdk_demo/
├── claude_sdk_demo.ts   # Full multi-turn demo
└── mini-cowork.ts       # Minimal cowork example
```

## Quick Start

```bash
npx ts-node demo/claude_sdk_demo/claude_sdk_demo.ts
```

## Key Concepts

- `query()` - Send prompt to Claude Agent
- `SDKResultMessage` - Handle response stream
- `permissionMode` - Control tool permissions
