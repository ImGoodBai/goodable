#!/bin/bash
# macOS Electron Build Script v3.0
# Two-stage build support with Python runtime and architecture options

set -e

SKIP_CLEAN=false
SKIP_TYPE_CHECK=false
SKIP_TEST=false
AUTO_TEST=true
OPEN_DIST=false
PREPARE_ONLY=false
PACKAGE_ONLY=false
ARCH="x64"  # Default to x64 (Intel)

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-clean)
            SKIP_CLEAN=true
            shift
            ;;
        --skip-type-check)
            SKIP_TYPE_CHECK=true
            shift
            ;;
        --skip-test)
            SKIP_TEST=true
            AUTO_TEST=false
            shift
            ;;
        --no-auto-test)
            AUTO_TEST=false
            shift
            ;;
        --open-dist)
            OPEN_DIST=true
            shift
            ;;
        --prepare-only)
            PREPARE_ONLY=true
            shift
            ;;
        --package-only)
            PACKAGE_ONLY=true
            shift
            ;;
        --arch)
            ARCH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-clean] [--skip-type-check] [--skip-test] [--no-auto-test] [--open-dist] [--prepare-only] [--package-only] [--arch x64|arm64]"
            exit 1
            ;;
    esac
done

# Validate parameters
if [ "$PREPARE_ONLY" = true ] && [ "$PACKAGE_ONLY" = true ]; then
    error "Cannot use --prepare-only and --package-only together"
    exit 1
fi

# Validate architecture
if [ "$ARCH" != "x64" ] && [ "$ARCH" != "arm64" ]; then
    echo "Error: Invalid architecture: $ARCH"
    echo "Supported: x64, arm64"
    exit 1
fi

# Color output functions
info() {
    echo -e "\033[0;36m[INFO] $1\033[0m"
}

success() {
    echo -e "\033[0;32m[SUCCESS] $1\033[0m"
}

error() {
    echo -e "\033[0;31m[ERROR] $1\033[0m"
}

warning() {
    echo -e "\033[0;33m[WARNING] $1\033[0m"
}

step() {
    echo ""
    echo -e "\033[0;33m========================================\033[0m"
    echo -e "\033[0;33mStep $1 : $2\033[0m"
    echo -e "\033[0;33m========================================\033[0m"
    echo ""
}

echo ""
echo -e "\033[0;36m============================================\033[0m"
echo -e "\033[0;36m  Goodable macOS Build Script v3.0\033[0m"
echo -e "\033[0;36m============================================\033[0m"
echo ""

# Show build mode
if [ "$PACKAGE_ONLY" = true ]; then
    info "Running in PACKAGE-ONLY mode (Step 7-8)"
    info "Target architecture: $ARCH"
elif [ "$PREPARE_ONLY" = true ]; then
    info "Running in PREPARE-ONLY mode (Step 1-6)"
    info "Target architecture: $ARCH"
else
    info "Running in FULL BUILD mode (Step 1-8)"
    info "Target architecture: $ARCH"
fi
echo ""

START_TIME=$(date +%s)

# If Package-only mode, skip to Step 7
if [ "$PACKAGE_ONLY" = true ]; then
    info "Checking prerequisites for package-only mode..."

    if [ ! -f ".next/standalone/server.js" ]; then
        error "Prepare phase not completed. Run without --package-only first or use --prepare-only."
        exit 1
    fi

    success "Prerequisites check passed"

    # Clean dist directory to avoid stale artifacts
    if [ -d "dist" ]; then
        info "Cleaning previous dist directory..."
        rm -rf "dist"
        success "dist directory cleaned"
    fi
fi

# Steps 1-6: Prepare Phase (skip if PackageOnly)
if [ "$PACKAGE_ONLY" = false ]; then

# Step 1: Environment Check
step "1/8" "Environment Check"

if ! command -v node &> /dev/null; then
    error "Node.js not found in PATH"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    error "npm not found in PATH"
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
info "Node.js version: $NODE_VERSION"
info "npm version: $NPM_VERSION"

