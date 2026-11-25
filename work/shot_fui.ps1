# F(ui-assets) 截图：deploy/items × 750x1334 & 1200x900
# 用法：pwsh -File F:\sanguo\work\shot_fui.ps1 -Tag before
param([string]$Tag = 'after', [string]$Only = '')
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'F:\sanguo\work\.edgeprof_fui'
$base = 'http://127.0.0.1:5173/web'
$dir  = 'F:\sanguo\work\ui_orig'

$pages = @(
  @{ k = 'deploy'; u = "$base/deploy.html?city=%E5%8D%97%E7%9A%AE" },
  @{ k = 'items';  u = "$base/items.html" }
)

foreach ($p in $pages) {
  if ($Only -and $Only -ne $p.k) { continue }
  foreach ($s in @(@{ w = 750; h = 1334; sfx = '' }, @{ w = 1200; h = 900; sfx = '_wide' })) {
    $out = "$dir\$($p.k)_$Tag$($s.sfx).png"
    if (Test-Path $out) { Remove-Item $out -Force }
    $a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', "--user-data-dir=$prof",
      "--window-size=$($s.w),$($s.h)", '--virtual-time-budget=5000',
      '--force-device-scale-factor=1',
      "--screenshot=$out", $p.u)
    $pr = Start-Process -FilePath $edge -ArgumentList $a -Wait -PassThru -NoNewWindow
    $ok = Test-Path $out
    $sz = if ($ok) { (Get-Item $out).Length } else { 0 }
    "{0,-8} {1}x{2}  exit={3}  ok={4}  {5} bytes" -f $p.k, $s.w, $s.h, $pr.ExitCode, $ok, $sz
  }
}
