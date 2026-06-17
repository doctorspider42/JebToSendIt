# JebToSendIt — build portable EXE (Windows)
# Użycie:  .\build.ps1
# Wynik:   dist\JebToSendIt-<wersja>-portable.exe  (bez instalatora, jeden plik)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "==> JebToSendIt :: build portable EXE" -ForegroundColor Cyan

# --- Obejście znanego problemu electron-builder na Windows ---
# Paczka winCodeSign zawiera macOS-owe symlinki (.dylib). Bez trybu deweloperskiego
# / praw admina 7-zip nie potrafi ich utworzyć i build pada. Rozpakowujemy paczkę
# sami, pomijając katalog darwin (na Windows kompletnie zbędny).
function Initialize-WinCodeSign {
    $cache  = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
    $target = Join-Path $cache "winCodeSign-2.6.0"
    if ((Test-Path (Join-Path $target "windows-10"))) { return } # już gotowe

    $z = Join-Path $PSScriptRoot "node_modules\7zip-bin\win\x64\7za.exe"
    if (-not (Test-Path $z)) { return } # brak narzędzia — niech builder radzi sam

    New-Item -ItemType Directory -Force -Path $cache | Out-Null
    $archive = Join-Path $cache "winCodeSign-2.6.0.7z"
    if (-not (Test-Path $archive)) {
        Write-Host "==> Pobieram winCodeSign..." -ForegroundColor Yellow
        $url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
        Invoke-WebRequest -Uri $url -OutFile $archive
    }
    Write-Host "==> Rozpakowuję winCodeSign bez symlinków macOS (obejście braku trybu deweloperskiego)..." -ForegroundColor Yellow
    Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
    & $z x $archive "-o$target" -y -xr!darwin | Out-Null
}

if (-not (Test-Path "node_modules")) {
    Write-Host "==> Instaluję zależności (npm install)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install nie powiodło się" }
}

Write-Host "==> Generuję ikonę..." -ForegroundColor Yellow
node tools/gen-icon.js
if ($LASTEXITCODE -ne 0) { throw "generowanie ikony nie powiodło się" }

Initialize-WinCodeSign

Write-Host "==> Pakuję przez electron-builder (portable x64)..." -ForegroundColor Yellow
npx electron-builder --win portable --x64
if ($LASTEXITCODE -ne 0) { throw "electron-builder nie powiódł się" }

Write-Host ""
Write-Host "==> GOTOWE. Plik EXE:" -ForegroundColor Green
Get-ChildItem dist\*.exe | ForEach-Object { Write-Host ("    " + $_.FullName) -ForegroundColor Green }
