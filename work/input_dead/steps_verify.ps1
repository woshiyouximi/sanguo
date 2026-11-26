<#
  三國群英傳2·豎版 — 「切後台回前台輸入鏈失效」真機驗收腳本（R228）
  ------------------------------------------------------------------
  用途：在真實設備上復現「界面還在但點不動」並驗證 R228 修復的 3 件事：
        ① 切後台 → 回前台 → 點「返回」仍然有效（派發鏈沒斷）
        ② EVENT_HIDE/EVENT_SHOW 復位日誌出現（闩鎖已清、緩存已清）
        ③ 順手採集 時鐘暫停 / T 歸零 / 抵達自動開戰 三條行為的截圖證據

  用法（必須 pwsh 7，UTF-8 無 BOM）：
    # 只讀模式：什麼都不點，只打印計劃（默認，安全）
    pwsh -File steps_verify.ps1

    # 真正跑（會 tap / am start，僅在製作人不玩的時候執行）
    pwsh -File steps_verify.ps1 -AllowTap

    # 完整驗收（含時鐘 16 秒 / 60 秒、抵達自動開戰）
    pwsh -File steps_verify.ps1 -AllowTap -ClockCheck -ArrivalCheck

    # 已經在遊戲地圖上，只驗切後台（不重新開局）
    pwsh -File steps_verify.ps1 -AllowTap -SkipNewGame

  參數：
    -Serial        設備序列號，默認 127.0.0.1:16384
    -AllowTap      必須顯式帶上，否則只讀退出
    -OutDir        截圖/日誌輸出目錄，默認 F:\sanguo\work\input_dead\verify
    -UseHome       切後台用 KEYCODE_HOME（注意：MuMu 上 HOME 會 remove task 殺進程！僅作對照）
    -SkipNewGame   不重新開局，直接在當前畫面做切後台驗證
    -ScenarioIndex 劇本卡下標（0 起；-1 = 沿用上次記憶的選擇，默認 -1）
    -ForceRow      君主行下標（0 起；-1 = 沿用上次記憶，默認 -1）
    -ClockCheck    採集時鐘暫停 / T 歸零證據（需要大地圖在走表）
    -ArrivalCheck  採集抵達自動開戰證據（需人工先出征 平原→樂陵）
#>
param(
  [string]$Serial = '127.0.0.1:16384',
  [switch]$AllowTap,
  [string]$OutDir = 'F:\sanguo\work\input_dead\verify',
  [switch]$UseHome,
  [switch]$SkipNewGame,
  [int]$ScenarioIndex = -1,
  [int]$ForceRow = -1,
  [switch]$ClockCheck,
  [switch]$ArrivalCheck,
  [int]$HideSeconds = 3,
  [int]$BootWaitSeconds = 10
)

# ============================ 只讀閘門（lead 要求保留這一行） ============================
if ($AllowTap -ne $true) { Write-Host '只读模式，不点'; exit 0 }
# ======================================================================================

$ErrorActionPreference = 'Stop'
$adb = 'F:\devtools\android\sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { Write-Host "[FAIL] 找不到 adb：$adb"; exit 1 }

# 1456x2560 屏幕 / 750x1334 設計區（FIT_HEIGHT，左右各留 ~8.4px）
$SCALE = 2560.0 / 1334.0
$MARGIN_X = (1456.0 - 750.0 * $SCALE) / 2.0

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$script:results = @()
$script:shotNo = 0

function Adb {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CmdArgs)
  $out = & $adb -s $Serial @CmdArgs 2>&1
  return ($out -join "`n")
}

function Assert-Item {
  param([string]$Name, [bool]$Pass, [string]$Detail = '')
  $state = if ($Pass) { 'PASS' } else { 'FAIL' }
  $script:results += [pscustomobject]@{ Item = $Name; State = $state; Detail = $Detail }
  $color = if ($Pass) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1} {2}" -f $state, $Name, $Detail) -ForegroundColor $color
}

function Shot {
  param([string]$Name)
  $script:shotNo += 1
  $remote = '/sdcard/r228.png'
  $local = Join-Path $OutDir $Name
  Adb shell screencap -p $remote | Out-Null
  & $adb -s $Serial pull $remote $local 2>&1 | Out-Null
  if (Test-Path $local) {
    $kb = [int]((Get-Item $local).Length / 1024)
    Write-Host ("      截圖 {0}（{1} KB）" -f $Name, $kb)
  } else {
    Write-Host ("      [WARN] 截圖失敗：{0}" -f $Name) -ForegroundColor Yellow
  }
}

function D2D {
  param([double]$x, [double]$y)
  [pscustomobject]@{ X = [int]($MARGIN_X + $x * $SCALE); Y = [int]($y * $SCALE) }
}

function TapDesign {
  param([double]$x, [double]$y, [string]$Note = '')
  $p = D2D $x $y
  Adb shell input tap $p.X $p.Y | Out-Null
  Write-Host ("      點設計({0},{1}) → 設備({2},{3}) {4}" -f $x, $y, $p.X, $p.Y, $Note)
}

