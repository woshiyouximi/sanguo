# 截图：work\gen_sprites\demo.html（1940x1160，Edge headless）
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'F:\sanguo\work\.edgeprof'
$out  = 'F:\sanguo\work\gen_sprites\demo_shot.png'
$url  = 'http://127.0.0.1:8099/work/gen_sprites/demo.html?t=178'
if (Test-Path $out) { Remove-Item $out -Force }
$ea = @(
  '--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',
  "--user-data-dir=$prof",'--window-size=1940,1260','--virtual-time-budget=6000',
  "--screenshot=$out",$url
)
$p = Start-Process -FilePath $edge -ArgumentList $ea -Wait -PassThru -NoNewWindow
"screenshot exit=$($p.ExitCode)"
if (Test-Path $out) { $f = Get-Item $out; "wrote $($f.FullName) $($f.Length) bytes" } else { "NO OUTPUT" }

