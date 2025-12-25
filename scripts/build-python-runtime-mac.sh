#!/bin/bash
# Build Python Runtime for macOS
#
# Build method: python-build-standalone (Astral)
#
# Description:
# - Downloads standalone Python builds from astral-sh/python-build-standalone
# - Provides fully portable Python runtime for macOS
# - Supports both x86_64 (Intel) and arm64 (Apple Silicon)
# - Includes pip, venv, and C extensions support
#
# Build target: python-runtime/darwin-{x64|arm64}/bin/
# Python version: 3.12.8
# Support: pip, venv, C extensions

set -e

# Parameters
PYTHON_VERSION="3.12.8"
RELEASE_TAG="20241206"
ARCH="x64"  # Default to x64
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/python-runtime"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --arch)
            ARCH="$2"
            shift 2
            ;;
        --version)
            PYTHON_VERSION="$2"
            shift 2
            ;;
        --release)
            RELEASE_TAG="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--arch x64|arm64] [--version 3.12.8] [--release 20241206]"
            exit 1
            ;;
    esac
done

# Validate architecture
if [ "$ARCH" != "x64" ] && [ "$ARCH" != "arm64" ]; then
    echo "Error: Invalid architecture: $ARCH"
    echo "Supported: x64, arm64"
    exit 1
fi

# Map architecture names
if [ "$ARCH" = "x64" ]; then
    PYTHON_ARCH="x86_64"
    DARWIN_DIR="darwin-x64"
else
    PYTHON_ARCH="aarch64"
    DARWIN_DIR="darwin-arm64"
fi

echo ""
echo "=== Building Python Runtime for macOS ($ARCH) ==="
echo "Python Version: $PYTHON_VERSION"
echo "Release Tag: $RELEASE_TAG"
echo "Architecture: $PYTHON_ARCH-apple-darwin"
echo "Output Directory: $OUTPUT_DIR/$DARWIN_DIR"
echo ""

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo "[1/6] Created temp directory: $TEMP_DIR"

cleanup() {
    echo ""
    echo "Cleaning up temp files..."
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Download Python from python-build-standalone
DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PYTHON_VERSION}+${RELEASE_TAG}-${PYTHON_ARCH}-apple-darwin-install_only.tar.gz"
DOWNLOAD_FILE="$TEMP_DIR/python.tar.gz"

echo ""
echo "[2/6] Downloading Python ${PYTHON_VERSION} for ${PYTHON_ARCH}..."
echo "URL: $DOWNLOAD_URL"

if ! curl -L -f -o "$DOWNLOAD_FILE" "$DOWNLOAD_URL"; then
    echo ""
    echo "Error: Failed to download Python runtime"
    echo "URL: $DOWNLOAD_URL"
    echo ""
    echo "Please check:"
    echo "  1. Release tag is correct: $RELEASE_TAG"
    echo "  2. Python version is available: $PYTHON_VERSION"
    echo "  3. Visit: https://github.com/astral-sh/python-build-standalone/releases/tag/$RELEASE_TAG"
    exit 1
fi

FILE_SIZE=$(du -h "$DOWNLOAD_FILE" | cut -f1)
echo "Downloaded: $FILE_SIZE"

# Extract archive
echo ""
echo "[3/6] Extracting Python runtime..."
EXTRACT_DIR="$TEMP_DIR/extracted"
mkdir -p "$EXTRACT_DIR"
tar -xzf "$DOWNLOAD_FILE" -C "$EXTRACT_DIR"
echo "Extraction complete"

# Find Python directory
# Try python/ first (install_only variant)
if [ -d "$EXTRACT_DIR/python/bin" ]; then
    PYTHON_DIR="$EXTRACT_DIR/python"
elif [ -d "$EXTRACT_DIR/python/install/bin" ]; then
    PYTHON_DIR="$EXTRACT_DIR/python/install"
else
    echo "Error: Python directory not found in expected locations"
    echo "Tried:"
    echo "  - $EXTRACT_DIR/python/bin"
    echo "  - $EXTRACT_DIR/python/install/bin"
    echo ""
    echo "Contents of extract directory:"
    ls -la "$EXTRACT_DIR"
    if [ -d "$EXTRACT_DIR/python" ]; then
        echo ""
        echo "Contents of python directory:"
        ls -la "$EXTRACT_DIR/python"
    fi
    exit 1
fi

if [ ! -f "$PYTHON_DIR/bin/python3" ]; then
    echo "Error: python3 binary not found"
    exit 1
fi

echo "Found Python at: $PYTHON_DIR"

# Create output directory
echo ""
echo "[4/6] Copying Python runtime to output directory..."
TARGET_DIR="$OUTPUT_DIR/$DARWIN_DIR"