function TapDevice {
  param([int]$x, [int]$y, [string]$Note = '')
  Adb shell input tap $x $y | Out-Null
  Write-Host ("      點設備({0},{1}) {2}" -f $x, $y, $Note)
}

function LogClear { Adb logcat -c | Out-Null }

function LogDump {
  param([string]$FileName)
  $text = Adb logcat -d
  $path = Join-Path $OutDir $FileName
  Set-Content -Path $path -Value $text -Encoding utf8
  return $text
}

function Count-Match {
  param([string]$Text, [string]$Pattern)
  return ([regex]::Matches($Text, $Pattern)).Count
}

Write-Host @"
==========================================================
  R228 輸入鏈韌性 真機驗收
  設備      : $Serial
  輸出目錄  : $OutDir
  切後台方式: $(if ($UseHome) { 'KEYCODE_HOME（MuMu 會殺進程，僅對照）' } else { 'am start com.android.settings/.Settings' })
  重新開局  : $(-not $SkipNewGame)
==========================================================
"@

# ---------------- 0. 前置檢查 ----------------
$state = (Adb get-state).Trim()
if ($state -ne 'device') { Write-Host "[FAIL] 設備離線：$state"; exit 1 }

$pkg = Adb shell dumpsys package com.sanguo.sango2
$verName = ([regex]::Match($pkg, 'versionName=([^\s]+)')).Groups[1].Value
$verCode = ([regex]::Match($pkg, 'versionCode=(\d+)')).Groups[1].Value
Write-Host "      已裝版本：versionName=$verName versionCode=$verCode"
Assert-Item '前置：package 已安裝' ($verName -ne '') "versionName=$verName versionCode=$verCode"

Adb shell am force-stop com.sanguo.sango2 | Out-Null
LogClear
Adb shell am start -W -n com.sanguo.sango2/com.cocos.game.AppActivity | Out-Null
Write-Host "      啟動 App，等 ${BootWaitSeconds}s 載入 Boot.scene…"
Start-Sleep -Seconds $BootWaitSeconds
$bootLog = LogDump '00_boot_logcat.txt'
Shot '00_boot.png'
Assert-Item '前置：Cocos 場景已載入' ($bootLog -match 'Success to load scene') ''

# ---------------- 1. 新局 → 大地圖（內政頁會自動開） ----------------
if (-not $SkipNewGame) {
  Write-Host '--- 1. 新局：開始新局 → 劇本 → 君主 → 開始新局 ---'
  TapDesign 375 976 '標題頁「開始新局」'
  Start-Sleep -Seconds 2
  Shot '01_scenario.png'
  if ($ScenarioIndex -ge 0) {
    $cardY = 215 + 160 * $ScenarioIndex
    TapDesign 375 $cardY "劇本卡 #$ScenarioIndex"
    Start-Sleep -Seconds 1
    Shot '01b_scenario_picked.png'
  }
  TapDesign 590 1216 '「選 君 主 →」'
  Start-Sleep -Seconds 2
  Shot '02_force.png'
  if ($ForceRow -ge 0) {
    $rowY = 193 + 112 * $ForceRow
    TapDesign 375 $rowY "君主行 #$ForceRow"
    Start-Sleep -Seconds 1
  }
  TapDesign 590 1216 '「開 始 新 局」'
  Start-Sleep -Seconds 6
  Shot '03_campaign.png'
  $campaignLog = LogDump '03_campaign_logcat.txt'
  $started = $campaignLog -match '\[R214\] campaign start'
  $m = [regex]::Match($campaignLog, '\[R214\] campaign start (\{.*?\})')
  Assert-Item '新局：已進入大地圖（[R214] campaign start）' $started ($(if ($m.Success) { $m.Groups[1].Value } else { '' }))
} else {
  Write-Host '--- 1. 跳過新局（-SkipNewGame）---'
  Shot '03_campaign.png'
}

# ---------------- 2. 切後台 → 回前台 ----------------
Write-Host '--- 2. 切後台 3 秒 → 回前台（驗 R228 EVENT_HIDE/EVENT_SHOW）---'
LogClear
if ($UseHome) {
  Adb shell input keyevent KEYCODE_HOME | Out-Null
} else {
  Adb shell am start -n com.android.settings/.Settings | Out-Null
}
Start-Sleep -Seconds $HideSeconds
Shot '04_background.png'
$pidAlive = (Adb shell pidof com.sanguo.sango2).Trim()
Assert-Item '切後台：進程未被回收' ($pidAlive -ne '') "pid=$pidAlive"

Adb shell am start -W -n com.sanguo.sango2/com.cocos.game.AppActivity | Out-Null
Write-Host '      回前台，等 4 秒讓 Cocos 完成 resume…'
Start-Sleep -Seconds 4
Shot '05_foreground.png'
$resumeLog = LogDump '05_resume_logcat.txt'
Assert-Item '回前台：出現 [R228] EVENT_HIDE' ($(Count-Match $resumeLog '\[R228\] EVENT_HIDE') -ge 1) ''
Assert-Item '回前台：出現 [R228] EVENT_SHOW' ($(Count-Match $resumeLog '\[R228\] EVENT_SHOW') -ge 1) ''

