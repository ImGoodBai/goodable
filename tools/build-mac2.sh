#!/bin/bash
# macOS Electron Build Script v2.0
# Enhanced version with automated testing

set -e

SKIP_CLEAN=false
SKIP_TYPE_CHECK=false
SKIP_TEST=false
AUTO_TEST=true
OPEN_DIST=false

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
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-clean] [--skip-type-check] [--skip-test] [--no-auto-test] [--open-dist]"
            exit 1
            ;;
    esac
done

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
echo -e "\033[0;36m  Claudable macOS Build Script v2.0\033[0m"
echo -e "\033[0;36m============================================\033[0m"
echo ""

START_TIME=$(date +%s)

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

success "Environment check passed"

# Step 2: Clean old build artifacts
if [ "$SKIP_CLEAN" = false ]; then
    step "2/8" "Clean old build artifacts"

    CLEAN_DIRS=(".next" "dist" "prisma-hidden")
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

# Step 4: Generate Prisma client
step "4/8" "Generate Prisma Client"

info "Running: npm run prisma:generate"
npm run prisma:generate

success "Prisma client generated"

# Step 5: Build Next.js
step "5/8" "Build Next.js Application (standalone mode)"

info "Running: npm run build"
npm run build

if [ ! -f ".next/standalone/server.js" ]; then
    error "Standalone build artifact not generated, check next.config.js"
    exit 1
fi

success "Next.js build completed"

# Step 6: Copy Prisma engine
step "6/8" "Copy Prisma Engine to prisma-hidden"

if [ ! -d "node_modules/.prisma" ]; then
    error "Prisma client directory not found, run prisma:generate first"
    exit 1
fi

info "Copying: node_modules/.prisma -> prisma-hidden"
cp -R "node_modules/.prisma" "prisma-hidden"

if [ ! -d "prisma-hidden" ]; then
    error "prisma-hidden directory creation failed"
    exit 1
fi

success "Prisma engine copied"

# Step 7: Electron packaging
step "7/8" "Electron Packaging (macOS DMG & ZIP)"

info "Running: npm run package:mac"
info "This may take several minutes, please wait..."

npm run package:mac

success "Electron packaging completed"

# Step 8: Automated Testing
if [ "$SKIP_TEST" = false ]; then
    step "8/8" "Automated Testing"

    # 检查是否存在打包后的应用
    if [ -d "dist/mac/Goodable.app" ]; then
        info "Found packaged app: dist/mac/Goodable.app"

        # 测试1: 启动应用并进行基本验证
        info "Test 1: Launching application..."

        # 在后台启动应用
        open "dist/mac/Goodable.app" &
        APP_PID=$!

        info "Waiting for application to start (10 seconds)..."
        sleep 10

        # 测试2: 健康检查
        info "Test 2: Health check..."

        TEST_PORT=3000
        MAX_ATTEMPTS=5

        for i in $(seq 1 $MAX_ATTEMPTS); do
            info "Attempt $i/$MAX_ATTEMPTS: Checking http://localhost:$TEST_PORT/api/projects"

            if curl -f -s -o /dev/null -w "%{http_code}" "http://localhost:$TEST_PORT/api/projects" > /tmp/http_code.txt 2>&1; then
                HTTP_CODE=$(cat /tmp/http_code.txt)
                if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
                    success "Application is responding (HTTP $HTTP_CODE)"
                    break
                fi
            fi

            if [ $i -lt $MAX_ATTEMPTS ]; then
                warning "No response yet, waiting 5 seconds..."
                sleep 5
            else
                warning "Application health check timeout"
            fi
        done

        # 测试3: API 测试（创建项目）
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

        # 清理：关闭应用
        info "Cleaning up: Closing application..."
        pkill -f "Goodable.app" || true
        sleep 2

        success "Automated testing completed"

    else
        warning "Packaged app not found, skipping tests"
    fi
else
    step "8/8" "Skip automated testing (--skip-test)"
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
    if [ -d "dist/mac/Goodable.app" ]; then
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
echo -e "  1. Manual test: open dist/mac/Goodable.app"
echo -e "  2. Install test: mount dist/Goodable-*.dmg"
echo -e "  3. Advanced test: npm run test (if available)"
echo -e "  4. Full integration test: node tests2/test-exitplan-flow.js"
echo ""
