/**
 * electron-builder afterSign hook
 * Sign node-runtime executables for macOS Gatekeeper
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterSign(context) {
  const { appOutDir, packager } = context;

  if (process.platform !== 'darwin') {
    console.log('[afterSign] Not macOS, skipping node-runtime signing');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');

  const arch = packager.packagerOptions.arch || process.arch;
  const nodeRuntimeDir = path.join(resourcesPath, 'node-runtime', `darwin-${arch}`);

  if (!fs.existsSync(nodeRuntimeDir)) {
    console.log(`[afterSign] node-runtime directory not found: ${nodeRuntimeDir}`);
    return;
  }

  console.log(`[afterSign] Signing node-runtime binaries in: ${nodeRuntimeDir}`);

  const identity = process.env.CSC_NAME || process.env.APPLE_IDENTITY;
  if (!identity) {
    console.log('[afterSign] No signing identity found (CSC_NAME or APPLE_IDENTITY), skipping');
    return;
  }

  const binDir = path.join(nodeRuntimeDir, 'bin');
  const entitlements = path.join(__dirname, 'entitlements', 'inherit.plist');

  // Sign only real executables, skip symlinks
  const binFiles = fs.readdirSync(binDir);
  for (const file of binFiles) {
    const filePath = path.join(binDir, file);
    const stat = fs.lstatSync(filePath);

    // Skip symlinks (corepack, npm, npx are symlinks to js files)
    if (stat.isSymbolicLink()) {
      console.log(`[afterSign] Skipping symlink: ${file}`);
      continue;
    }

    // Only sign executable files
    if (!stat.isFile()) {
      continue;
    }

    try {
      console.log(`[afterSign] Signing: ${file}`);
      execSync(
        `codesign --force --deep --sign "${identity}" --entitlements "${entitlements}" --options runtime "${filePath}"`,
        { stdio: 'inherit' }
      );
      console.log(`[afterSign] Signed: ${file}`);
    } catch (error) {
      console.error(`[afterSign] Failed to sign ${file}:`, error.message);
      throw error;
    }
  }

  console.log('[afterSign] node-runtime signing complete');
};
