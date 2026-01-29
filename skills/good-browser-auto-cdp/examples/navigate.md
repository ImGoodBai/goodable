# Navigation Example

Basic page navigation and data extraction.

```typescript
import { launchChrome, getPageSession, evaluate } from '${SKILL_DIR}/scripts/cdp.ts';

// Launch browser
const { cdp, chrome } = await launchChrome('https://example.com');

// Get page session
const session = await getPageSession(cdp, 'example.com');

// Extract page title
const title = await evaluate<string>(session, 'document.title');
console.log('Page title:', title);

// Navigate to another page
await navigate(session, 'https://example.com/about');

// Wait for new content
await sleep(2000);

// Cleanup
cdp.close();
chrome.kill();
```
