# Build Node.js Runtime for Windows x64
# 包含 SHA256 校验（自动从 SHASUMS256.txt 获取）

param(
    [string]$NodeVersion = "22.18.0",
    [string]$OutputDir = "$PSScriptRoot\..\node-runtime\win32-x64"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Building Node.js Runtime for Windows x64 ===" -ForegroundColor Cyan
Write-Host "Node.js Version: $NodeVersion" -ForegroundColor Yellow

$TempDir = "$env:TEMP\node-runtime-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    $BaseUrl = "https://nodejs.org/dist/v$NodeVersion"
    $FileName = "node-v$NodeVersion-win-x64.zip"
    $DownloadUrl = "$BaseUrl/$FileName"
    $ZipPath = "$TempDir\node.zip"
    $ShasumsUrl = "$BaseUrl/SHASUMS256.txt"

    # 1. 下载 SHASUMS256.txt 获取预期 hash
    Write-Host "[1/6] Fetching SHASUMS256.txt..." -ForegroundColor Green
    $ShasumsContent = Invoke-WebRequest -Uri $ShasumsUrl -UseBasicParsing | Select-Object -ExpandProperty Content
    $ExpectedHash = ($ShasumsContent -split "`n" | Where-Object { $_ -match $FileName } | ForEach-Object { ($_ -split '\s+')[0] }).ToLower()

    if (-not $ExpectedHash) {
        throw "Could not find hash for $FileName in SHASUMS256.txt"
    }
    Write-Host "Expected SHA256: $ExpectedHash" -ForegroundColor Gray

    # 2. 下载 Node.js
    Write-Host "[2/6] Downloading Node.js $NodeVersion..." -ForegroundColor Green
    Write-Host "URL: $DownloadUrl" -ForegroundColor Gray
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing

    # 3. 校验 SHA256
    Write-Host "[3/6] Verifying SHA256 checksum..." -ForegroundColor Green
    $ActualHash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()

    if ($ActualHash -ne $ExpectedHash) {
        throw "SHA256 mismatch! Expected: $ExpectedHash, Got: $ActualHash"
    }
    Write-Host "Checksum verified" -ForegroundColor Green

    # 4. 解压
    Write-Host "[4/6] Extracting..." -ForegroundColor Green
    Expand-Archive -Path $ZipPath -DestinationPath $TempDir -Force

    $NodeDir = "$TempDir\node-v$NodeVersion-win-x64"

    # 5. 复制到输出目录
    Write-Host "[5/6] Copying to output directory..." -ForegroundColor Green
    if (Test-Path $OutputDir) {
        Remove-Item $OutputDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    # 只复制必要文件
    Copy-Item "$NodeDir\node.exe" -Destination $OutputDir
    Copy-Item "$NodeDir\npm.cmd" -Destination $OutputDir
    Copy-Item "$NodeDir\npx.cmd" -Destination $OutputDir
    Copy-Item "$NodeDir\node_modules" -Destination $OutputDir -Recurse

    # 6. 清理不必要文件，减小体积
    Write-Host "[6/6] Cleaning up unnecessary files..." -ForegroundColor Green

    # 删除 npm 文档
    $DocsDir = "$OutputDir\node_modules\npm\docs"
    if (Test-Path $DocsDir) {
        Remove-Item $DocsDir -Recurse -Force
        Write-Host "  - Removed npm docs" -ForegroundColor Gray
    }

    # 删除 man pages
    $ManDir = "$OutputDir\node_modules\npm\man"
    if (Test-Path $ManDir) {
        Remove-Item $ManDir -Recurse -Force
        Write-Host "  - Removed man pages" -ForegroundColor Gray
    }

    # 删除 changelogs
    $ChangelogDir = "$OutputDir\node_modules\npm\changelogs"
    if (Test-Path $ChangelogDir) {
        Remove-Item $ChangelogDir -Recurse -Force
        Write-Host "  - Removed changelogs" -ForegroundColor Gray
    }

    # 验证
    $NodeExe = "$OutputDir\node.exe"
    $Version = & $NodeExe --version
    Write-Host "Node.js version: $Version" -ForegroundColor Green

    # 显示大小
    $Size = (Get-ChildItem $OutputDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "Total size: $([math]::Round($Size, 2)) MB" -ForegroundColor Yellow

    Write-Host "`n=== Node.js Runtime Build Complete ===" -ForegroundColor Green

} finally {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
