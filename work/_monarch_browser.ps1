# Screenshot entry for R4/R78/R65 acceptance shots.
# Launches headless Edge via Start-Process (required by the task brief), then lets
# _monarch_shots.mjs attach with MONARCH_ATTACH=1 to the same devtools port.
# Usage: powershell -NoProfile -File F:\sanguo\work\_monarch_browser.ps1
$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$port = 9335
$profile = 'F:\sanguo\work\_edge_monarch'
$args = @(
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  "--remote-debugging-port=$port", "--user-data-dir=$profile",
  '--window-size=750,1334', 'about:blank'
)
Start-Process -FilePath $edge -ArgumentList $args | Out-Null

# Start-Process is async: wait for the devtools port.
$ready = $false
for ($i = 0; $i -lt 80; $i++) {
  try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/json/version" -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}
  Start-Sleep -Milliseconds 250
}
if (-not $ready) { throw "edge devtools not ready on $port" }

$env:MONARCH_ATTACH = '1'
try {
  node F:\sanguo\work\_monarch_shots.mjs
} finally {
  # Only kill the msedge processes that use this profile.
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like "*$profile*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
