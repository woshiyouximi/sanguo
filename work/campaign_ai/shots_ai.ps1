# B2 驗收截圖 + DOM 檢查：AI 月報（R73/R74）、大地圖、事件日誌
# 用法：pwsh -File F:\sanguo\work\campaign_ai\shots_ai.ps1
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$prof = 'F:\sanguo\work\.edgeprof'
$base = 'http://127.0.0.1:5173/web'
$dir = 'F:\sanguo\work\campaign_ai'

$pages = @(
  # 1) 大地圖（3 個月 AI 行動後，頂欄有戰績/君主）
  @{ k = '01_map'; u = "$base/campaign.html?demo=1&adv=3&auto=1"; dom = $false },
  # 2) AI 月報 / 事件日誌：#marchdbg 疊層（?aidbg=1）+ 右側 logrows
  @{ k = '02_ai_report'; u = "$base/campaign.html?demo=1&adv=4&auto=1&aidbg=1"; dom = $true },
  # 3) 事件日誌只留 log（不開 aidbg），看中文戰報
  @{ k = '03_eventlog'; u = "$base/campaign.html?demo=1&adv=6&auto=1"; dom = $false }
)

foreach ($p in $pages) {
  $out = Join-Path $dir "$($p.k).png"
  $a = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', "--user-data-dir=$prof",
    '--window-size=750,1334', '--virtual-time-budget=9000',
    "--screenshot=$out", $p.u)
  $pr = Start-Process -FilePath $edge -ArgumentList $a -Wait -PassThru -NoNewWindow
  $ok = Test-Path $out
  $sz = if ($ok) { (Get-Item $out).Length } else { 0 }
  "{0,-14} exit={1} ok={2} {3} bytes" -f $p.k, $pr.ExitCode, $ok, $sz

  if ($p.dom) {
    $domOut = Join-Path $dir "$($p.k).dom.html"
    $a2 = @('--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      "--user-data-dir=$prof", '--virtual-time-budget=9000', '--dump-dom', $p.u)
    $pr2 = Start-Process -FilePath $edge -ArgumentList $a2 -Wait -PassThru -NoNewWindow `
      -RedirectStandardOutput $domOut -RedirectStandardError (Join-Path $dir "$($p.k).dom.err.txt")
    $len = if (Test-Path $domOut) { (Get-Item $domOut).Length } else { 0 }
    "  dump-dom exit={0} {1} bytes -> {2}" -f $pr2.ExitCode, $len, $domOut
  }
}
