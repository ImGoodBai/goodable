# Form Filling Example

Automate form filling and submission.

```typescript
import {
  launchChrome,
  getPageSession,
  clickElement,
  typeText,
  evaluate
} from '${SKILL_DIR}/scripts/cdp.ts';

// Launch browser to form page
const { cdp, chrome } = await launchChrome('https://example.com/contact');

// Get page session
const session = await getPageSession(cdp, 'example.com');

// Click name input field
await clickElement(session, '#name');
await typeText(session, 'John Doe');

// Click email input field
await clickElement(session, '#email');
await typeText(session, 'john@example.com');

// Click message textarea
await clickElement(session, '#message');
await typeText(session, 'Hello, this is an automated message.');

// Submit form
await clickElement(session, '#submit-button');

// Wait for submission
await sleep(3000);

// Check result
const success = await evaluate<boolean>(
  session,
  'document.querySelector(".success-message") !== null'
);

console.log('Form submitted:', success);

// Cleanup
cdp.close();
chrome.kill();
```
