# Windows Electron Build Script
# One-click build from clean to installer package
# Supports split build mode for faster iteration

param(
    [switch]$SkipClean,
    [switch]$SkipTypeCheck,
    [switch]$OpenDist,
    [switch]$PrepareOnly,   # Only execute Step 1-5 (prepare phase)
    [switch]$PackageOnly    # Only execute Step 6-8 (package phase)
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
Write-Host "  Goodable Windows Build Script v1.0" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Validate parameters
if ($PrepareOnly -and $PackageOnly) {
    Write-Error "Cannot use -PrepareOnly and -PackageOnly together"
    exit 1
}

if ($PackageOnly) {
    Write-Info "Running in PACKAGE-ONLY mode (Step 6-8)"
    Write-Host ""
} elseif ($PrepareOnly) {
    Write-Info "Running in PREPARE-ONLY mode (Step 1-5)"
    Write-Host ""
} else {
    Write-Info "Running in FULL BUILD mode (Step 1-8)"
    Write-Host ""
}

$startTime = Get-Date

# If PackageOnly mode, skip to Step 6
if ($PackageOnly) {
    Write-Info "Checking prerequisites for package-only mode..."

    if (-not (Test-Path ".next/standalone/server.js")) {
        Write-Error "Prepare phase not completed. Run without -PackageOnly first or use -PrepareOnly."
        exit 1
    }

    Write-Success "Prerequisites check passed"

    # Clean dist directory to avoid stale artifacts (especially nul files)
    if (Test-Path "dist") {
        Write-Info "Cleaning previous dist directory..."
        Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue

        # Verify dist is removed (nul files might prevent deletion)
        if (Test-Path "dist") {
            Write-Host "[WARNING] dist directory could not be fully removed" -ForegroundColor Yellow
            Write-Info "Attempting special cleanup for Windows reserved filenames..."

            # Try to remove using UNC path
            $distFullPath = (Resolve-Path "dist").Path
            cmd /c "rmdir /s /q \\?\$distFullPath" 2>&1 | Out-Null

            if (Test-Path "dist") {
                Write-Error "Cannot remove dist directory. Please manually delete it and try again."
                exit 1
            }
        }

        Write-Success "dist directory cleaned"
    }
}

# Steps 1-5: Prepare Phase (skip if PackageOnly)
if (-not $PackageOnly) {

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

    $cleanDirs = @(".next")
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

# Step 4: Build/Check Python Runtime
Write-Step "4/8" "Build/Check Python Runtime"

$pythonRuntimePath = "python-runtime\win32-x64\bin\python.exe"

if (Test-Path $pythonRuntimePath) {
    Write-Info "Python runtime already exists at: $pythonRuntimePath"
    $pythonVersion = & $pythonRuntimePath --version 2>&1
    Write-Info "Version: $pythonVersion"
    Write-Success "Python runtime check passed"
} else {
    Write-Info "Python runtime not found, building..."
    Write-Info "Running: scripts\build-python-runtime.ps1"

    & ".\scripts\build-python-runtime.ps1"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Python runtime build failed"
        exit 1
    }

    if (-not (Test-Path $pythonRuntimePath)) {
        Write-Error "Python runtime build completed but python.exe not found"
        exit 1
    }

    Write-Success "Python runtime built successfully"
}

# Step 4.5: Build/Check Node.js Runtime
Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Step 4.5/8 : Build/Check Node.js Runtime" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

$nodeRuntimePath = "node-runtime\win32-x64\node.exe"

if (Test-Path $nodeRuntimePath) {
    Write-Info "Node.js runtime already exists at: $nodeRuntimePath"
    $nodeRuntimeVersion = & $nodeRuntimePath --version 2>&1
    Write-Info "Version: $nodeRuntimeVersion"
    Write-Success "Node.js runtime check passed"
} else {
    Write-Info "Node.js runtime not found, building..."
    Write-Info "Running: scripts\build-node-runtime.ps1"

    & ".\scripts\build-node-runtime.ps1"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Node.js runtime build failed"
        exit 1
    }

    if (-not (Test-Path $nodeRuntimePath)) {
        Write-Error "Node.js runtime build completed but node.exe not found"
        exit 1
    }

    Write-Success "Node.js runtime built successfully"
}

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

