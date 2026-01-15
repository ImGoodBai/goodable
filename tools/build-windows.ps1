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
Write-Step "1/6" "Environment Check"

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
    Write-Step "2/6" "Clean old build artifacts"

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
    Write-Step "2/6" "Skip clean step (--SkipClean)"
}

# Step 3: Type check (optional)
if (-not $SkipTypeCheck) {
    Write-Step "3/6" "TypeScript Type Check"

    Write-Info "Running: npm run type-check"
    npm run type-check

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Type check failed"
        exit 1
    }

    Write-Success "Type check passed"
} else {
    Write-Step "3/6" "Skip type check (--SkipTypeCheck)"
}

# Step 4: Build/Check Python Runtime
Write-Step "4/6" "Build/Check Python Runtime"

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
Write-Host "Step 4.5/6 : Build/Check Node.js Runtime" -ForegroundColor Yellow
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

# Step 4.6: Build/Check Git Runtime
Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Step 4.6/6 : Build/Check Git Runtime (PortableGit)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

$gitRuntimePath = "git-runtime\win32-x64\cmd\git.exe"
$bashRuntimePath = "git-runtime\win32-x64\bin\bash.exe"

if ((Test-Path $gitRuntimePath) -and (Test-Path $bashRuntimePath)) {
    Write-Info "Git runtime already exists"
    $gitVersion = & $gitRuntimePath --version 2>&1
    Write-Info "Version: $gitVersion"

    # Check if already trimmed (size < 200MB indicates trimmed)
    $gitRuntimeSize = (Get-ChildItem -Path "git-runtime\win32-x64" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
    if ($gitRuntimeSize -gt 200) {
        Write-Info "Git runtime not trimmed yet ($([math]::Round($gitRuntimeSize, 0)) MB), running trim script..."
        & ".\scripts\trim-git-runtime.ps1" -SkipBackup
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Git runtime trim failed"
            exit 1
        }
        Write-Success "Git runtime trimmed successfully"
    } else {
        Write-Info "Git runtime already trimmed ($([math]::Round($gitRuntimeSize, 0)) MB)"
    }

    Write-Success "Git runtime check passed"
} else {
    Write-Info "Git runtime not found, building..."
    Write-Info "Running: scripts\build-git-runtime.ps1"

    & ".\scripts\build-git-runtime.ps1"

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Git runtime build failed"
        exit 1
    }

    if (-not (Test-Path $bashRuntimePath)) {
        Write-Error "Git runtime build completed but bash.exe not found"
        exit 1
    }

    # Trim after fresh build
    Write-Info "Trimming git runtime..."
    & ".\scripts\trim-git-runtime.ps1" -SkipBackup
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Git runtime trim failed"
        exit 1
    }

    Write-Success "Git runtime built and trimmed successfully"
}

# Clean up git-runtime-removed if exists (should not be packaged)
if (Test-Path "git-runtime-removed") {
    Write-Info "Removing git-runtime-removed directory (not needed for packaging)"
    Remove-Item -Recurse -Force "git-runtime-removed"
}

# Step 5: Build Next.js
Write-Step "5/6" "Build Next.js Application (standalone mode)"

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

# Clean duplicate runtime directories from standalone (handled by extraResources)
$standaloneRuntimes = @(
    ".next\standalone\git-runtime",
    ".next\standalone\node-runtime"
)
foreach ($runtimeDir in $standaloneRuntimes) {
    if (Test-Path $runtimeDir) {
        Write-Info "Removing duplicate runtime from standalone: $runtimeDir"
        Remove-Item -Recurse -Force $runtimeDir
        Write-Success "Removed $runtimeDir"
    }
}

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
Write-Step "5.5/6" "Clean Standalone Build Artifacts"

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

# Step 6: Final cleanup and Electron packaging
# Note: No electron-rebuild needed - main process does not require native modules
# Next.js subprocess runs on node-runtime (not Electron's Node)

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

Write-Step "6/6" "Electron Packaging (Windows NSIS)"

Write-Info "Running: electron-builder --win --publish never"
Write-Info "This may take several minutes, please wait..."

npx electron-builder --win --publish never

if ($LASTEXITCODE -ne 0) {
    Write-Error "Electron packaging failed with exit code $LASTEXITCODE"
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
