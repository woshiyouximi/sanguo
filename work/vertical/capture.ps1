$ErrorActionPreference = 'Stop'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$port = 9351
$userDataDir = 'F:\sanguo\work\.edgeprof_lead'
# Keep the viewport flags in variables before building the argument array.
# Bare --window-size=750,1334 in an array is parsed by msedge as a second target
# and fails with "Multiple targets are not supported in headless mode".
$windowSize = '--window-size=750,1334'
$virtualTime = '--virtual-time-budget=12000'
$edgeArgs = @(
  '--headless=new'
  '--disable-gpu'
  '--no-first-run'
  '--no-default-browser-check'
  '--hide-scrollbars'
  '--mute-audio'
  "--remote-debugging-port=$port"
  "--user-data-dir=$userDataDir"
  $windowSize
  $virtualTime
  'about:blank'
)
$proc = Start-Process -FilePath $edge -ArgumentList $edgeArgs -PassThru
try {
  $up = $false
  for ($i = 0; $i -lt 100; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/json/version" -TimeoutSec 2
      if ($r.StatusCode -eq 200) { $up = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $up) { throw "Edge CDP port $port did not come up" }
  Write-Output "CDP up on $port (pid $($proc.Id))"
  & node 'F:\sanguo\work\vertical\capture.mjs' $port
  if ($LASTEXITCODE -ne 0) { throw "capture.mjs exit $LASTEXITCODE" }
} finally {
  # Start-Process hands back the launcher pid, which may already be gone; the real
  # browser root is its child. Kill our own profile tree only, never other agents'.
  & cmd /c "taskkill /PID $($proc.Id) /T /F >nul 2>&1" | Out-Null
  Start-Sleep -Milliseconds 400
  $left = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like "*$userDataDir*" }
  foreach ($p in $left) {
    & cmd /c "taskkill /PID $($p.ProcessId) /T /F >nul 2>&1" | Out-Null
  }
  Start-Sleep -Milliseconds 300
  $still = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
    Where-Object { $_.CommandLine -like "*$userDataDir*" }).Count
  Write-Output "leftover edge procs on lead profile: $still"
}
