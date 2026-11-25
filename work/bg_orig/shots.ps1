# A2 battlefield background screenshots.
# usage: powershell -NoProfile -ExecutionPolicy Bypass -File shots.ps1 [-Modes] [-Bench] [-Terrains 00,04]
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less files as ANSI and
#       mojibake inside comments can break the parser.
param([switch]$Modes, [switch]$Bench, [string[]]$Terrains)

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'F:\sanguo\work\.edgeprof2'
$base = 'http://127.0.0.1:5173/web/index.html'
$raw = 'F:\sanguo\work\bg_orig\raw'
New-Item -ItemType Directory -Force -Path $raw | Out-Null

# Old headless (--headless) does not clamp the window height. With a 782x1500 viewport
# availW=750 and availH>1334, so main.js fit=1 -> canvas is exactly 750x1334 CSS px at
# dpr=1. The canvas therefore lands at (16,133)-(766,1467) in the page screenshot and
# crop_all.py cuts it out 1:1.
$win = '782,1500'

function Shot($url, $out) {
  if (Test-Path $out) { Remove-Item $out -Force }
  $a = @('--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--force-device-scale-factor=1',
    "--user-data-dir=$prof", "--window-size=$win", '--virtual-time-budget=6000',
    "--screenshot=$out", $url)
  $pr = Start-Process -FilePath $edge -ArgumentList $a -PassThru -NoNewWindow
  if (-not ($pr.WaitForExit(90000))) {
    try { Stop-Process -Id $pr.Id -Force -ErrorAction Stop } catch { }
    Start-Sleep -Milliseconds 800
    $pr = Start-Process -FilePath $edge -ArgumentList $a -PassThru -NoNewWindow
    if (-not ($pr.WaitForExit(90000))) {
      try { Stop-Process -Id $pr.Id -Force -ErrorAction Stop } catch { }
      return 99
    }
  }
  return 0
}

function Report($tag, $out) {
  $sz = 'MISSING'
  if (Test-Path $out) { $sz = (Get-Item $out).Length }
  "$tag bytes=$sz"
}

if ($Terrains) { $list = (($Terrains -join ',') -split ',') | ForEach-Object { $_.Trim() } } else {
  $list = @('00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11')
}

if (-not $Modes -and -not $Bench) {
  foreach ($t in $list) {
    $out = Join-Path $raw "raw_$t.png"
    $ec = Shot "$base`?sim=120&freeze=1&terrain=$t" $out
    Report "terrain $t exit=$ec" $out
  }
}

if ($Modes) {
  foreach ($t in @('00', '04')) {
    foreach ($m in @('a', 'b', 'b2', 'c')) {
      $out = Join-Path $raw "mode_${t}_$m.png"
      $ec = Shot "$base`?sim=120&freeze=1&terrain=$t&bgmode=$m" $out
      Report "mode $t/$m exit=$ec" $out
    }
  }
}

if ($Bench) {
  $out = Join-Path $raw 'bench_dom.html'
  $a = @('--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--force-device-scale-factor=1', "--user-data-dir=$prof", "--window-size=$win",
    '--virtual-time-budget=8000', '--dump-dom',
    "$base`?sim=120&freeze=1&terrain=00&bgbench=1")
  Start-Process -FilePath $edge -ArgumentList $a -Wait -NoNewWindow -RedirectStandardOutput $out | Out-Null
  "bench dom -> $out"
}