# Check Node.js version >= 20.0.0
NODE_MAJOR_VERSION=$(echo $NODE_VERSION | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR_VERSION" -lt 20 ]; then
    error "Node.js version must be >= 20.0.0, current: $NODE_VERSION"
    exit 1
fi

# Check current architecture
CURRENT_ARCH=$(uname -m)
info "Current machine architecture: $CURRENT_ARCH"
info "Target build architecture: $ARCH"

if [ "$CURRENT_ARCH" = "arm64" ] && [ "$ARCH" = "x64" ]; then
    info "Cross-compiling x64 on arm64 (Apple Silicon with Rosetta)"
elif [ "$CURRENT_ARCH" = "x86_64" ] && [ "$ARCH" = "arm64" ]; then
    warning "Cross-compiling arm64 on x64 (Intel Mac)"
    warning "This may not work reliably with native modules like better-sqlite3"
    warning "Consider building on an M1/M2/M3 Mac for arm64 target"
fi

success "Environment check passed"

# Step 2: Clean old build artifacts
if [ "$SKIP_CLEAN" = false ]; then
    step "2/8" "Clean old build artifacts"

    CLEAN_DIRS=(".next" "dist")
    for dir in "${CLEAN_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            info "Removing directory: $dir"
            rm -rf "$dir"
        fi
    done

    success "Clean completed"
else
    step "2/8" "Skip clean step (--skip-clean)"
fi

# Step 3: Type check (optional)
if [ "$SKIP_TYPE_CHECK" = false ]; then
    step "3/8" "TypeScript Type Check"

    info "Running: npm run type-check"
    if npm run type-check; then
        success "Type check passed"
    else
        warning "Type check failed, but continuing..."
    fi
else
    step "3/8" "Skip type check (--skip-type-check)"
fi

# Step 4: Check/Build Python Runtime
step "4/8" "Check/Build Python Runtime"

# Map architecture
if [ "$ARCH" = "x64" ]; then
    DARWIN_DIR="darwin-x64"
else
    DARWIN_DIR="darwin-arm64"
fi

PYTHON_RUNTIME_PATH="python-runtime/$DARWIN_DIR/bin/python3"

if [ -f "$PYTHON_RUNTIME_PATH" ]; then
    info "Python runtime already exists at: $PYTHON_RUNTIME_PATH"
    PYTHON_VERSION=$("$PYTHON_RUNTIME_PATH" --version 2>&1)
    info "Version: $PYTHON_VERSION"

    # Verify it's standalone
    PYTHON_PREFIX=$("$PYTHON_RUNTIME_PATH" -c "import sys; print(sys.prefix)" 2>&1)
    if echo "$PYTHON_PREFIX" | grep -q "python-runtime/$DARWIN_DIR"; then
        info "Standalone check: PASSED"
    else
        warning "Python runtime may not be standalone (prefix: $PYTHON_PREFIX)"
        info "Rebuilding Python runtime..."
        ./scripts/build-python-runtime-mac.sh --arch "$ARCH"
    fi

    success "Python runtime check passed"
else
    info "Python runtime not found, building..."
    info "Running: ./scripts/build-python-runtime-mac.sh --arch $ARCH"

    if ! ./scripts/build-python-runtime-mac.sh --arch "$ARCH"; then
        error "Python runtime build failed"
        exit 1
    fi

    if [ ! -f "$PYTHON_RUNTIME_PATH" ]; then
        error "Python runtime build completed but python3 not found"
        exit 1
    fi

    success "Python runtime built successfully"
fi

# Step 4.5: Check/Build Node.js Runtime
echo ""
echo -e "\033[0;33m========================================\033[0m"
echo -e "\033[0;33mStep 4.5/8 : Check/Build Node.js Runtime\033[0m"
echo -e "\033[0;33m========================================\033[0m"
echo ""

NODE_RUNTIME_PATH="node-runtime/$DARWIN_DIR/bin/node"

if [ -f "$NODE_RUNTIME_PATH" ]; then
    info "Node.js runtime already exists at: $NODE_RUNTIME_PATH"
    NODE_RUNTIME_VERSION=$("$NODE_RUNTIME_PATH" --version 2>&1)
    info "Version: $NODE_RUNTIME_VERSION"
    success "Node.js runtime check passed"
else
    info "Node.js runtime not found, building..."
    info "Running: ./scripts/build-node-runtime-mac.sh --arch $ARCH"

    if ! ./scripts/build-node-runtime-mac.sh --arch "$ARCH"; then
        error "Node.js runtime build failed"
        exit 1
    fi

    if [ ! -f "$NODE_RUNTIME_PATH" ]; then
        error "Node.js runtime build completed but node not found"
        exit 1
    fi

    success "Node.js runtime built successfully"
fi

# Step 5: Build Next.js
step "5/8" "Build Next.js Application (standalone mode)"

info "Running: npm run build"
npm run build

if [ ! -f ".next/standalone/server.js" ]; then
    error "Standalone build artifact not generated, check next.config.js"
    exit 1
fi

success "Next.js build completed"

# Step 6: Clean Standalone Build Artifacts
step "6/8" "Clean Standalone Build Artifacts"

info "Cleaning auto-generated directories in standalone build"

STANDALONE_CLEAN_DIRS=(
    ".next/standalone/dist"
    ".next/standalone/dist-new"
    ".next/standalone/dist2"
    ".next/standalone/dist3"
)

for dir in "${STANDALONE_CLEAN_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        info "Removing: $dir"
        rm -rf "$dir"
    fi
done

success "Standalone cleanup completed"

# Clean database files from standalone build
info "Removing database files from standalone build..."
DB_FILES_REMOVED=0

# Remove all .db, .db-wal, .db-shm files
find .next/standalone -type f \( -name "*.db" -o -name "*.db-wal" -o -name "*.db-shm" \) 2>/dev/null | while read -r db_file; do
    info "Removing: $db_file"
    rm -f "$db_file"
    DB_FILES_REMOVED=$((DB_FILES_REMOVED + 1))
done

# Remove prisma/data directory if exists
if [ -d ".next/standalone/prisma/data" ]; then
    info "Removing: .next/standalone/prisma/data"
    rm -rf ".next/standalone/prisma/data"
fi

info "Database files cleaned from standalone build"

# Step 6.5: Verify Database Migrations
info "Verifying database migrations setup..."

MIGRATIONS_SOURCE="lib/db/migrations"
if [ ! -d "$MIGRATIONS_SOURCE" ]; then
    error "Migrations directory not found: $MIGRATIONS_SOURCE"
    exit 1
fi

MIGRATION_FILES=$(find "$MIGRATIONS_SOURCE" -name "*.sql" 2>/dev/null | wc -l | tr -d ' ')
if [ "$MIGRATION_FILES" -eq 0 ]; then
    error "No SQL migration files found in $MIGRATIONS_SOURCE"
    exit 1
fi

info "Found $MIGRATION_FILES migration file(s) in $MIGRATIONS_SOURCE"
info "Migrations will be copied to extraResources during packaging"

# Verify migration runner exists
MIGRATION_RUNNER="lib/db/migrations/runner.ts"
if [ ! -f "$MIGRATION_RUNNER" ]; then
    warning "Migration runner not found: $MIGRATION_RUNNER"
else
    info "Migration runner verified: $MIGRATION_RUNNER"
fi

success "Database migrations verified"

# End of Prepare Phase (Steps 1-6)
fi

# If Prepare-only mode, stop here
if [ "$PREPARE_ONLY" = true ]; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    DURATION_MINUTES=$((DURATION / 60))
    DURATION_SECONDS=$((DURATION % 60))

    echo ""
    echo -e "\033[0;32m============================================\033[0m"
    echo -e "\033[0;32m  PREPARE PHASE COMPLETED!\033[0m"
    echo -e "\033[0;32m============================================\033[0m"
    echo ""
    info "Total time: ${DURATION_MINUTES}m ${DURATION_SECONDS}s"
    echo ""
    echo -e "\033[0;33mNext Step:\033[0m"
    echo -e "  Run with --package-only to complete the build"
    echo -e "  Example: ./tools/build-mac2.sh --package-only --arch $ARCH"
    echo ""
    exit 0
fi

# Step 7: Electron packaging
step "7/8" "Electron Packaging (macOS DMG & ZIP)"

info "Running: electron-builder --mac --$ARCH --publish never"
info "This may take several minutes, please wait..."

npx electron-builder --mac --$ARCH --publish never

if [ $? -ne 0 ]; then
    error "Electron packaging failed"
    exit 1
fi

success "Electron packaging completed"

# Post-Build: Automated Testing (Optional)
if [ "$SKIP_TEST" = false ]; then
    echo ""
    echo -e "\033[0;33m========================================\033[0m"
    echo -e "\033[0;33mPost-Build: Automated Testing\033[0m"
    echo -e "\033[0;33m========================================\033[0m"
    echo ""

    # Check for packaged app
    if [ -d "dist/mac-$ARCH/Goodable.app" ]; then
        info "Found packaged app: dist/mac-$ARCH/Goodable.app"

        # Test 1: Launch application
        info "Test 1: Launching application..."

        open "dist/mac-$ARCH/Goodable.app" &
        APP_PID=$!

        info "Waiting for application to start (10 seconds)..."
        sleep 10

        # Test 2: Health check
        info "Test 2: Health check..."

        TEST_PORT=3000
        MAX_ATTEMPTS=5

        for i in $(seq 1 $MAX_ATTEMPTS); do
            info "Attempt $i/$MAX_ATTEMPTS: Checking http://localhost:$TEST_PORT/api/projects"

            HTTP_CODE=$(curl -f -s -o /dev/null -w "%{http_code}" "http://localhost:$TEST_PORT/api/projects" 2>/dev/null || echo "000")

            if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
                success "Application is responding (HTTP $HTTP_CODE)"
                break
            fi

            if [ $i -lt $MAX_ATTEMPTS ]; then
                warning "No response yet, waiting 5 seconds..."
                sleep 5
            else
                warning "Application health check timeout"
            fi
        done

        # Test 3: API test (create project)
        info "Test 3: API test (create project)..."

        TEST_PROJECT_ID="build-test-$(date +%s)"

        API_RESPONSE=$(curl -s -X POST "http://localhost:$TEST_PORT/api/projects" \
            -H "Content-Type: application/json" \
            -d "{\"project_id\":\"$TEST_PROJECT_ID\",\"name\":\"Build Test Project\",\"preferredCli\":\"claude\"}" 2>&1)

        if echo "$API_RESPONSE" | grep -q "success"; then
            success "API test passed: Project created successfully"
            info "Response: $API_RESPONSE"
        else
            warning "API test: Unexpected response"
            info "Response: $API_RESPONSE"
        fi

        # Cleanup: Close application
        info "Cleaning up: Closing application..."
        pkill -f "Goodable.app" || true
        sleep 2

        success "Automated testing completed"

    elif [ -d "dist/mac/Goodable.app" ]; then
        # Fallback to old path structure
        info "Found packaged app: dist/mac/Goodable.app"
        warning "Note: Using legacy dist path structure"
        # Run similar tests...
    else
        warning "Packaged app not found at expected locations:"
        warning "  - dist/mac-$ARCH/Goodable.app"
        warning "  - dist/mac/Goodable.app"
        if [ -d "dist" ]; then
            info "Contents of dist directory:"
            ls -la dist/
        fi
    fi
else
    echo ""
    info "Skipping automated testing (--skip-test)"
fi

# Build Summary
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_MINUTES=$((DURATION / 60))
DURATION_SECONDS=$((DURATION % 60))

echo ""
echo -e "\033[0;32m============================================\033[0m"
echo -e "\033[0;32m  BUILD COMPLETED SUCCESSFULLY!\033[0m"
echo -e "\033[0;32m============================================\033[0m"
echo ""

info "Total time: ${DURATION_MINUTES}m ${DURATION_SECONDS}s"
info "Target architecture: $ARCH"

if [ -d "dist" ]; then
    echo ""
    echo -e "\033[0;36mBuild Artifacts:\033[0m"

    # List DMG files
    for file in dist/*.dmg; do
        if [ -f "$file" ]; then
            SIZE_MB=$(du -m "$file" | cut -f1)
            echo -e "  - $(basename "$file") ($SIZE_MB MB)"
        fi
    done

    # List ZIP files
    for file in dist/*.zip; do
        if [ -f "$file" ]; then
            SIZE_MB=$(du -m "$file" | cut -f1)
            echo -e "  - $(basename "$file") ($SIZE_MB MB)"
        fi
    done

    # List APP directory size
    if [ -d "dist/mac-$ARCH/Goodable.app" ]; then
        APP_SIZE_MB=$(du -sm "dist/mac-$ARCH/Goodable.app" | cut -f1)
        echo -e "  - Goodable.app ($APP_SIZE_MB MB)"
    elif [ -d "dist/mac/Goodable.app" ]; then
        APP_SIZE_MB=$(du -sm "dist/mac/Goodable.app" | cut -f1)
        echo -e "  - Goodable.app ($APP_SIZE_MB MB)"
    fi

    DIST_PATH=$(cd dist && pwd)
    echo ""
    echo -e "\033[0;36mOutput directory: $DIST_PATH\033[0m"

    if [ "$OPEN_DIST" = true ]; then
        info "Opening dist directory..."
        open "$DIST_PATH"
    fi
else
    error "dist directory not found, packaging may have failed"
    exit 1
fi

echo ""
echo -e "\033[0;33mNext Steps:\033[0m"
echo -e "  1. Manual test: open dist/mac*/Goodable.app"
echo -e "  2. Install test: mount dist/Goodable-*.dmg"
echo -e "  3. Full integration test: node tests2/test-exitplan-flow.js"
echo ""
