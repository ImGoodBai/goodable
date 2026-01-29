#!/usr/bin/env node
import { launchChrome, getPageSession, clickElement, typeText, evaluate, sleep } from './cdp.ts';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: fill-form.ts <url> <field1:value1> [field2:value2] ...');
    console.error('Example: fill-form.ts https://example.com/form "#name:John Doe" "#email:john@example.com"');
    console.error('Format: "selector:value" pairs');
    process.exit(1);
  }

  const url = args[0];
  const fields: Array<{ selector: string; value: string }> = [];

  for (let i = 1; i < args.length; i++) {
    const parts = args[i].split(':');
    if (parts.length < 2) {
      console.error(`Invalid field format: ${args[i]}`);
      console.error('Expected format: "selector:value"');
      process.exit(1);
    }
    fields.push({
      selector: parts[0],
      value: parts.slice(1).join(':') // Handle values with colons
    });
  }

  let cdp, chrome;

  try {
    console.log(`[fill-form] Opening: ${url}`);
    ({ cdp, chrome } = await launchChrome(url));

    console.log(`[fill-form] Waiting for page to load...`);
    await sleep(2000);

    const session = await getPageSession(cdp, new URL(url).hostname);

    console.log(`[fill-form] Filling ${fields.length} field(s)...`);

    for (const field of fields) {
      // Check if element exists
      const exists = await evaluate<boolean>(
        session,
        `document.querySelector('${field.selector}') !== null`
      );

      if (!exists) {
        throw new Error(`Element not found: ${field.selector}`);
      }

      console.log(`[fill-form] - Filling "${field.selector}": ${field.value.substring(0, 50)}${field.value.length > 50 ? '...' : ''}`);
      await clickElement(session, field.selector);
      await sleep(300);

      // Clear existing value first
      await evaluate(session, `document.querySelector('${field.selector}').value = ''`);
      await sleep(100);

      await typeText(session, field.value);
      await sleep(300);
    }

    console.log(`[fill-form] ✓ All fields filled successfully`);
    console.log(`[fill-form] Browser will stay open for verification. Press Ctrl+C to close.`);

    // Keep browser open for user to verify/submit
    await new Promise(() => {});
  } catch (error) {
    console.error(`[fill-form] ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (cdp) cdp.close();
    if (chrome) chrome.kill();
    process.exit(1);
  }
}

main();
