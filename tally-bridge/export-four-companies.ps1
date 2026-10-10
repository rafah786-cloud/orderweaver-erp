[CmdletBinding()]
param(
  [string]$From = "2020-04-01",
  [string]$To = "2026-10-08",
  [string]$Output = ".\tally-snapshots"
)

$ErrorActionPreference = "Stop"
$companies = @(
  "ABOOD TRADINGS",
  "ABRAZ SLEEPING SOLUTIONS",
  "ABZ - EST",
  "ESTIMATE"
)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js 20 or newer, then run this script again."
}
if (-not (Test-Path ".\package.json")) {
  throw "Run this script from the tally-bridge folder (the folder containing package.json)."
}
if (-not (Test-Path ".\node_modules")) {
  Write-Host "Installing the bridge's declared dependencies..." -ForegroundColor Cyan
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed; no Tally data was changed." }
}

Write-Host "Read-only Tally export. No ERP upload is performed." -ForegroundColor Cyan
Write-Host "Date range: $From through $To"
Write-Host "Companies: $($companies -join ', ')"
Write-Host "Output: $Output"

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Bridge build failed. No export started." }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw "Bridge tests failed. No export started." }

foreach ($company in $companies) {
  Write-Host ""
  Write-Host "===== Exporting $company =====" -ForegroundColor Yellow
  & npm.cmd start -- --from $From --to $To --chunk-months 1 --output $Output --company $company
  if ($LASTEXITCODE -ne 0) {
    throw "Export stopped at '$company'. Earlier exports are preserved; no ERP upload occurred."
  }
}

Write-Host ""
Write-Host "All four read-only snapshots finished. Review each manifest.json and checksums before any ERP staging." -ForegroundColor Green
