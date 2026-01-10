/**
 * electron-builder afterSign hook
 * 对 node-runtime 目录下的可执行文件进行签名
 * 防止 macOS Gatekeeper 拦截内嵌的 Node.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterSign(context) {
  const { appOutDir, packager } = context;

  // 仅在 macOS 上执行
  if (process.platform !== 'darwin') {
    console.log('[afterSign] Not macOS, skipping node-runtime signing');
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');

  // node-runtime 目录路径（根据 arch 动态确定）
  const arch = packager.packagerOptions.arch || process.arch;
  const nodeRuntimeDir = path.join(resourcesPath, 'node-runtime', `darwin-${arch}`);

  if (!fs.existsSync(nodeRuntimeDir)) {
    console.log(`[afterSign] node-runtime directory not found: ${nodeRuntimeDir}`);
    return;
  }

  console.log(`[afterSign] Signing node-runtime binaries in: ${nodeRuntimeDir}`);

  // 获取签名身份
  const identity = process.env.CSC_NAME || process.env.APPLE_IDENTITY;
  if (!identity) {
    console.log('[afterSign] No signing identity found (CSC_NAME or APPLE_IDENTITY), skipping');
    return;
  }

  // 需要签名的可执行文件
  const binariesToSign = [
    path.join(nodeRuntimeDir, 'bin', 'node'),
  ];

  // 检查并签名每个二进制文件
  for (const binary of binariesToSign) {
    if (!fs.existsSync(binary)) {
      console.log(`[afterSign] Binary not found, skipping: ${binary}`);
      continue;
    }

    try {
      // 使用与主 app 相同的 entitlements
      const entitlements = path.join(__dirname, 'entitlements', 'inherit.plist');

      console.log(`[afterSign] Signing: ${binary}`);

      execSync(
        `codesign --force --deep --sign "${identity}" --entitlements "${entitlements}" --options runtime "${binary}"`,
        { stdio: 'inherit' }
      );

      console.log(`[afterSign] ✓ Signed: ${path.basename(binary)}`);
    } catch (error) {
      console.error(`[afterSign] ✗ Failed to sign ${binary}:`, error.message);
      throw error;
    }
  }

  console.log('[afterSign] node-runtime signing complete');
};