# ---------------- 3. 回前台後點「返回」：派發鏈不能斷 ----------------
Write-Host '--- 3. 回前台後點「返回」（內政頁左上，設備 116,105）→ 再點一次空白處 ---'
LogClear
TapDevice 116 105 '內政頁「← 返回」'
Start-Sleep -Seconds 2
Shot '06_after_back.png'
TapDevice 728 1280 '頁面中央再點一次（驗證派發鏈）'
Start-Sleep -Seconds 1
Shot '07_after_second_tap.png'
$tapLog = LogDump '07_tap_logcat.txt'
$typeErrors = Count-Match $tapLog 'TypeError|Uncaught|Cannot read propert'
$touchErrors = Count-Match $tapLog '\[R228\] touch error'
Assert-Item '回前台點擊：無未捕獲 TypeError' ($typeErrors -eq 0) "typeErrors=$typeErrors"
Assert-Item '回前台點擊：無 onTouch 異常（R228 隔離層未報錯）' ($touchErrors -eq 0) "touchErrors=$touchErrors"

# ---------------- 4. 時鐘暫停 / T 歸零（可選） ----------------
if ($ClockCheck) {
  Write-Host '--- 4a. 時鐘：關閉內政頁後回大地圖，等 16 秒（頁頭應到 4 月）---'
  LogClear
  Shot 'r_v3_clock_t0.png'
  Start-Sleep -Seconds 16
  Shot 'r_v3_clock_t16.png'
  Write-Host '--- 4b. 打開面板 8 秒，頁頭月份不應變 ---'
  Write-Host '      請用「勢力圖/名冊/物品/存檔」任一按鈕開面板；腳本會點圖中央備援…'
  TapDevice 728 1280 '（若面板已開則無害）'
  Start-Sleep -Seconds 1
  Shot 'r_v3_panel_open.png'
  Start-Sleep -Seconds 8
  Shot 'r_v3_panel_after8s.png'
  TapDevice 116 105 '關「返回」'
  Start-Sleep -Seconds 3
  Shot 'r_v3_panel_closed.png'
  Write-Host '--- 4c. 等 T 歸零（約 46 秒）→ 應自動開內政頁並停表 ---'
  Start-Sleep -Seconds 46
  Shot 'r_v4_yearend.png'
  TapDevice 116 105 '關內政頁「返回」'
  Start-Sleep -Seconds 3
  Shot 'r_v4_after_close.png'
  Start-Sleep -Seconds 6
  Shot 'r_v4_after_close_6s.png'
  LogDump 'r_v3v4_logcat.txt' | Out-Null
  Assert-Item '時鐘/T歸零：已採集截圖（需人工核對頁頭月份）' $true 'r_v3_*.png / r_v4_*.png'
} else {
  Write-Host '--- 4. 跳過時鐘採集（加 -ClockCheck 開啟）---'
}

# ---------------- 5. 抵達自動開戰（可選） ----------------
if ($ArrivalCheck) {
  Write-Host '--- 5. 抵達自動開戰：請手動「出征 平原 → 樂陵」 ---'
  Write-Host '      需要 劉備/平原 的存檔；兵團走到敵城下應自動進「出征編成」屏。'
  Read-Host '      完成出征後按 Enter 開始每 5 秒截圖' | Out-Null
  LogClear
  for ($i = 0; $i -le 7; $i++) {
    Shot ("r_v5_arrival_t{0}.png" -f $i)
    Start-Sleep -Seconds 5
  }
  $arrivalLog = LogDump 'r_v5_logcat.txt'
  $typeErrors5 = Count-Match $arrivalLog 'TypeError|Uncaught'
  Assert-Item '抵達自動開戰：無未捕獲 TypeError' ($typeErrors5 -eq 0) "typeErrors=$typeErrors5"
  $entered = Read-Host '      是否自動進入「出征編成」屏？(y/n)'
  Assert-Item '抵達自動開戰：自動進入出征編成' ($entered -eq 'y') '（人工判定）'
} else {
  Write-Host '--- 5. 跳過抵達採集（加 -ArrivalCheck 開啟）---'
}

# ---------------- 6. 匯總 ----------------
LogDump 'final_logcat.txt' | Out-Null
Write-Host ''
Write-Host '=========================================================='
Write-Host '  驗收結果'
Write-Host '=========================================================='
$script:results | Format-Table -AutoSize
$failed = @($script:results | Where-Object { $_.State -eq 'FAIL' }).Count
Write-Host ("  截圖/日誌目錄：{0}" -f $OutDir)
Write-Host ("  PASS = {0} / FAIL = {1}" -f (@($script:results).Count - $failed), $failed)
if ($failed -gt 0) {
  Write-Host '  注意：FAIL 項請把上方對應截圖 + logcat 一起回報。'
  exit 1
}
exit 0
