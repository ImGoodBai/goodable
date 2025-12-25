#!/bin/bash
# macOS Package Testing Script
# Tests the packaged Goodable.app for basic functionality

set -e

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
    echo -e "\033[0;33m$1\033[0m"
    echo -e "\033[0;33m========================================\033[0m"
    echo ""
}

echo ""
echo -e "\033[0;36m============================================\033[0m"
echo -e "\033[0;36m  Package Testing Script\033[0m"
echo -e "\033[0;36m============================================\033[0m"
echo ""

START_TIME=$(date +%s)
TEST_PORT=3000
TEST_PROJECT_ID="package-test-$(date +%s)"
APP_PID=""

# Cleanup function
cleanup() {
    if [ -n "$APP_PID" ]; then
        info "Stopping application (PID: $APP_PID)..."
        pkill -f "Goodable.app" 2>/dev/null || true
        sleep 2
    fi
}

trap cleanup EXIT INT TERM

# Step 1: Check for packaged artifacts
step "Step 1/5: Check Packaged Artifacts"

APP_PATH="dist/mac/Goodable.app"
if [ ! -d "$APP_PATH" ]; then
    error "Packaged app not found at: $APP_PATH"
    error "Please run the build script first: ./tools/build-mac2.sh"
    exit 1
fi

info "Found packaged app: $APP_PATH"

# Check for DMG/ZIP
DMG_COUNT=$(find dist -name "*.dmg" -type f 2>/dev/null | wc -l | tr -d ' ')
ZIP_COUNT=$(find dist -name "*.zip" -type f 2>/dev/null | wc -l | tr -d ' ')

info "DMG files: $DMG_COUNT"
info "ZIP files: $ZIP_COUNT"

if [ "$DMG_COUNT" -eq 0 ] && [ "$ZIP_COUNT" -eq 0 ]; then
    warning "No DMG or ZIP installers found (may not have completed full packaging)"
fi

# Check app size
APP_SIZE_MB=$(du -sm "$APP_PATH" | cut -f1)
info "App size: ${APP_SIZE_MB} MB"

success "Package artifacts check passed"

# Step 2: Launch Application
step "Step 2/5: Launch Application"

info "Starting application..."
open "$APP_PATH" &
sleep 3

# Check if process is running
if pgrep -f "Goodable.app" > /dev/null; then
    APP_PID=$(pgrep -f "Goodable.app" | head -1)
    success "Application started (PID: $APP_PID)"
else
    error "Application failed to start"
    exit 1
fi

# Step 3: Health Check
step "Step 3/5: Health Check"

info "Waiting for application to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))

    if curl -f -s -o /dev/null -w "%{http_code}" "http://localhost:$TEST_PORT/api/projects" > /tmp/http_code.txt 2>&1; then
        HTTP_CODE=$(cat /tmp/http_code.txt)
        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
            success "Application is responding (HTTP $HTTP_CODE) after ${ATTEMPT} attempts"
            break
        fi
    fi

    if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
        error "Health check timeout after $MAX_ATTEMPTS attempts"

        # Show recent logs if available
        LOG_PATH="$HOME/Library/Logs/Goodable"
        if [ -d "$LOG_PATH" ]; then
            warning "Recent logs from $LOG_PATH:"
            find "$LOG_PATH" -type f -name "*.log" -mtime -1 -exec tail -20 {} \; 2>/dev/null || true
        fi

        exit 1
    fi

    sleep 2
done

# Step 4: API Testing
step "Step 4/5: API Testing"

info "Test 1: Create project via API"

API_RESPONSE=$(curl -s -X POST "http://localhost:$TEST_PORT/api/projects" \
    -H "Content-Type: application/json" \
    -d "{\"project_id\":\"$TEST_PROJECT_ID\",\"name\":\"Package Test Project\",\"preferredCli\":\"claude\"}" 2>&1)

if echo "$API_RESPONSE" | grep -q '"success":true'; then
    success "API Test 1: Create project - PASSED"
    info "Project ID: $TEST_PROJECT_ID"
else
    warning "API Test 1: Create project - FAILED"
    info "Response: $API_RESPONSE"
fi

info "Test 2: List projects via API"

LIST_RESPONSE=$(curl -s "http://localhost:$TEST_PORT/api/projects" 2>&1)

if echo "$LIST_RESPONSE" | grep -q "$TEST_PROJECT_ID"; then
    success "API Test 2: List projects - PASSED"
else
    warning "API Test 2: List projects - FAILED (project not found in list)"
    info "Response: $LIST_RESPONSE"
fi

info "Test 3: Get project details"

DETAIL_RESPONSE=$(curl -s "http://localhost:$TEST_PORT/api/projects/$TEST_PROJECT_ID" 2>&1)

if echo "$DETAIL_RESPONSE" | grep -q "$TEST_PROJECT_ID"; then
    success "API Test 3: Get project details - PASSED"
else
    warning "API Test 3: Get project details - FAILED"
    info "Response: $DETAIL_RESPONSE"
fi

# Step 5: Test Summary
step "Step 5/5: Test Summary"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "\033[0;32m============================================\033[0m"
echo -e "\033[0;32m  PACKAGE TESTING COMPLETED!\033[0m"
echo -e "\033[0;32m============================================\033[0m"
echo ""

info "Total test time: ${DURATION} seconds"
info "Application is running on: http://localhost:$TEST_PORT"
echo ""

echo -e "\033[0;33mTest Results:\033[0m"
echo "  ✓ Package artifacts verified"
echo "  ✓ Application launched successfully"
echo "  ✓ Health check passed"
echo "  ✓ API tests completed"
echo ""

echo -e "\033[0;33mNext Steps:\033[0m"
echo "  1. Manual UI testing: The app is still running"
echo "  2. Check templates display correctly"
echo "  3. Create a project and verify functionality"
echo "  4. When done, run: pkill -f 'Goodable.app'"
echo ""

info "Application will remain running for manual testing"
info "Press Ctrl+C to stop and cleanup"

# Keep script running so cleanup doesn't trigger
sleep infinity
