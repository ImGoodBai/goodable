#!/usr/bin/env node
import { launchChrome, getPageSession, evaluate, sleep } from './cdp.ts';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: extract-text.ts <url> [selector] [wait-seconds]');
    console.error('Example: extract-text.ts https://example.com');
    console.error('Example: extract-text.ts https://example.com "article.content" 3');
    process.exit(1);
  }

  const url = args[0];
  const selector = args[1] || 'body';
  const waitSeconds = args[2] ? parseInt(args[2]) : 2;

  let cdp, chrome;

  try {
    console.log(`[extract-text] Opening: ${url}`);
    ({ cdp, chrome } = await launchChrome(url));

    console.log(`[extract-text] Waiting ${waitSeconds}s for page to load...`);
    await sleep(waitSeconds * 1000);

    const session = await getPageSession(cdp, new URL(url).hostname);

    const title = await evaluate<string>(session, 'document.title');

    const text = await evaluate<string>(
      session,
      `
      (function() {
        const element = document.querySelector('${selector}');
        if (!element) return null;
        return element.innerText.trim();
      })()
      `
    );

    if (text === null) {
      throw new Error(`Element not found: ${selector}`);
    }

    console.log(`[extract-text] ✓ Text extracted successfully`);
    console.log(`[extract-text] Title: ${title}`);
    console.log(`[extract-text] Selector: ${selector}`);
    console.log(`[extract-text] Length: ${text.length} characters`);
    console.log('\n--- Extracted Text ---\n');
    console.log(text);
    console.log('\n--- End ---\n');

    cdp.close();
    chrome.kill();
    process.exit(0);
  } catch (error) {
    console.error(`[extract-text] ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (cdp) cdp.close();
    if (chrome) chrome.kill();
    process.exit(1);
  }
}

main();
