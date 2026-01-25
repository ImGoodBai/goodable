# Skills Integration Guide

## Overview

Goodable skills are Claude SDK plugins that extend AI capabilities with specialized tools.

### Builtin vs User Skills

- **Builtin Skills** (`skills/` directory): Shipped with app, auto-initialized on first run or version upgrade
- **User Skills** (`user-skills/` directory): User-imported skills, preserved across updates

### Key Concepts

- Skills are auto-copied from `skills/` to writable `user-skills/` directory on startup
- Each skill is a directory containing `SKILL.md` (required) and optional dependencies
- Skills can be enabled/disabled via UI without deleting files
- Configuration is split into SDK-compliant `plugin.json` and extended `plugin-ex.json`

## Directory Structure

```
skills/                          # Builtin skills (read-only, shipped with app)
└── <skill-name>/
    ├── SKILL.md                 # Required: skill definition
    ├── package.json             # Optional: npm dependencies
    ├── requirements.txt         # Optional: Python dependencies
    ├── scripts/                 # Optional: helper scripts
    └── ...

user-skills/                     # User skills (writable, in userData directory)
├── .claude-plugin/
│   ├── plugin.json              # SDK standard config (enabled skills only)
│   └── plugin-ex.json           # Extended config (disabled list, version tracking)
├── <skill-name>/                # Same structure as builtin skills
└── ...
```

## Configuration Priority

**template.json is the primary config file for Goodable**, used for both skills and apps.

| File | Purpose | When to Use |
|------|---------|-------------|
| `template.json` | Goodable primary config | Always preferred. Supports all fields (metadata, envVars, etc.) |
| `SKILL.md` | Claude SDK standard | For SDK skill instructions. Metadata is fallback only |

**Why two files?**
- `SKILL.md`: Industry standard for Claude SDK plugins. Contains AI instructions (markdown body) and basic metadata (frontmatter). We keep compatibility with community skills.
- `template.json`: Goodable's extended config. Supports additional fields like `envVars`, `category`, `tags`. Takes priority for all metadata fields.

**Reading Priority**:
1. Read `template.json` first (if exists) → primary metadata source
2. Fallback to `SKILL.md` frontmatter (if template.json missing)
3. For AI instructions: always read `SKILL.md` body (markdown content)

## Skill Types

Skills directory supports two types:

| Type | Required Files | hasSkill | hasApp | Description |
|------|----------------|----------|--------|-------------|
| **Pure Skill** | SKILL.md | ✓ | ✗ | AI-callable skill with instructions |
| **App Template** | template.json (with projectType) | ✗ | ✓ | Runnable BS application |
| **Hybrid** | Both | ✓ | ✓ | Skill + runnable application |

**Recommended**: Use `template.json` for metadata + `SKILL.md` for AI instructions.

### Detection Logic

- `hasSkill`: Has `SKILL.md` file → Can be enabled/disabled for AI
- `hasApp`: Has `projectType` field (in template.json or SKILL.md) → Can run/fork as project

### Metadata Priority

When both files exist, `template.json` takes priority for metadata (displayName, description, etc.).

## template.json Format (App Template)

For runnable applications (BS architecture):

```json
{
  "displayName": "Coze2App",
  "description": "One-click convert Coze workflow to accessible website",
  "category": "AI应用",
  "tags": ["AI", "Coze", "商业化"],
  "version": "2.0.0",
  "author": "古德白",
  "preview": "preview.png",
  "projectType": "python-fastapi",
  "envVars": [
    {
      "key": "COZE_API_KEY",
      "label": "Coze API 密钥",
      "required": true,
      "secret": true,
      "placeholder": "pat_xxxx"
    },
    {
      "key": "COZE_BOT_ID",
      "label": "Bot ID",
      "required": true,
      "secret": false,
      "placeholder": "bot_xxxx"
    }
  ]
}
```

### Basic Fields

