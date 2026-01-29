#!/usr/bin/env node
import { launchChrome, getPageSession, clickElement, sleep, evaluate } from './cdp.ts';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: click.ts <url> <selector> [wait-before] [wait-after]');
    console.error('Example: click.ts https://example.com "#submit-button" 2 3');
    console.error('Selector examples: #id, .class, button[type="submit"]');
    process.exit(1);
  }

  const url = args[0];
  const selector = args[1];
  const waitBefore = args[2] ? parseInt(args[2]) : 2;
  const waitAfter = args[3] ? parseInt(args[3]) : 3;

  let cdp, chrome;

  try {
    console.log(`[click] Opening: ${url}`);
    ({ cdp, chrome } = await launchChrome(url));

    console.log(`[click] Waiting ${waitBefore}s for page to load...`);
    await sleep(waitBefore * 1000);

    const session = await getPageSession(cdp, new URL(url).hostname);

    // Check if element exists
    const exists = await evaluate<boolean>(
      session,
      `document.querySelector('${selector}') !== null`
    );

    if (!exists) {
      throw new Error(`Element not found: ${selector}`);
    }

    console.log(`[click] Clicking element: ${selector}`);
    await clickElement(session, selector);

    console.log(`[click] ✓ Element clicked successfully`);
    console.log(`[click] Waiting ${waitAfter}s for response...`);
    await sleep(waitAfter * 1000);

    const finalUrl = await evaluate<string>(session, 'window.location.href');
    console.log(`[click] Current URL: ${finalUrl}`);

    cdp.close();
    chrome.kill();
    process.exit(0);
  } catch (error) {
    console.error(`[click] ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (cdp) cdp.close();
    if (chrome) chrome.kill();
    process.exit(1);
  }
}

main();
