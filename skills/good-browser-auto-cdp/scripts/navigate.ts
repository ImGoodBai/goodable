#!/usr/bin/env node
import { launchChrome, getPageSession, evaluate, sleep } from './cdp.ts';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: navigate.ts <url> [wait-seconds]');
    console.error('Example: navigate.ts https://example.com 3');
    process.exit(1);
  }

  const url = args[0];
  const waitSeconds = args[1] ? parseInt(args[1]) : 3;

  let cdp, chrome;

  try {
    console.log(`[navigate] Opening: ${url}`);
    ({ cdp, chrome } = await launchChrome(url));

    console.log(`[navigate] Waiting ${waitSeconds}s for page to load...`);
    await sleep(waitSeconds * 1000);

    const session = await getPageSession(cdp, new URL(url).hostname);

    const title = await evaluate<string>(session, 'document.title');
    const finalUrl = await evaluate<string>(session, 'window.location.href');

    console.log(`[navigate] ✓ Page loaded successfully`);
    console.log(`[navigate] Title: ${title}`);
    console.log(`[navigate] URL: ${finalUrl}`);

    console.log(`[navigate] Browser will stay open. Press Ctrl+C to close.`);

    // Keep browser open
    await new Promise(() => {});
  } catch (error) {
    console.error(`[navigate] ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (cdp) cdp.close();
    if (chrome) chrome.kill();
    process.exit(1);
  }
}

main();