| Field | Required | Description |
|-------|----------|-------------|
| `displayName` | Yes | Display name in UI |
| `description` | Yes | Brief description |
| `category` | No | Category for filtering |
| `tags` | No | Tags array for search |
| `version` | No | Version number |
| `author` | No | Author name |
| `preview` | No | Preview image filename |
| `projectType` | Yes | `python-fastapi` or `nextjs` |

**Note**: `name` (internal ID) is derived from directory name, not stored in file.

### Environment Variables (envVars)

Define required environment variables for the app. Values are stored in `.env` file.

| Field | Required | Description |
|-------|----------|-------------|
| `key` | Yes | Environment variable name (written to .env) |
| `label` | Yes | Display label in UI |
| `required` | Yes | Whether this variable must be filled before running |
| `secret` | No | If true, UI shows password input (default: false) |
| `placeholder` | No | Input placeholder hint |
| `default` | No | Default value (for non-required vars) |

**UI Behavior**:
- When `hasApp` is true and `envVars` contains `required: true` items
- Click "Run" will check if all required values are filled
- If not filled, prompt user to configure before running

## SKILL.md Format (Pure Skill)

For AI-callable skills:

```yaml
---
name: skill-name        # Must match directory name
displayName: My Skill   # Optional: display name for UI (Chinese recommended)
description: "..."      # Brief description for AI to decide when to use
---

# Skill content (markdown instructions for AI)
```

## Configuration Files

Skills are managed by two configuration files in `user-skills/.claude-plugin/`:

### plugin.json (SDK Standard)

Contains only Claude SDK standard fields:

```json
{
  "name": "goodable-skills",
  "description": "Goodable managed skills",
  "version": "1.0.0",
  "skills": ["./pdf", "./pptx"]
}
```

Read by Claude SDK to load skills. Must comply with SDK schema validation.

### plugin-ex.json (Extended Config)

Contains Goodable-specific extended fields:

```json
{
  "disabledSkills": ["skill-name"],
  "builtinVersion": "0.7.17"
}
```

**Why separate files?**

Claude SDK's `plugin.json` has strict schema validation and rejects custom fields. Our extended fields (`disabledSkills`, `builtinVersion`) would cause validation errors, so we store them separately.

**How disable works:**

1. User clicks "Disable" in UI
2. Skill name added to `plugin-ex.json` -> `disabledSkills`
3. Skill path removed from `plugin.json` -> `skills` array
4. SDK won't load disabled skills, but files remain on disk

## Skills Lifecycle

### First Run (or Version Upgrade)

1. Check `plugin-ex.json` -> `builtinVersion` vs current app version
2. If different (or missing), copy all builtin skills from `skills/` to `user-skills/`
3. Preserve existing `node_modules/` during copy (skip re-installing dependencies)
4. Update `builtinVersion` to current app version
5. Generate `plugin.json` based on actual directory contents

### Every Startup

1. Scan `user-skills/` directory for valid skills (has `SKILL.md`)
2. Validate and update `plugin.json`:
   - Add new skills (from imports or manual additions)
   - Remove skills whose directories no longer exist
   - Filter out disabled skills (from `plugin-ex.json`)
3. Claude SDK loads skills from `plugin.json` -> `skills` array

### Version Upgrade Behavior

When app version changes (e.g., 0.7.16 -> 0.7.17):

- Builtin skills are re-copied from `skills/` (overwrite old versions)
- `node_modules/` is preserved (skip redundant `npm install`)
- User-imported skills are untouched
- Disabled skills list is preserved

## Adding & Maintaining Skills

### Add Builtin Skill (Developers)

1. Create skill directory in `skills/`:

```bash
mkdir skills/my-new-skill
cd skills/my-new-skill
```

2. Create `SKILL.md`:

```yaml
---
name: my-new-skill
displayName: My New Skill
description: "Describe when AI should use this skill"
---

# Skill Instructions

Detailed markdown instructions for AI on how to use this skill...
```

3. (Optional) Add dependencies:

