@echo off
echo ============================================================
echo Coze Manager - Next.js Version
echo ============================================================
echo.
echo Checking dependencies...
echo.

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting development server...
echo.
echo Server will be available at: http://localhost:3000
echo.
echo Press Ctrl+C to stop the server
echo ============================================================
echo.

call npm run dev
