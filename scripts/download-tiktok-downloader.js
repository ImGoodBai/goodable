#!/usr/bin/env node

/**
 * Download TikTokDownloader from GitHub before electron build
 *
 * Features:
 * - Download specified version (5.8) from GitHub
 * - Extract to skills/good-TTvideo2text/TikTokDownloader/
 * - Clean up unnecessary files (docs, tests, cache, .git, etc.)
 * - Verify critical files exist
 * - Skip if already exists in development environment
 * - Retry mechanism with timeout
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// Configuration
const GITHUB_REPO = 'JoeanAmier/TikTokDownloader';
const VERSION = '5.8'; // Current version used in source code
const BRANCH = 'master'; // Use master branch for version 5.8
const TARGET_DIR = path.resolve(__dirname, '../skills/good-TTvideo2text/TikTokDownloader');
const TEMP_DIR = path.resolve(__dirname, '../temp-tiktok-download');
const DOWNLOAD_TIMEOUT = 60000; // 60 seconds
const MAX_RETRIES = 3;

// Critical files that must exist after extraction
const CRITICAL_FILES = [
  'main.py',
  'pyproject.toml',
  'src/application',
  'src/interface',
  'src/extract',
  'src/tools',
];

// Directories and files to clean up after extraction
const CLEANUP_PATTERNS = [
  '.git',
  '.github',
  '__pycache__',
  '*.pyc',
  'Data',
  'cache',
  'docs',
  'tests',
  '.gitignore',
  '.python-version',
  'Dockerfile',
  '.vscode',
];

/**
 * Check if TikTokDownloader already exists
 */
function checkExisting() {
  if (fs.existsSync(TARGET_DIR) && fs.existsSync(path.join(TARGET_DIR, 'main.py'))) {
    console.log('✓ TikTokDownloader already exists, skipping download');
    return true;
  }
  return false;
}

/**
 * Download file from URL with retry
 */
function downloadFile(url, dest, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from: ${url}`);

    const file = fs.createWriteStream(dest);
    const timeout = setTimeout(() => {
      file.close();
      fs.unlinkSync(dest);
      reject(new Error('Download timeout'));
    }, DOWNLOAD_TIMEOUT);

    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        clearTimeout(timeout);
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest, retries).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        clearTimeout(timeout);
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        clearTimeout(timeout);
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        clearTimeout(timeout);
        file.close();
        fs.unlinkSync(dest);
        reject(err);
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      file.close();
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }

      if (retries > 0) {
        console.log(`Download failed, retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
        setTimeout(() => {
          downloadFile(url, dest, retries - 1).then(resolve).catch(reject);
        }, 2000);
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Extract zip file using adm-zip (cross-platform, UTF-8 filename safe)
 */
function extractZip(zipPath, extractTo) {
  console.log('Extracting archive...');

  // Create extraction directory
  if (!fs.existsSync(extractTo)) {
    fs.mkdirSync(extractTo, { recursive: true });
  }

  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractTo, true);
  } catch (error) {
    throw new Error(`Extraction failed: ${error.message}`);
  }
}

/**
 * Clean up unnecessary files and directories
 */
function cleanupFiles(baseDir) {
  console.log('Cleaning up unnecessary files...');

  CLEANUP_PATTERNS.forEach(pattern => {
    const isGlob = pattern.includes('*');

    if (isGlob) {
      // Handle glob patterns (e.g., *.pyc)
      const ext = pattern.replace('*', '');
      const files = getAllFiles(baseDir);
      files.forEach(file => {
        if (file.endsWith(ext)) {
          try {
            fs.unlinkSync(file);
          } catch (err) {
            // Ignore errors
          }
        }
      });
    } else {
      // Handle directory/file names
      const fullPath = path.join(baseDir, pattern);
      if (fs.existsSync(fullPath)) {
        try {
          if (fs.statSync(fullPath).isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
        } catch (err) {
          console.warn(`Warning: Could not remove ${pattern}: ${err.message}`);
        }
      }
    }
  });

  console.log('✓ Cleanup completed');
}

/**
 * Get all files recursively
 */
function getAllFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Copy directory recursively (cross-platform, cross-partition safe)
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Verify critical files exist
 */
function verifyCriticalFiles(baseDir) {
  console.log('Verifying critical files...');

  const missing = [];

  for (const file of CRITICAL_FILES) {
    const fullPath = path.join(baseDir, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing critical files: ${missing.join(', ')}`);
  }

  console.log('✓ All critical files verified');
}

/**
 * Main execution
 */
async function main() {
  console.log('========================================');
  console.log('TikTokDownloader Auto-Download Script');
  console.log('========================================');
  console.log(`Version: ${VERSION} (${BRANCH} branch)`);
  console.log(`Target: ${TARGET_DIR}`);
  console.log('');

  try {
    // Step 1: Check if already exists
    if (checkExisting()) {
      return;
    }

    // Step 2: Prepare directories
    console.log('Preparing directories...');
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    // Step 3: Download ZIP
    const zipUrl = `https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.zip`;
    const zipPath = path.join(TEMP_DIR, 'source.zip');

    console.log('Downloading TikTokDownloader source code...');
    await downloadFile(zipUrl, zipPath);
    console.log('✓ Download completed');

    // Step 4: Extract
    extractZip(zipPath, TEMP_DIR);
    console.log('✓ Extraction completed');

    // Step 5: Find extracted directory
    const extractedDirs = fs.readdirSync(TEMP_DIR).filter(name => {
      const fullPath = path.join(TEMP_DIR, name);
      return fs.statSync(fullPath).isDirectory();
    });

    if (extractedDirs.length === 0) {
      throw new Error('No directory found after extraction');
    }

    const sourceDir = path.join(TEMP_DIR, extractedDirs[0]);

    // Step 6: Clean up unnecessary files
    cleanupFiles(sourceDir);

    // Step 7: Verify critical files
    verifyCriticalFiles(sourceDir);

    // Step 8: Move to target directory (use copy for cross-partition compatibility on Windows)
    console.log('Moving to target directory...');
    if (fs.existsSync(TARGET_DIR)) {
      fs.rmSync(TARGET_DIR, { recursive: true, force: true });
    }

    // Create parent directory if not exists
    const parentDir = path.dirname(TARGET_DIR);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Use copy instead of rename for cross-partition compatibility
    copyDirRecursive(sourceDir, TARGET_DIR);
    console.log('✓ Moved to target directory');

    // Step 9: Cleanup temp directory
    console.log('Cleaning up temporary files...');
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log('✓ Cleanup completed');

    console.log('');
    console.log('========================================');
    console.log('✓ TikTokDownloader download completed successfully');
    console.log('========================================');

  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('✗ TikTokDownloader download failed');
    console.error('========================================');
    console.error('Error:', error.message);
    console.error('');
    console.error('This script downloads TikTokDownloader from GitHub during the build process.');
    console.error('If the download fails, please check your network connection or GitHub access.');
    console.error('');

    // Cleanup on error
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }

    process.exit(1);
  }
}

// Export for electron-builder beforePack hook
module.exports = main;