```bash
# For Node.js dependencies
npm init -y
npm install some-package

# For Python dependencies
echo "requests>=2.28.0" > requirements.txt
```

4. Test locally:
   - Delete `user-skills/.claude-plugin/plugin-ex.json` to force re-init
   - Restart app
   - Check skill appears in UI

5. Commit to git:

```bash
git add skills/my-new-skill
git commit -m "feat: add my-new-skill"
```

### Import User Skill (End Users)

1. Open Goodable -> Workspace tab -> Skills section
2. Click "Import" button
3. Select skill ZIP file (must contain wrapper directory with `SKILL.md`)
4. Skill auto-extracted to `user-skills/`

### Disable/Enable Skills

Via UI:
- Open Workspace -> Skills
- Toggle switch for each skill
- Changes saved to `plugin-ex.json` immediately

### Delete Skills

- **Builtin skills**: Cannot be deleted (will be restored on version upgrade)
- **User-imported skills**: Click delete button in Skills list, or manually remove directory

## Dependencies

### Node.js (package.json)

```json
{
  "name": "skill-name",
  "version": "1.0.0",
  "dependencies": {
    "package": "^x.x.x"
  }
}
```

AI will auto-detect and run `npm install` when `node_modules` is missing.

### Python (requirements.txt)

```
package-name==x.x.x
another-package>=x.x.x
```

AI will auto-detect and run `pip install -r requirements.txt` when needed.

## Runtime Behavior

### Startup Sequence

1. **Version Check**: Compare `plugin-ex.json` -> `builtinVersion` with current app version
2. **Auto-Initialize** (if version mismatch):
   - Copy all skills from `skills/` to `user-skills/`
   - Skip `node_modules/` during copy (preserve existing dependencies)
   - Update `builtinVersion` to current version
3. **Config Validation**:
   - Scan `user-skills/` for valid skills (has `SKILL.md`)
   - Skip `.git`, `node_modules`, and dot-prefixed directories
   - Generate `plugin.json` with enabled skills
   - Clean up `plugin-ex.json` (remove deleted skills from `disabledSkills`)
4. **SDK Loading**: Claude SDK reads `plugin.json` -> `skills` array

### Dependency Management

- **Node.js**: Auto-detected via `package.json`, AI runs `npm install` when needed
- **Python**: Auto-detected via `requirements.txt`, AI runs `pip install -r requirements.txt`
- **Builtin Runtimes**: App ships with Node.js/Python runtimes for Windows/macOS

## Debugging & Troubleshooting

### Enable SDK Debug Logs

Set environment variable before starting app:

```bash
# macOS/Linux
export DEBUG_CLAUDE_SDK=true
npm run dev

# Windows
set DEBUG_CLAUDE_SDK=true
npm run dev
```

Debug logs written to: `~/.claude/debug/`

### Common Issues

**Q: Skill not loading after adding to `skills/`?**

A: Force re-initialization:
1. Delete `user-skills/.claude-plugin/plugin-ex.json`
2. Restart app (will re-copy all builtin skills)

**Q: Disabled skill still showing in Claude?**

A: Check two files match:
- `plugin.json` should NOT contain disabled skill path
- `plugin-ex.json` should contain disabled skill name in `disabledSkills`

**Q: Where are disabled skills stored?**

A: Files remain in `user-skills/skill-name/`, only removed from `plugin.json`. To permanently delete, remove directory manually.

**Q: Skill dependencies not installing?**

A: Check `node_modules/` exists, or manually run `npm install` in skill directory.

**Q: marketplace.json found in .claude-plugin?**

A: Legacy file from old versions, safe to delete. Current system uses `plugin.json` + `plugin-ex.json`.

## Key Notes

- Directory name should match `name` field in SKILL.md
- Keep dependencies minimal (affects first-run install time)
- Scripts should use relative paths from skill directory
- Test on both macOS and Windows if using shell scripts
- For Python: prefer cross-platform packages, avoid OS-specific modules