if [ -d "$TARGET_DIR" ]; then
    echo "Removing existing runtime at: $TARGET_DIR"
    rm -rf "$TARGET_DIR"
fi

mkdir -p "$TARGET_DIR"
cp -R "$PYTHON_DIR/"* "$TARGET_DIR/"
echo "Copy complete"

# Clean up unnecessary files
echo ""
echo "[5/6] Cleaning up unnecessary files..."

# Remove test files
if [ -d "$TARGET_DIR/lib/python3.12/test" ]; then
    rm -rf "$TARGET_DIR/lib/python3.12/test"
    echo "  - Removed test files"
fi

# Remove idlelib
if [ -d "$TARGET_DIR/lib/python3.12/idlelib" ]; then
    rm -rf "$TARGET_DIR/lib/python3.12/idlelib"
    echo "  - Removed idlelib"
fi

# Remove tkinter
if [ -d "$TARGET_DIR/lib/python3.12/tkinter" ]; then
    rm -rf "$TARGET_DIR/lib/python3.12/tkinter"
    echo "  - Removed tkinter"
fi

# Remove __pycache__ directories
PYCACHE_COUNT=$(find "$TARGET_DIR" -type d -name "__pycache__" | wc -l | tr -d ' ')
if [ "$PYCACHE_COUNT" -gt 0 ]; then
    find "$TARGET_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    echo "  - Removed $PYCACHE_COUNT __pycache__ directories"
fi

echo "Cleanup complete"

# Verify the build
echo ""
echo "[6/6] Verifying Python runtime..."
PYTHON_EXE="$TARGET_DIR/bin/python3"

# Test 1: Version check
VERSION_OUTPUT=$("$PYTHON_EXE" --version 2>&1)
echo "Python Version: $VERSION_OUTPUT"

# Test 2: Check pip
echo ""
echo "Checking pip..."
if "$PYTHON_EXE" -m pip --version >/dev/null 2>&1; then
    PIP_VERSION=$("$PYTHON_EXE" -m pip --version 2>&1)
    echo "pip: $PIP_VERSION"
else
    echo "Warning: pip not available, attempting to install..."
    "$PYTHON_EXE" -m ensurepip --default-pip 2>&1
    if [ $? -eq 0 ]; then
        echo "pip installed successfully"
    else
        echo "Warning: pip installation failed"
    fi
fi

# Test 3: Check C extensions
echo ""
echo "Testing C extensions..."
if "$PYTHON_EXE" -c "import _ctypes, _ssl, _socket; print('C extensions: OK')" 2>&1; then
    echo "C extensions test: PASSED"
else
    echo "Warning: Some C extensions not available"
fi

# Test 4: Check venv
echo ""
echo "Testing venv creation..."
TEST_VENV_DIR="$TEMP_DIR/test-venv"
if "$PYTHON_EXE" -m venv "$TEST_VENV_DIR" 2>&1; then
    if [ -f "$TEST_VENV_DIR/bin/python3" ]; then
        echo "venv test: PASSED"
    else
        echo "Warning: venv creation completed but binary not found"
    fi
else
    echo "Warning: venv creation failed (may not be available in some environments)"
fi

# Test 5: Check if truly standalone
echo ""
echo "Checking standalone status..."
PYTHON_PREFIX=$("$PYTHON_EXE" -c "import sys; print(sys.prefix)")
if echo "$PYTHON_PREFIX" | grep -q "$TARGET_DIR"; then
    echo "Standalone check: PASSED (prefix points to local runtime)"
else
    echo "Warning: Python may depend on system libraries"
    echo "Prefix: $PYTHON_PREFIX"
fi

# Calculate size
echo ""
TOTAL_SIZE=$(du -sh "$TARGET_DIR" | cut -f1)
echo "Runtime Size: $TOTAL_SIZE"

# List key directories
echo ""
echo "Directory structure:"
if [ -d "$TARGET_DIR/bin" ]; then
    BIN_SIZE=$(du -sh "$TARGET_DIR/bin" 2>/dev/null | cut -f1)
    echo "  - bin/ ($BIN_SIZE)"
fi
if [ -d "$TARGET_DIR/lib" ]; then
    LIB_SIZE=$(du -sh "$TARGET_DIR/lib" 2>/dev/null | cut -f1)
    echo "  - lib/ ($LIB_SIZE)"
fi
if [ -d "$TARGET_DIR/include" ]; then
    INCLUDE_SIZE=$(du -sh "$TARGET_DIR/include" 2>/dev/null | cut -f1)
    echo "  - include/ ($INCLUDE_SIZE)"
fi

echo ""
echo "=== Build Complete ==="
echo "Python runtime created at: $TARGET_DIR"
echo "This is a standalone Python installation from python-build-standalone"
echo "You can now use this for projects requiring portable Python"
echo ""

# Explicit success exit
exit 0
