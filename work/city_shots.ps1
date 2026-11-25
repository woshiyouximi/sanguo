# 内政页验收截图（750x1334 竖屏）：改前/改后 + 6 张殿内背景 + 4 个抽屉
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File F:\sanguo\work\city_shots.ps1
# 注意：本脚本用独立 profile（.edgeprof_city），不碰别人的存档；代縣 = %E4%BB%A3%E7%B8%A3
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'F:\sanguo\work\.edgeprof_city'
$base = 'http://127.0.0.1:5173/web'
$q = 'city=%E4%BB%A3%E7%B8%A3&force=1&fresh=1'

$pages = @(
  @{ k = 'F:\sanguo\work\city_shots\after_city.png';       u = "$base/city.html?$q" },
  @{ k = 'F:\sanguo\work\city_shots\after_recruit.png';    u = "$base/city.html?$q&lv=30&sheet=recruit" },
  @{ k = 'F:\sanguo\work\city_shots\after_auto.png';       u = "$base/city.html?$q&sheet=auto" },
  @{ k = 'F:\sanguo\work\city_shots\after_intel.png';      u = "$base/city.html?$q&sheet=intel" },
  @{ k = 'F:\sanguo\work\city_shots\after_locked.png';     u = "$base/city.html?$q&do=%E9%96%8B%E7%99%BC" },
  @{ k = 'F:\sanguo\work\city_bg\hall_1.png';              u = "$base/city.html?$q&hall=1" },
  @{ k = 'F:\sanguo\work\city_bg\hall_2.png';              u = "$base/city.html?$q&hall=2" },
  @{ k = 'F:\sanguo\work\city_bg\hall_3.png';              u = "$base/city.html?$q&hall=3" },
  @{ k = 'F:\sanguo\work\city_bg\hall_4.png';              u = "$base/city.html?$q&hall=4" },
  @{ k = 'F:\sanguo\work\city_bg\hall_5.png';              u = "$base/city.html?$q&hall=5" },
  @{ k = 'F:\sanguo\work\city_bg\hall_6.png';              u = "$base/city.html?$q&hall=6" }
)

foreach ($p in $pages) {
  Remove-Item $p.k -ErrorAction SilentlyContinue
  $a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', "--user-data-dir=$prof",
    '--window-size=750,1334', '--virtual-time-budget=5000',
    "--screenshot=$($p.k)", $p.u)
  $pr = Start-Process -FilePath $edge -ArgumentList $a -Wait -PassThru -NoNewWindow
  $ok = Test-Path $p.k
  $sz = if ($ok) { (Get-Item $p.k).Length } else { 0 }
  "{0,-46} exit={1}  ok={2}  {3} bytes" -f (Split-Path $p.k -Leaf), $pr.ExitCode, $ok, $sz
}
