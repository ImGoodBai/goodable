#!/bin/bash
# Build Node.js Runtime for macOS
# 支持 x64 和 arm64，自动从 SHASUMS256.txt 获取并校验 hash

set -e

NODE_VERSION="22.18.0"
ARCH=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../node-runtime"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --arch) ARCH="$2"; shift 2 ;;
        --version) NODE_VERSION="$2"; shift 2 ;;
        *) echo "Usage: $0 [--arch x64|arm64] [--version 22.18.0]"; exit 1 ;;
    esac
done

# Auto-detect architecture if not specified
if [ -z "$ARCH" ]; then
    MACHINE_ARCH=$(uname -m)
    if [ "$MACHINE_ARCH" = "arm64" ]; then
        ARCH="arm64"
    else
        ARCH="x64"
    fi
    echo "[INFO] Auto-detected architecture: $ARCH"
fi

# Validate architecture
if [ "$ARCH" != "x64" ] && [ "$ARCH" != "arm64" ]; then
    echo "Error: Invalid architecture: $ARCH"
    exit 1
fi

# Map architecture
if [ "$ARCH" = "x64" ]; then
    NODE_ARCH="x64"
    DARWIN_DIR="darwin-x64"
else
    NODE_ARCH="arm64"
    DARWIN_DIR="darwin-arm64"
fi

echo ""
echo "=== Building Node.js Runtime for macOS ($ARCH) ==="
echo "Node.js Version: $NODE_VERSION"
echo ""

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
FILE_NAME="node-v${NODE_VERSION}-darwin-${NODE_ARCH}.tar.gz"
DOWNLOAD_URL="$BASE_URL/$FILE_NAME"
DOWNLOAD_FILE="$TEMP_DIR/node.tar.gz"
SHASUMS_URL="$BASE_URL/SHASUMS256.txt"

# 1. 下载 SHASUMS256.txt 获取预期 hash
echo "[1/7] Fetching SHASUMS256.txt..."
EXPECTED_HASH=$(curl -sL "$SHASUMS_URL" | grep "$FILE_NAME" | awk '{print $1}')

if [ -z "$EXPECTED_HASH" ]; then
    echo "Error: Could not find hash for $FILE_NAME in SHASUMS256.txt"
    exit 1
fi
echo "Expected SHA256: $EXPECTED_HASH"

# 2. Download
echo "[2/7] Downloading from $DOWNLOAD_URL..."
curl -L -o "$DOWNLOAD_FILE" "$DOWNLOAD_URL"

# 3. Verify SHA256
echo "[3/7] Verifying SHA256 checksum..."
ACTUAL_HASH=$(shasum -a 256 "$DOWNLOAD_FILE" | awk '{print $1}')

if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
    echo "Error: SHA256 mismatch!"
    echo "Expected: $EXPECTED_HASH"
    echo "Got: $ACTUAL_HASH"
    exit 1
fi
echo "Checksum verified"

# 4. Extract
echo "[4/7] Extracting..."
tar -xzf "$DOWNLOAD_FILE" -C "$TEMP_DIR"
NODE_DIR="$TEMP_DIR/node-v${NODE_VERSION}-darwin-${NODE_ARCH}"

# 5. Copy
echo "[5/7] Copying to output directory..."
TARGET_DIR="$OUTPUT_DIR/$DARWIN_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

cp -R "$NODE_DIR/bin" "$TARGET_DIR/"
cp -R "$NODE_DIR/lib" "$TARGET_DIR/"

# 6. Set permissions
echo "[6/7] Setting execute permissions..."
chmod +x "$TARGET_DIR/bin/node"
chmod +x "$TARGET_DIR/bin/npm" 2>/dev/null || true
chmod +x "$TARGET_DIR/bin/npx" 2>/dev/null || true

# 7. Clean up unnecessary files
echo "[7/7] Cleaning up unnecessary files..."

# 删除 npm 文档
if [ -d "$TARGET_DIR/lib/node_modules/npm/docs" ]; then
    rm -rf "$TARGET_DIR/lib/node_modules/npm/docs"
    echo "  - Removed npm docs"
fi

# 删除 man pages
if [ -d "$TARGET_DIR/lib/node_modules/npm/man" ]; then
    rm -rf "$TARGET_DIR/lib/node_modules/npm/man"
    echo "  - Removed man pages"
fi

# 删除 changelogs
if [ -d "$TARGET_DIR/lib/node_modules/npm/changelogs" ]; then
    rm -rf "$TARGET_DIR/lib/node_modules/npm/changelogs"
    echo "  - Removed changelogs"
fi

# Verify
echo ""
"$TARGET_DIR/bin/node" --version

# Size
SIZE=$(du -sm "$TARGET_DIR" | cut -f1)
echo "Total size: ${SIZE} MB"

echo ""
echo "=== Node.js Runtime Build Complete ==="
echo "Output: $TARGET_DIR"
