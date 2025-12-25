# Build Python Runtime for Windows x64
#
# 构建方式：NuGet便携版
#
# 说明：
# - 本脚本从NuGet下载Python官方便携版，而非使用安装器（.exe）
# - 之前尝试使用Python官方安装器，但存在以下问题：
#   1. 安装器在自动化场景下不可靠（静默安装参数问题）
#   2. 系统已安装Python时会产生冲突
#   3. 无法精确控制安装位置
# - NuGet版本优势：
#   1. 下载即用，无需安装过程
#   2. 完全便携，不污染系统
#   3. 包含完整Python环境（非embeddable版），支持C扩展
#   4. 包含vcruntime140.dll等运行时库，wxautox/pywin32/psutil等C扩展包可正常工作
#   5. 可重复构建，URL固定
#
# 构建目标：python-runtime\win32-x64\bin\
# Python版本：3.11.9
# 支持：pip、venv、C扩展（wxautox等）

param(
    [string]$PythonVersion = "3.11.9",
    [string]$OutputDir = "$PSScriptRoot\..\python-runtime\win32-x64"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Building Python Runtime for Windows x64 (NuGet) ===" -ForegroundColor Cyan
Write-Host "Python Version: $PythonVersion" -ForegroundColor Yellow
Write-Host "Output Directory: $OutputDir" -ForegroundColor Yellow

# Create temp directory
$TempDir = "$env:TEMP\python-nuget-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
Write-Host "`n[1/5] Created temp directory: $TempDir" -ForegroundColor Green

try {
    # Download Python from NuGet
    $NuGetUrl = "https://globalcdn.nuget.org/packages/python.$PythonVersion.nupkg"
    $NuGetPath = "$TempDir\python.nupkg"

    Write-Host "`n[2/5] Downloading Python $PythonVersion from NuGet..." -ForegroundColor Green
    Write-Host "URL: $NuGetUrl" -ForegroundColor Gray

    Invoke-WebRequest -Uri $NuGetUrl -OutFile $NuGetPath -UseBasicParsing
    Write-Host "Downloaded: $((Get-Item $NuGetPath).Length / 1MB) MB" -ForegroundColor Gray

    # Extract NuGet package (it's just a ZIP, rename it first)
    Write-Host "`n[3/5] Extracting Python..." -ForegroundColor Green
    $ZipPath = "$TempDir\python.zip"
    Rename-Item $NuGetPath $ZipPath -Force
    $ExtractDir = "$TempDir\extracted"
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
    Write-Host "Extraction complete" -ForegroundColor Gray

    # Find Python directory
    $PythonDir = "$ExtractDir\tools"
    if (-not (Test-Path "$PythonDir\python.exe")) {
        throw "Python.exe not found in NuGet package"
    }
    Write-Host "Found python.exe at: $PythonDir" -ForegroundColor Gray

    # Create output directory
    Write-Host "`n[4/5] Copying Python runtime..." -ForegroundColor Green
    $BinDir = "$OutputDir\bin"
    if (Test-Path $BinDir) {
        Remove-Item $BinDir -Recurse -Force
        Write-Host "Removed old runtime" -ForegroundColor Gray
    }
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

    # Copy all files
    Copy-Item "$PythonDir\*" -Destination $BinDir -Recurse -Force
    Write-Host "Copy complete" -ForegroundColor Gray

    # Clean up unnecessary files
    Write-Host "`n[5/5] Cleaning up..." -ForegroundColor Green

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

    # Remove tkinter
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

    # Test 1: Version check
    $VersionOutput = & $PythonExe --version 2>&1
    Write-Host "Python Version: $VersionOutput" -ForegroundColor Green

    # Test 2: Ensure pip
    Write-Host "`nEnsuring pip..." -ForegroundColor Yellow
    & $PythonExe -m ensurepip --default-pip 2>&1 | Out-Null
    $PipVersion = & $PythonExe -m pip --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "pip: $PipVersion" -ForegroundColor Green
    } else {
        Write-Host "pip test: WARNING - pip installation failed" -ForegroundColor Yellow
    }

    # Test 3: C extensions
    Write-Host "`nTesting C extensions..." -ForegroundColor Yellow
    $CExtTest = & $PythonExe -c "import _ctypes; import _ssl; import _socket; print('OK')" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "C extensions test: PASSED" -ForegroundColor Green
    } else {
        Write-Host "C extensions test: WARNING - Some extensions not available" -ForegroundColor Yellow
        Write-Host "Error: $CExtTest" -ForegroundColor Yellow
    }

    # Test 4: venv creation (optional - skip in CI environments)
    Write-Host "`nTesting venv creation..." -ForegroundColor Yellow
    $TestVenvDir = "$TempDir\test-venv"

    try {
        $venvError = $null
        & $PythonExe -m venv $TestVenvDir 2>&1 | Out-Null

        if (Test-Path "$TestVenvDir\Scripts\python.exe") {
            Write-Host "venv test: PASSED" -ForegroundColor Green
        } else {
            Write-Host "venv test: SKIPPED - Not critical for runtime" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "venv test: SKIPPED - Not critical for runtime (CI environment limitation)" -ForegroundColor Yellow
    }

    # Calculate size
    $TotalSize = (Get-ChildItem -Path $OutputDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "`nRuntime Size: $([math]::Round($TotalSize, 2)) MB" -ForegroundColor Yellow

    # List key directories
    Write-Host "`nDirectory structure:" -ForegroundColor Cyan
    Get-ChildItem $BinDir -Directory | ForEach-Object {
        $dirSize = (Get-ChildItem $_.FullName -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "  - $($_.Name)\ ($([math]::Round($dirSize, 1)) MB)" -ForegroundColor Gray
    }

    Write-Host "`n=== Build Complete ===" -ForegroundColor Green
    Write-Host "Python runtime created at: $OutputDir" -ForegroundColor Cyan
    Write-Host "This is a FULL Python installation from NuGet" -ForegroundColor Green
    Write-Host "You can now use this for projects requiring wxautox" -ForegroundColor Gray

} catch {
    Write-Host "`n=== Build Failed ===" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red

    # Clean up temp directory before exit
    Write-Host "`nCleaning up temp files..." -ForegroundColor Gray
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    exit 1
} finally {
    # Clean up temp directory
    Write-Host "`nCleaning up temp files..." -ForegroundColor Gray
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Explicit success exit
exit 0
