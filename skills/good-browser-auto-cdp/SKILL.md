---
name: good-browser-auto-cdp
displayName: Good浏览器自动化(CDP)
description: Universal browser automation via Chrome DevTools Protocol. Navigate, click, type, evaluate JS, and capture screenshots.
---

# Good Browser Automation (CDP)

A universal browser automation skill powered by Chrome DevTools Protocol (CDP). Provides low-level browser control for automation tasks.

## AI Usage Instructions

**IMPORTANT for AI Agents:**

1. **File Output Paths**: Always save screenshots and files to the **current working directory** unless user specifies otherwise
   - ✅ Use: `./screenshot.png` or `./output.png`
   - ❌ Avoid: `/tmp/screenshot.png` or absolute paths outside project

2. **Default Parameters**: When user doesn't specify output path, omit the parameter to use script defaults (current directory)
   - Example: `tsx screenshot.ts https://example.com` → saves to `./screenshot.png`
   - Example: `tsx screenshot.ts https://example.com ./github.png` → saves to `./github.png`

3. **File Naming**: Use descriptive names based on task context
   - For GitHub: `./github-<repo>.png`
   - For general sites: `./<domain>.png`

4. **After Execution**: After saving files, inform user of the output path relative to project directory

## Features

- Launch Chrome with remote debugging
- Navigate to URLs and interact with pages
- Click elements, type text, paste from clipboard
- Execute JavaScript in page context
- Capture screenshots
- Multi-tab/window management
- Custom Chrome profile support

## Environment Variables

- `BROWSER_CDP_CHROME_PATH` - Custom Chrome executable path (optional)
- `BROWSER_CDP_PROFILE_DIR` - Custom profile directory (optional)

## Quick Start Scripts

Ready-to-use CLI scripts for common tasks:

### 1. Screenshot
```bash
tsx ${SKILL_DIR}/scripts/screenshot.ts <url> [output-path] [wait-seconds]

# Example
tsx ${SKILL_DIR}/scripts/screenshot.ts https://example.com ./page.png 3
```

### 2. Navigate
```bash
tsx ${SKILL_DIR}/scripts/navigate.ts <url> [wait-seconds]

# Example - opens browser and keeps it open
tsx ${SKILL_DIR}/scripts/navigate.ts https://github.com 2
```

### 3. Click Element
```bash
tsx ${SKILL_DIR}/scripts/click.ts <url> <selector> [wait-before] [wait-after]

# Example
tsx ${SKILL_DIR}/scripts/click.ts https://example.com "#submit-btn" 2 3
```

### 4. Extract Text
```bash
tsx ${SKILL_DIR}/scripts/extract-text.ts <url> [selector] [wait-seconds]

# Example - extract entire page
tsx ${SKILL_DIR}/scripts/extract-text.ts https://example.com

# Example - extract specific element
tsx ${SKILL_DIR}/scripts/extract-text.ts https://example.com "article.content" 3
```

### 5. Fill Form
```bash
tsx ${SKILL_DIR}/scripts/fill-form.ts <url> <field1:value1> [field2:value2] ...

# Example
tsx ${SKILL_DIR}/scripts/fill-form.ts https://example.com/contact \
  "#name:John Doe" \
  "#email:john@example.com" \
  "#message:Hello World"
```

## Core API (Advanced Usage)

### Launch Browser

```typescript
import { launchChrome } from '${SKILL_DIR}/scripts/cdp.ts';

const { cdp, chrome } = await launchChrome('https://example.com');
```

### Get Page Session

```typescript
import { getPageSession } from '${SKILL_DIR}/scripts/cdp.ts';

const session = await getPageSession(cdp, 'example.com');
```

### Click Element

```typescript
import { clickElement } from '${SKILL_DIR}/scripts/cdp.ts';

await clickElement(session, '#submit-button');
```

### Type Text

```typescript
import { typeText } from '${SKILL_DIR}/scripts/cdp.ts';

await typeText(session, 'Hello World');
```

### Execute JavaScript

```typescript
import { evaluate } from '${SKILL_DIR}/scripts/cdp.ts';

const title = await evaluate<string>(session, 'document.title');
```

### Capture Screenshot

```typescript
import { screenshot } from '${SKILL_DIR}/scripts/cdp.ts';

const base64Image = await screenshot(session, { format: 'png' });
```

## Usage Scenarios

1. **Web Scraping** - Extract data from dynamic web pages
2. **Form Automation** - Fill and submit forms automatically
3. **Testing** - Automated UI testing workflows
4. **Content Publishing** - Automate posting to web platforms
5. **Monitoring** - Periodic screenshots and data collection

## Technical Notes

- Uses native WebSocket connection to Chrome DevTools
- Supports Chrome, Chrome Canary, and Chromium
- Cross-platform: macOS, Windows, Linux
- Minimal dependencies (Node.js built-ins only)
- Session management for multi-page operations

## Examples

See `examples/` directory for detailed use cases:
- `navigate.md` - Navigation and page loading
- `fill-form.md` - Form filling automation
