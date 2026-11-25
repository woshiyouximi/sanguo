# 验收截图：8 张一次拍完（750x1334 竖屏 4 张 + 1200x900 横屏 4 张）
# 用法：pwsh -File F:\sanguo\work\shots.ps1
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'F:\sanguo\work\.edgeprof'
$base = 'http://127.0.0.1:5173/web'

$pages = @(
  @{ k = 'campaign'; u = "$base/campaign.html?sel=%E5%8D%97%E7%9A%AE" },
  @{ k = 'deploy';   u = "$base/deploy.html?city=%E6%98%93%E4%BA%AC" },
  @{ k = 'items';    u = "$base/items.html" },
  @{ k = 'battle';   u = "$base/index.html?sim=120&freeze=1" }
)

foreach ($p in $pages) {
  foreach ($s in @(@{ w = 750; h = 1334; sfx = '' }, @{ w = 1200; h = 900; sfx = '_wide' })) {
    $out = "F:\sanguo\work\bg_$($p.k)$($s.sfx).png"
    $a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', "--user-data-dir=$prof",
      "--window-size=$($s.w),$($s.h)", '--virtual-time-budget=4000',
      "--screenshot=$out", $p.u)
    $pr = Start-Process -FilePath $edge -ArgumentList $a -Wait -PassThru -NoNewWindow
    $ok = Test-Path $out
    $sz = if ($ok) { (Get-Item $out).Length } else { 0 }
    "{0,-14} {1}x{2}  exit={3}  ok={4}  {5} bytes" -f $p.k, $s.w, $s.h, $pr.ExitCode, $ok, $sz
  }
}
