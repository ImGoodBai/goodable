# Build Python Runtime for Windows x64
# This script downloads Python 3.11 and creates a portable runtime

param(
    [string]$PythonVersion = "3.11.9",
    [string]$OutputDir = "$PSScriptRoot\..\python-runtime\win32-x64"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Building Python Runtime for Windows x64 ===" -ForegroundColor Cyan
Write-Host "Python Version: $PythonVersion" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow

# Create temp directory
$TempDir = "$env:TEMP\python-build-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
Write-Host "`n[1/6] Created temp directory: $TempDir" -ForegroundColor Green

try {
    # Download Python installer
    $InstallerUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-amd64.exe"
    $InstallerPath = "$TempDir\python-installer.exe"

    Write-Host "`n[2/6] Downloading Python $PythonVersion..." -ForegroundColor Green
    Write-Host "URL: $InstallerUrl" -ForegroundColor Gray

    Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerPath -UseBasicParsing
    Write-Host "Downloaded: $((Get-Item $InstallerPath).Length / 1MB) MB" -ForegroundColor Gray

    # Install Python to temp directory
    $InstallDir = "$TempDir\python"
    Write-Host "`n[3/6] Installing Python to temp directory..." -ForegroundColor Green

    $InstallArgs = @(
        "/quiet",
        "InstallAllUsers=0",
        "PrependPath=0",
        "Include_test=0",
        "Include_doc=0",
        "Include_tcltk=0",
        "Include_launcher=0",
        "InstallLauncherAllUsers=0",
        "TargetDir=$InstallDir"
    )

    Start-Process -FilePath $InstallerPath -ArgumentList $InstallArgs -Wait -NoNewWindow
    Write-Host "Installation complete" -ForegroundColor Gray

    # Verify installation
    if (-not (Test-Path "$InstallDir\python.exe")) {
        throw "Python installation failed: python.exe not found"
    }

    # Create output directory structure
    Write-Host "`n[4/6] Creating runtime directory structure..." -ForegroundColor Green
    $BinDir = "$OutputDir\bin"
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

    # Copy necessary files
    Write-Host "`n[5/6] Copying Python runtime files..." -ForegroundColor Green

    # Copy python.exe
    Copy-Item "$InstallDir\python.exe" -Destination "$BinDir\python.exe" -Force
    Write-Host "  - python.exe" -ForegroundColor Gray

    # Copy pythonw.exe (for GUI apps)
    Copy-Item "$InstallDir\pythonw.exe" -Destination "$BinDir\pythonw.exe" -Force
    Write-Host "  - pythonw.exe" -ForegroundColor Gray

    # Copy DLL
    Copy-Item "$InstallDir\python311.dll" -Destination "$BinDir\python311.dll" -Force
    Write-Host "  - python311.dll" -ForegroundColor Gray

    # Copy Lib directory (standard library)
    Copy-Item "$InstallDir\Lib" -Destination "$BinDir\Lib" -Recurse -Force
    Write-Host "  - Lib\ (standard library)" -ForegroundColor Gray

    # Copy DLLs directory (extension modules)
    Copy-Item "$InstallDir\DLLs" -Destination "$BinDir\DLLs" -Recurse -Force
    Write-Host "  - DLLs\ (extension modules)" -ForegroundColor Gray

    # Clean up unnecessary files
    Write-Host "`n[6/6] Cleaning up unnecessary files..." -ForegroundColor Green

    # Remove test files
    if (Test-Path "$BinDir\Lib\test") {
        Remove-Item "$BinDir\Lib\test" -Recurse -Force
        Write-Host "  - Removed test files" -ForegroundColor Gray
    }

    # Remove idlelib
    if (Test-Path "$BinDir\Lib\idlelib") {
        Remove-Item "$BinDir\Lib\idlelib" -Recurse -Force
        Write-Host "  - Removed idlelib" -ForegroundColor Gray
    }

    # Remove tkinter (GUI toolkit, not needed for web apps)
    if (Test-Path "$BinDir\Lib\tkinter") {
        Remove-Item "$BinDir\Lib\tkinter" -Recurse -Force
        Write-Host "  - Removed tkinter" -ForegroundColor Gray
    }

    # Remove __pycache__ directories
    Get-ChildItem -Path $BinDir -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
    Write-Host "  - Removed __pycache__ directories" -ForegroundColor Gray

    # Verify the build
    Write-Host "`n=== Verification ===" -ForegroundColor Cyan
    $PythonExe = "$BinDir\python.exe"

    $VersionOutput = & $PythonExe --version 2>&1
    Write-Host "Python Version: $VersionOutput" -ForegroundColor Green

    # Test venv creation
    Write-Host "`nTesting venv creation..." -ForegroundColor Yellow
    $TestVenvDir = "$TempDir\test-venv"
    & $PythonExe -m venv $TestVenvDir

    if (Test-Path "$TestVenvDir\Scripts\python.exe") {
        Write-Host "venv test: PASSED" -ForegroundColor Green
    } else {
        throw "venv test failed"
    }

    # Calculate size
    $TotalSize = (Get-ChildItem -Path $OutputDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "`nRuntime Size: $([math]::Round($TotalSize, 2)) MB" -ForegroundColor Yellow

    Write-Host "`n=== Build Complete ===" -ForegroundColor Green
    Write-Host "Python runtime created at: $OutputDir" -ForegroundColor Cyan
    Write-Host "You can now commit this to the repository or include in builds" -ForegroundColor Gray

} catch {
    Write-Host "`n=== Build Failed ===" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # Clean up temp directory
    Write-Host "`nCleaning up temp files..." -ForegroundColor Gray
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
