# Windows Electron Build Script
# One-click build from clean to installer package

param(
    [switch]$SkipClean,
    [switch]$SkipTypeCheck,
    [switch]$OpenDist
)

$ErrorActionPreference = "Stop"

function Write-Info($message) {
    Write-Host "[INFO] $message" -ForegroundColor Cyan
}

function Write-Success($message) {
    Write-Host "[SUCCESS] $message" -ForegroundColor Green
}

function Write-Error($message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
}

function Write-Step($step, $message) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "Step $step : $message" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
}

function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Claudable Windows Build Script v1.0" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# Step 1: Environment Check
Write-Step "1/8" "Environment Check"

if (-not (Test-Command "node")) {
    Write-Error "Node.js not found in PATH"
    exit 1
}

if (-not (Test-Command "npm")) {
    Write-Error "npm not found in PATH"
    exit 1
}

$nodeVersion = node -v
$npmVersion = npm -v
Write-Info "Node.js version: $nodeVersion"
Write-Info "npm version: $npmVersion"

$nodeVersionNumber = [version]($nodeVersion -replace 'v', '')
if ($nodeVersionNumber -lt [version]"20.0.0") {
    Write-Error "Node.js version must be >= 20.0.0, current: $nodeVersion"
    exit 1
}

Write-Success "Environment check passed"

# Step 2: Clean old build artifacts
if (-not $SkipClean) {
    Write-Step "2/8" "Clean old build artifacts"

    # ⚠️ 先清理 dist - 避免后续报错浪费时间
    if (Test-Path "dist") {
        Write-Info "Removing directory: dist (priority)"
        Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
    }

    $cleanDirs = @(".next", "prisma-hidden")
    foreach ($dir in $cleanDirs) {
        if (Test-Path $dir) {
            Write-Info "Removing directory: $dir"
            Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
        }
    }

    Write-Success "Clean completed"
} else {
    Write-Step "2/8" "Skip clean step (--SkipClean)"
}

# Step 3: Type check (optional)
if (-not $SkipTypeCheck) {
    Write-Step "3/8" "TypeScript Type Check"

    Write-Info "Running: npm run type-check"
    npm run type-check

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Type check failed"
        exit 1
    }

    Write-Success "Type check passed"
} else {
    Write-Step "3/8" "Skip type check (--SkipTypeCheck)"
}

# Step 4: Generate Prisma client
Write-Step "4/8" "Generate Prisma Client"

Write-Info "Running: npm run prisma:generate"
npm run prisma:generate

if ($LASTEXITCODE -ne 0) {
    Write-Error "Prisma client generation failed"
    exit 1
}

Write-Success "Prisma client generated"

# Step 5: Build Next.js
Write-Step "5/8" "Build Next.js Application (standalone mode)"

Write-Info "Running: npm run build"
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Next.js build failed"
    exit 1
}

if (-not (Test-Path ".next/standalone/server.js")) {
    Write-Error "Standalone build artifact not generated, check next.config.js"
    exit 1
}

Write-Success "Next.js build completed"

# Step 6: Copy Prisma engine
Write-Step "6/8" "Copy Prisma Engine to prisma-hidden"

if (-not (Test-Path "node_modules/.prisma")) {
    Write-Error "Prisma client directory not found, run prisma:generate first"
    exit 1
}

Write-Info "Copying: node_modules/.prisma -> prisma-hidden"
Copy-Item -Recurse -Force "node_modules/.prisma" "prisma-hidden"

if (-not (Test-Path "prisma-hidden")) {
    Write-Error "prisma-hidden directory creation failed"
    exit 1
}

Write-Success "Prisma engine copied"

# Step 7: Clean standalone build artifacts
Write-Step "7/8" "Clean Standalone Build Artifacts"

Write-Info "Cleaning auto-generated directories in standalone build"

$standaloneCleanDirs = @(
    ".next/standalone/node_modules",
    ".next/standalone/.next/static",
    ".next/standalone/dist",
    ".next/standalone/dist-new",
    ".next/standalone/dist2",
    ".next/standalone/dist3"
)

foreach ($dir in $standaloneCleanDirs) {
    if (Test-Path $dir) {
        Write-Info "Removing: $dir"
        Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
    }
}

# Clean any nul file if exists (Windows special file that shouldn't be in project)
$nulFile = ".next\standalone\nul"
if (Test-Path $nulFile) {
    Write-Info "Removing special file: $nulFile"
    $nulFullPath = (Resolve-Path $nulFile -ErrorAction SilentlyContinue).Path
    if ($nulFullPath) {
        cmd /c "del \\.\$nulFullPath" 2>&1 | Out-Null
    }
}

Write-Success "Standalone cleanup completed"

Write-Info "Removing symlink directories to ensure clean packaging"

$symlinkDirs = @(
    ".next/standalone/node_modules",
    ".next/standalone/.next/static"
)

foreach ($dir in $symlinkDirs) {
    if (Test-Path $dir) {
        Write-Info "Removing: $dir"
        # Use junction-aware removal for Windows
        $fullPath = (Resolve-Path $dir).Path
        if (Test-Path $fullPath) {
            # Check if it's a junction/symlink
            $item = Get-Item $fullPath -Force
            if ($item.LinkType) {
                # Remove junction/symlink without following it
                cmd /c "rmdir `"$fullPath`"" 2>&1 | Out-Null
            } else {
                Remove-Item -Recurse -Force $fullPath -ErrorAction SilentlyContinue
            }
        }
    }
}

Write-Success "Symlink directories removed"

# Step 8: Electron packaging
Write-Step "8/8" "Electron Packaging (Windows NSIS)"

Write-Info "Running: electron-builder --win"
Write-Info "This may take several minutes, please wait..."

npx electron-builder --win

if ($LASTEXITCODE -ne 0) {
    Write-Error "Electron packaging failed"
    exit 1
}

Write-Success "Electron packaging completed"

# Build Summary
$endTime = Get-Date
$duration = $endTime - $startTime
$durationMinutes = [math]::Floor($duration.TotalMinutes)
$durationSeconds = $duration.Seconds

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

Write-Info "Total time: ${durationMinutes}m ${durationSeconds}s"

if (Test-Path "dist") {
    Write-Host ""
    Write-Host "Build Artifacts:" -ForegroundColor Cyan
    Get-ChildItem "dist" -Filter "*.exe" | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  - $($_.Name) ($sizeMB MB)" -ForegroundColor White
    }

    $distPath = Resolve-Path "dist"
    Write-Host ""
    Write-Host "Output directory: $distPath" -ForegroundColor Cyan

    if ($OpenDist) {
        Write-Info "Opening dist directory..."
        Start-Process "explorer.exe" -ArgumentList $distPath
    }
} else {
    Write-Error "dist directory not found, packaging may have failed"
    exit 1
}

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Run installer to test: dist\Claudable Setup *.exe" -ForegroundColor White
Write-Host "  2. Launch app and verify functionality" -ForegroundColor White
Write-Host "  3. Test task submission via API" -ForegroundColor White
Write-Host ""
