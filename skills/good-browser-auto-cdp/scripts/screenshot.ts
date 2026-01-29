#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { launchChrome, getPageSession, screenshot, sleep } from './cdp.ts';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: screenshot.ts <url> [output-path] [wait-seconds]');
    console.error('Example: screenshot.ts https://example.com ./screenshot.png 2');
    process.exit(1);
  }

  const url = args[0];
  const outputPath = args[1] || './screenshot.png';
  const waitSeconds = args[2] ? parseInt(args[2]) : 2;

  let cdp, chrome;

  try {
    console.log(`[screenshot] Launching Chrome and navigating to: ${url}`);
    ({ cdp, chrome } = await launchChrome(url));

    console.log(`[screenshot] Waiting for page to load...`);
    await sleep(waitSeconds * 1000);

    const session = await getPageSession(cdp, new URL(url).hostname);

    console.log(`[screenshot] Capturing screenshot...`);
    const base64Image = await screenshot(session, { format: 'png' });

    const buffer = Buffer.from(base64Image, 'base64');
    await writeFile(outputPath, buffer);

    console.log(`[screenshot] ✓ Screenshot saved to: ${outputPath}`);
    console.log(`[screenshot] Size: ${(buffer.length / 1024).toFixed(2)} KB`);

    cdp.close();
    chrome.kill();
    process.exit(0);
  } catch (error) {
    console.error(`[screenshot] ✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (cdp) cdp.close();
    if (chrome) chrome.kill();
    process.exit(1);
  }
}

main();
