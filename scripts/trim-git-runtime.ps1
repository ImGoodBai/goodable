# Trim Git Runtime for Production - Optimized for Claude Code SDK
#
# ============================================================================
# IMPORTANT NOTES
# ============================================================================
#
# 1. SDK Dependency:
#    - Claude Agent SDK requires bash.exe via CLAUDE_CODE_GIT_BASH_PATH env var
#    - SDK will exit with code 1 if specified bash.exe path doesn't exist
#    - Never remove: bash.exe, sh.exe, msys-2.0.dll, git.exe, cygpath.exe
#
# 2. PATH Injection (see lib/services/cli/claude.ts lines 916-928):
#    Main project injects git-runtime paths to process.env.PATH:
#      - git-runtime/win32-x64/cmd        (git.exe)
#      - git-runtime/win32-x64/usr/bin    (unix tools)
#      - git-runtime/win32-x64/bin        (bash.exe)
#
# 3. Build Integration:
#    - Run AFTER build-git-runtime.ps1
#    - Call from build-windows.ps1 Step 4.6 or GitHub Actions
#    - Cache key should include this script's hash for invalidation
#
# 4. Testing:
#    - Run demo/claude-sdk-demo.ts after trimming
#    - Test with --file-ops for complete verification
#    - Example: npx tsx demo/claude-sdk-demo.ts --file-ops
#
# ============================================================================
# TEST RESULTS (2026-01-15)
# ============================================================================
#
# - Initial size: 393MB (PortableGit-2.47.1-64-bit)
# - Final size: ~143MB (63.6% reduction, ~250MB saved)
# - All SDK tests passed:
#   * Turn 1-2: Context memory (multi-turn conversation)
#   * Turn 3: File creation (Write tool)
#   * Turn 4: File modification (Edit tool)
#   * Turn 5: File reading (Read tool)
#
# ============================================================================
# USAGE
# ============================================================================
#
# Standalone:
#   .\scripts\trim-git-runtime.ps1
#
# With build:
#   .\scripts\build-git-runtime.ps1
#   .\scripts\trim-git-runtime.ps1
#
# GitHub Actions (add after build-git-runtime step):
#   - name: Trim Git Runtime
#     shell: pwsh
#     run: .\scripts\trim-git-runtime.ps1 -SkipBackup
#
# ============================================================================

