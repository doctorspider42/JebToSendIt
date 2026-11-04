# JebToSendIt — portable Windows build. Requires Node.js 26.
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
npm run build:win
if ($LASTEXITCODE -ne 0) { throw "Windows build failed" }
Get-ChildItem dist\*.exe