# Clean nul files from standalone build (Windows special file bug)
$nulFiles = @(
    ".next\standalone\nul",
    "nul"
)
foreach ($nulPath in $nulFiles) {
    if (Test-Path $nulPath) {
        Write-Info "Removing Windows special file: $nulPath"
        try {
            $fullPath = (Resolve-Path $nulPath -ErrorAction SilentlyContinue).Path
            if ($fullPath) {
                cmd /c "del /F /Q \\?\$fullPath" 2>&1 | Out-Null
                Write-Success "Removed $nulPath"
            }
        } catch {
            Write-Host "[WARNING] Could not remove ${nulPath}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Success "Next.js build completed"

# End of Prepare Phase (Steps 1-5)
}

# If PrepareOnly mode, stop here
if ($PrepareOnly) {
    $endTime = Get-Date
    $duration = $endTime - $startTime
    $durationMinutes = [math]::Floor($duration.TotalMinutes)
    $durationSeconds = $duration.Seconds

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  PREPARE PHASE COMPLETED!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Info "Total time: ${durationMinutes}m ${durationSeconds}s"
    Write-Host ""
    Write-Host "Next Step:" -ForegroundColor Yellow
    Write-Host "  Run with -PackageOnly to complete the build" -ForegroundColor White
    Write-Host "  Example: .\tools\build-windows.ps1 -PackageOnly" -ForegroundColor White
    Write-Host ""
    exit 0
}

# Step 6: Clean standalone build artifacts
Write-Step "6/8" "Clean Standalone Build Artifacts"

# Force clean dist directory to avoid nul file issues
if (Test-Path "dist") {
    Write-Info "Removing existing dist directory to avoid nul file issues..."
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue

    # Double check removal
    if (Test-Path "dist") {
        Write-Host "[WARNING] dist directory could not be fully removed" -ForegroundColor Yellow
        try {
            $distFullPath = (Resolve-Path "dist").Path
            cmd /c "rmdir /s /q \\?\$distFullPath" 2>&1 | Out-Null
        } catch {
            Write-Host "[WARNING] Special cleanup also failed, continuing anyway..." -ForegroundColor Yellow
        }
    }
    Write-Success "Dist directory cleaned"
}

Write-Info "Cleaning auto-generated directories in standalone build"

$standaloneCleanDirs = @(
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

Write-Success "Standalone cleanup completed"

# Step 6-7-8: Package with environment protection
# Use try-finally to ensure better-sqlite3 is always restored for dev environment
$packagingFailed = $false
$packagingError = $null

try {
    # Step 6 continued: Rebuild better-sqlite3 for Electron
    Write-Host ""
    Write-Info "🔧 Preparing better-sqlite3 for Electron (MODULE_VERSION 140)..."

    $sqliteNodePath = "node_modules\better-sqlite3\build\Release\better_sqlite3.node"
    $sqliteBackupPath = "${sqliteNodePath}.bak"

    # Try to rename existing .node file (works even if file is locked)
    if (Test-Path $sqliteNodePath) {
        Write-Info "Renaming existing better_sqlite3.node to .bak"
        try {
            if (Test-Path $sqliteBackupPath) {
                Remove-Item -Force $sqliteBackupPath -ErrorAction SilentlyContinue
            }
            Rename-Item -Path $sqliteNodePath -NewName "better_sqlite3.node.bak" -Force -ErrorAction Stop
            Write-Success "Renamed successfully"
        } catch {
            Write-Host "[WARNING] Failed to rename: $_" -ForegroundColor Yellow
            Write-Info "Attempting to delete instead..."
            try {
                Remove-Item -Force $sqliteNodePath -ErrorAction Stop
                Write-Success "Deleted successfully"
            } catch {
                throw "Cannot remove or rename better_sqlite3.node. File may be locked by another process. Please close all Node processes (VSCode, npm, etc.) and try again."
            }
        }
    }

    # Manually rebuild for Electron
    Write-Info "Running: npx electron-rebuild -f -w better-sqlite3"
    npx electron-rebuild -f -w better-sqlite3

    if ($LASTEXITCODE -ne 0) {
        throw "electron-rebuild failed with exit code $LASTEXITCODE"
    }

    # Verify new file was generated
    if (-not (Test-Path $sqliteNodePath)) {
        throw "Rebuild completed but better_sqlite3.node not found"
    }

    Write-Success "better-sqlite3 rebuilt successfully for Electron (MODULE_VERSION 140)"

    # Final cleanup before packaging: Remove any nul files
    Write-Info "Final cleanup: Removing any nul files before packaging..."
    $nulPaths = @(
        ".next\standalone\nul",
        "nul"
    )
    foreach ($nulPath in $nulPaths) {
        if (Test-Path $nulPath -PathType Leaf) {
            try {
                $fullPath = (Resolve-Path $nulPath -ErrorAction SilentlyContinue).Path
                if ($fullPath) {
                    cmd /c "del /F /Q ""\\?\$fullPath""" 2>&1 | Out-Null
                    Write-Success "Removed $nulPath"
                }
            } catch {
                Write-Host "[WARNING] Could not remove ${nulPath}, ignoring..." -ForegroundColor Yellow
            }
        }
    }

    # Step 7: Electron packaging
    Write-Step "7/8" "Electron Packaging (Windows NSIS)"

    Write-Info "Running: electron-builder --win --publish never"
    Write-Info "This may take several minutes, please wait..."

    npx electron-builder --win --publish never

    if ($LASTEXITCODE -ne 0) {
        throw "Electron packaging failed with exit code $LASTEXITCODE"
    }

    Write-Success "Electron packaging completed"

} catch {
    $packagingFailed = $true
    $packagingError = $_
    Write-Host ""
    Write-Host "[ERROR] Packaging failed: $_" -ForegroundColor Red
} finally {
    # Step 8: ALWAYS restore development environment (even if packaging failed)
    Write-Step "8/8" "Restore Development Environment"

    Write-Info "⚠️  CRITICAL: Restoring better-sqlite3 for Node.js (MODULE_VERSION 127)..."
    Write-Info "Waiting for electron-builder to release file locks..."
    Start-Sleep -Seconds 3

    Write-Info "Running: npm rebuild better-sqlite3"

    $rebuildOutput = npm rebuild better-sqlite3 2>&1
    $rebuildSuccess = $LASTEXITCODE -eq 0

    if ($rebuildSuccess) {
        Write-Success "✅ Development environment restored (MODULE_VERSION 127)"
    } else {
        Write-Host "[WARNING] Failed to restore better-sqlite3 for dev environment" -ForegroundColor Yellow
        Write-Host "[WARNING] Run 'npm rebuild better-sqlite3' manually before next dev session" -ForegroundColor Yellow
        Write-Host "[INFO] Error details: $($rebuildOutput | Select-Object -First 3)" -ForegroundColor Gray
    }
}

# If packaging failed, exit with error after cleanup
if ($packagingFailed) {
    Write-Host ""
    Write-Error "Build failed: $packagingError"
    exit 1
}

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
        Write-Host "  - $($_.Name) (${sizeMB} MB)" -ForegroundColor White
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
Write-Host "  1. Run installer to test: dist\Goodable Setup *.exe" -ForegroundColor White
Write-Host "  2. Launch app and verify functionality" -ForegroundColor White
Write-Host "  3. Test task submission via API" -ForegroundColor White
Write-Host ""