param(
    [string]$GitRuntimeDir = "$PSScriptRoot\..\git-runtime\win32-x64",
    [string]$BackupDir = "$PSScriptRoot\..\git-runtime-backup",
    [switch]$SkipBackup,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

Write-Host "=== Trimming Git Runtime for Production ===" -ForegroundColor Cyan
Write-Host "Source: $GitRuntimeDir" -ForegroundColor Yellow
Write-Host "Backup: $BackupDir" -ForegroundColor Yellow

# Verify git-runtime exists
if (-not (Test-Path $GitRuntimeDir)) {
    Write-Host "ERROR: Git runtime not found at: $GitRuntimeDir" -ForegroundColor Red
    Write-Host "Please run build-git-runtime.ps1 first" -ForegroundColor Yellow
    exit 1
}

# Get initial size
$initialSize = (Get-ChildItem -Path $GitRuntimeDir -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "`nInitial size: $([math]::Round($initialSize, 2)) MB" -ForegroundColor Cyan

# Create backup if not skipped
if (-not $SkipBackup) {
    Write-Host "`nCreating backup..." -ForegroundColor Green
    if (Test-Path $BackupDir) {
        Remove-Item $BackupDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

# Files and directories to remove
# IMPORTANT: Do NOT remove usr\bin\cygpath.exe - required for SDK additionalDirectories
$toRemove = @(
    # === Round 1: Large non-essential packages (~126MB) ===
    # Vim editor suite
    "usr\bin\vim.exe",
    "usr\bin\vimdiff.exe",
    "usr\bin\vimtutor",
    "usr\bin\ex.exe",
    "usr\bin\rview.exe",
    "usr\bin\rvim.exe",
    "usr\bin\view.exe",
    "usr\bin\xxd.exe",
    "usr\share\vim",

    # Perl libraries
    "usr\share\perl5",

    # Documentation
    "mingw64\share\doc",
    "usr\share\misc",

    # Large Git tools
    "mingw64\libexec\git-core\scalar.exe",

    # Server tools (not needed for client)
    "mingw64\libexec\git-core\git-daemon.exe",
    "mingw64\libexec\git-core\git-http-backend.exe",
    "mingw64\libexec\git-core\git-http-fetch.exe",
    "mingw64\libexec\git-core\git-http-push.exe",
    "mingw64\libexec\git-core\git-imap-send.exe",

    # Text editors
    "usr\bin\mintty.exe",
    "usr\bin\nano.exe",
    "usr\bin\tig.exe",
    "usr\bin\less.exe",
    "usr\bin\lessecho.exe",
    "usr\bin\lesskey.exe",

    # Additional tools
    "usr\bin\pinentry.exe",
    "usr\bin\pinentry-w32.exe",
    "usr\bin\ssh-pageant.exe",
    "usr\bin\gpg-error.exe",

    # GUI support
    "mingw64\share\git-gui",
    "mingw64\share\gitk",
    "mingw64\libexec\git-core\git-gui",
    "mingw64\libexec\git-core\git-gui--askpass",
    "mingw64\libexec\git-core\git-citool",
    "mingw64\lib\tcl8.6",
    "mingw64\lib\tk8.6",

    # === Round 2: Additional tools (~39MB) ===
    # Git LFS
    "mingw64\bin\git-lfs.exe",
    "mingw64\bin\scalar.exe",

    # GPG suite (not needed for basic git operations)
    "usr\bin\gpg.exe",
    "usr\bin\gpgsm.exe",
    "usr\bin\gpgv.exe",
    "usr\bin\gpg-agent.exe",
    "usr\bin\gpgscm.exe",
    "usr\bin\gpg-card.exe",
    "usr\bin\gpg-wks-client.exe",
    "usr\bin\dirmngr.exe",

    # SSH extras (keep ssh.exe)
    "usr\bin\ssh-add.exe",
    "usr\bin\ssh-agent.exe",
    "usr\bin\ssh-keygen.exe",
    "usr\bin\ssh-keyscan.exe",
    "usr\bin\sftp.exe",
    "usr\bin\scp.exe",

    # Document converters
    "mingw64\bin\pdftotext.exe",
    "mingw64\bin\antiword.exe",
    "mingw64\bin\odt2txt.exe",

    # Diagnostic tools
    "usr\bin\rebase.exe",
    "usr\bin\strace.exe",
    "usr\bin\profiler.exe",

    # Redundant tools
    "usr\bin\gawk-5.0.0.exe",
    "usr\bin\locate.exe",
    "usr\bin\winpty.exe",
    "usr\bin\winpty-agent.exe",
    "usr\bin\winpty-debugserver.exe",

    # Compression tools
    "mingw64\bin\xz.exe",
    "mingw64\bin\xzcat.exe",
    "mingw64\bin\unxz.exe",
    "mingw64\bin\xzdec.exe",
    "mingw64\bin\lzmadec.exe",
    "mingw64\bin\bzip2.exe",
    "mingw64\bin\bunzip2.exe",
    "mingw64\bin\bzcat.exe",
    "mingw64\bin\bzip2recover.exe",
    "mingw64\bin\brotli.exe",

    # Tcl/Tk tools
    "mingw64\bin\tclsh.exe",
    "mingw64\bin\tclsh86.exe",
    "mingw64\bin\wish.exe",
    "mingw64\bin\wish86.exe",

    # Misc tools
    "mingw64\bin\WhoUses.exe",
    "mingw64\bin\blocked-file-util.exe",
    "mingw64\bin\edit_test_dll.exe",
    "mingw64\bin\create-shortcut.exe",
    "mingw64\bin\adig.exe",
    "mingw64\bin\ahost.exe",
    "mingw64\bin\xmlwf.exe",
    "mingw64\bin\sexp-conv.exe",
    "mingw64\bin\pkcs1-conv.exe",
    "mingw64\bin\psl.exe",
    "usr\bin\trust.exe",
    "mingw64\bin\trust.exe",
    "usr\bin\p11-kit.exe",
    "mingw64\bin\p11-kit.exe",
    "usr\bin\rnano.exe",
    "usr\bin\cygwin-console-helper.exe",

    # === Round 3: Library directories (~27MB) ===
    "usr\lib\perl5",
    "usr\lib\gnupg",
    "usr\lib\ssh",
    "usr\lib\pkcs11",
    "usr\lib\sasl2",

    # Share directories
    "usr\share\awk",
    "usr\share\git",
    "usr\share\gnupg",
    "usr\share\licenses",
    "usr\share\pki",
    "usr\share\tabset",
    "usr\share\terminfo",
    "mingw64\share\git",
    "mingw64\share\licenses",

    # DLLs (safe to remove)
    "usr\bin\msys-gcrypt-20.dll",
    "usr\bin\msys-gnutls-30.dll",

    # === Round 4: Rarely used git commands (~8MB) ===
    # FTP protocol support
    "mingw64\libexec\git-core\git-remote-ftp.exe",
    "mingw64\libexec\git-core\git-remote-ftps.exe",

    # i18n tool
    "mingw64\libexec\git-core\git-sh-i18n--envsubst.exe",

    # Legacy VCS import tools
    "mingw64\libexec\git-core\git-archimport.exe",
    "mingw64\libexec\git-core\git-cvsexportcommit.exe",
    "mingw64\libexec\git-core\git-cvsimport.exe",
    "mingw64\libexec\git-core\git-cvsserver.exe",

    # Other rarely used
    "mingw64\libexec\git-core\git-fast-import.exe",
    "mingw64\libexec\git-core\git-credential-store.exe",
    "mingw64\libexec\git-core\git-instaweb.exe",
    "mingw64\libexec\git-core\git-p4.exe",
    "mingw64\libexec\git-core\git-svn.exe",
    "mingw64\libexec\git-core\git-send-email.exe",
    "mingw64\libexec\git-core\git-quiltimport.exe",
    "mingw64\libexec\git-core\git-request-pull.exe",

    # Additional usr/bin tools
    "usr\bin\mount.exe",
    "usr\bin\umount.exe",
    "usr\bin\passwd.exe",
    "usr\bin\ldd.exe",
    "usr\bin\ldh.exe",
    "usr\bin\getconf.exe",
    "usr\bin\getfacl.exe",
    "usr\bin\setfacl.exe",
    # NOTE: cygpath.exe is intentionally kept - see CRITICAL comment above
    "usr\bin\tzset.exe",
    "usr\bin\pldd.exe",

    # === Round 5: GUI components (~46MB) ===
    # Skia graphics library
    "mingw64\bin\libSkiaSharp.dll",
    "mingw64\libexec\git-core\libSkiaSharp.dll",

    # OpenGL ES graphics
    "mingw64\bin\av_libglesv2.dll",
    "mingw64\libexec\git-core\av_libglesv2.dll",

    # Avalonia UI framework
    "mingw64\bin\Avalonia.Base.dll",
    "mingw64\libexec\git-core\Avalonia.Base.dll",
    "mingw64\bin\Avalonia.Controls.dll",
    "mingw64\libexec\git-core\Avalonia.Controls.dll",
    "mingw64\bin\Avalonia.Dialogs.dll",
    "mingw64\libexec\git-core\Avalonia.Dialogs.dll",
    "mingw64\bin\Avalonia.Markup.Xaml.dll",
    "mingw64\libexec\git-core\Avalonia.Markup.Xaml.dll",
    "mingw64\bin\Avalonia.Win32.dll",
    "mingw64\libexec\git-core\Avalonia.Win32.dll",

    # HarfBuzz text shaping
    "mingw64\bin\libHarfBuzzSharp.dll",
    "mingw64\libexec\git-core\libHarfBuzzSharp.dll",

    # Microsoft Identity GUI
    "mingw64\bin\Microsoft.Identity.Client.dll",
    "mingw64\libexec\git-core\Microsoft.Identity.Client.dll",

    # MSAL runtime
    "mingw64\bin\msalruntime_x86.dll",
    "mingw64\libexec\git-core\msalruntime_x86.dll",

    # Tcl/Tk GUI libs
    "mingw64\bin\tcl86.dll",
    "mingw64\libexec\git-core\tcl86.dll",
    "mingw64\bin\tk86.dll",
    "mingw64\libexec\git-core\tk86.dll",

    # Git Credential Manager GUI
    "mingw64\bin\git-credential-manager.exe",
    "mingw64\bin\git-credential-manager-ui.exe",
    "mingw64\bin\git-credential-helper-selector.exe",
    "mingw64\libexec\git-core\git-credential-manager.exe",
    "mingw64\libexec\git-core\git-credential-manager-ui.exe",
    "mingw64\libexec\git-core\git-credential-helper-selector.exe"
)

# Move files to backup
$movedCount = 0
$movedSize = 0

Write-Host "`nRemoving unnecessary files..." -ForegroundColor Green

foreach ($item in $toRemove) {
    $srcPath = Join-Path $GitRuntimeDir $item

    if (Test-Path $srcPath) {
        # Get size
        if (Test-Path $srcPath -PathType Container) {
            $size = (Get-ChildItem -Path $srcPath -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
        } else {
            $size = (Get-Item $srcPath).Length / 1MB
        }

        # Move to backup or delete
        if (-not $SkipBackup) {
            $dstPath = Join-Path $BackupDir $item
            $dstParent = Split-Path $dstPath -Parent
            if (-not (Test-Path $dstParent)) {
                New-Item -ItemType Directory -Path $dstParent -Force | Out-Null
            }
            Move-Item -Path $srcPath -Destination $dstPath -Force
        } else {
            Remove-Item -Path $srcPath -Recurse -Force
        }

        $movedCount++
        $movedSize += $size

        if ($Verbose) {
            Write-Host "  - Removed: $item ($([math]::Round($size, 2)) MB)" -ForegroundColor Gray
        }
    }
}

Write-Host "Removed $movedCount items, saved $([math]::Round($movedSize, 2)) MB" -ForegroundColor Cyan

# Verify critical files still exist
Write-Host "`n=== Verification ===" -ForegroundColor Cyan

$criticalFiles = @{
    "bash.exe" = "usr\bin\bash.exe"
    "git.exe" = "cmd\git.exe"
    "cygpath.exe" = "usr\bin\cygpath.exe"  # CRITICAL for SDK additionalDirectories
    "sh.exe" = "usr\bin\sh.exe"
}

$allGood = $true
foreach ($name in $criticalFiles.Keys) {
    $path = Join-Path $GitRuntimeDir $criticalFiles[$name]
    if (Test-Path $path) {
        Write-Host "✓ $name exists" -ForegroundColor Green
    } else {
        Write-Host "✗ $name MISSING" -ForegroundColor Red
        $allGood = $false
    }
}

if (-not $allGood) {
    Write-Host "`nERROR: Critical files missing after trim!" -ForegroundColor Red
    exit 1
}

# Calculate final size
$finalSize = (Get-ChildItem -Path $GitRuntimeDir -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
$savedSize = $initialSize - $finalSize
$savedPercent = ($savedSize / $initialSize) * 100

Write-Host "`n=== Trim Complete ===" -ForegroundColor Green
Write-Host "Initial size: $([math]::Round($initialSize, 2)) MB" -ForegroundColor White
Write-Host "Final size: $([math]::Round($finalSize, 2)) MB" -ForegroundColor White
Write-Host "Saved: $([math]::Round($savedSize, 2)) MB ($([math]::Round($savedPercent, 1))%)" -ForegroundColor Cyan

if ($finalSize -lt 150) {
    Write-Host "`n🎉 Excellent! Runtime size is optimized for production" -ForegroundColor Green
} elseif ($finalSize -lt 200) {
    Write-Host "`n✓ Good! Runtime size is acceptable" -ForegroundColor Yellow
} else {
    Write-Host "`n⚠️ Warning: Runtime size is larger than expected" -ForegroundColor Yellow
}

exit 0
