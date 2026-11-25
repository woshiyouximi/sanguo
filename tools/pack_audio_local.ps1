# pack_audio_local.ps1 —— 把 BGM / SFX 压进 res bundle，出「包内音频」的微信小游戏包。
#
# 背景（见 project\204_本地音频分包.md）：
#   - 微信小游戏总配额 30 MB（30*1024*1024，与 build_wechat.ps1 的 MB 口径一致），
#     CDN 方案要联网、首播有延迟；
#   - BGM 10 档 13.38 MB 实测是**混合码率**：04/05/06 是 128 kbps stereo（6.82 MB），
#     其余 03/10/11/12/13/14/17 是 64 kbps mono（7.21 MB）；SFX 99 档 96 kbps mono（2.69 MB）。
#     原计划「BGM 统一 80k」实测会把 7 档 64k mono **转成更大**（980,950 → 1,226,755 B，125%），
#     全 80k 后 BGM 反而 12.66 MB，整包 32.4 MB 超限；
#   - 所以 BGM 按源声道数分档转码：stereo 源（128k）→ 56 kbps，mono 源（64k）→ 48 kbps，
#     都保持原声道数、都不把文件转大。实测 BGM 合计约 8.39 MB；
#     若统一 56k，整包 30,011,595 B（28.62 MiB），平台若按 1 MB = 1,000,000 B 计数就超 11.6 KB；
#     分档后整包约 29.11 MB，两种口径都在 30 MB 以内（十进制余约 0.89 MB / MiB 口径余约 2.25 MB）。
#     注意：MP3 码率只认 32/40/48/56/64… 这些整档，写 54k 会被 lame 就近吞回 56k（文件大小不变）。
#
# 做法：
#   1) 从 dist\audio-cdn\audio（原始 128k/96k）转码 / 复制到
#      game\cocos\assets\bundles\<Bundle>\audio\{bgm,sfx}\ —— 与 AudioHost 的
#      audioPath() 约定（audio/bgm/04、audio/sfx/hit01）完全一致，不新建 bundle；
#   2) 重新生成 game\cocos\assets\bundles\<Bundle>\audio-manifest.json
#      （沿用 build_wechat.ps1 -Audio cdn 的结构：version/bundle/source/count/bytes/files；
#       额外记一份 encode 参数，供幂等判断；路径是**包内相对路径**，如 audio/bgm/04.mp3）；
#   3) 幂等：清单里记录的字节数 + sha256(12) 与磁盘一致就跳过，打印「跳过 N 档」；
#      清单缺失 / 参数变了 / 文件被改过 → 只重做变化的那几档。
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File tools\pack_audio_local.ps1
#   powershell -ExecutionPolicy Bypass -File tools\pack_audio_local.ps1 -BgmKbps 80 -Force
#
# 注意：源目录 dist\audio-cdn\audio 是原始 128k/96k 的**母本**，本脚本只读不写；
#       转码只覆盖 game\cocos\assets\bundles\res\audio 下的 mp3（.meta 里的 uuid 不变）。
[CmdletBinding()]
param(
  [string]$RepoRoot = '',
  [string]$Ffmpeg = 'C:\Users\liutian\AppData\Local\oopz\ffmpeg.exe',
  [string]$Source = '',
  [string]$Project = '',
  [string]$Bundle = 'res',
  [int]$BgmKbps = 56,
  [int]$BgmMonoKbps = 48,
  # R199：20MB 总包限制下，BGM/SFX 都要再压。$BgmMono 强制单声道（用 $BgmMonoKbps 这一档），
  # $SfxKbps > 0 时 SFX 也转码（0 = 原样复制）。
  [switch]$BgmMono,
  [int]$SfxKbps = 0,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$script:Failures = 0

function Info([string]$Message) { Write-Host "  · $Message" -ForegroundColor Gray }
function Step([string]$Message) { Write-Host "`n== $Message" -ForegroundColor Cyan }
function Bad([string]$Message) {
  Write-Host "  ✗ $Message" -ForegroundColor Red
  $script:Failures += 1
}

function Format-Size([double]$Bytes) {
  if ($Bytes -ge 1MB) { return ('{0:N2} MB' -f ($Bytes / 1MB)) }
  return ('{0:N0} KB' -f ($Bytes / 1KB))
}

function Get-Sha256Hex([string]$Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try { $hash = $sha.ComputeHash($stream) } finally { $stream.Dispose() }
    return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-AudioChannels([string]$Path) {
  # 用 ffmpeg -i 只读探测声道数：音轨行形如 "Audio: mp3, 44100 Hz, mono, fltp, 64 kb/s"
  # （本机没有 ffprobe；ffmpeg 的无输出探测会 exit 1 且信息走 stderr，
  #   交给 cmd 做 2>&1 才不会触发 PowerShell 的 NativeCommandError）
  $probe = (cmd /c "`"$Ffmpeg`" -hide_banner -i `"$Path`" 2>&1" | Out-String)
  $m = [regex]::Match($probe, ',\s*(mono|stereo)\s*,')
  if ($m.Success) { if ($m.Groups[1].Value -eq 'mono') { return 1 } else { return 2 } }
  $mc = [regex]::Match($probe, ',\s*(\d+)\s+channels?\s*,')
  if ($mc.Success) { return [int]$mc.Groups[1].Value }
  return 0
}

function ConvertTo-JsonString([string]$Text) {
  # 与 build_wechat.ps1 的 ConvertTo-JsonString 同款：只转义 \ 和 "
  return '"' + $Text.Replace('\', '\\').Replace('"', '\"') + '"'
}

# ---------------------------------------------------------------------------
# 0) 路径与前置检查
# ---------------------------------------------------------------------------
if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
if (-not $Source) { $Source = Join-Path $RepoRoot 'dist\audio-cdn\audio' }
if (-not $Project) { $Project = Join-Path $RepoRoot 'game\cocos' }

$bundleRoot = Join-Path (Join-Path $Project 'assets\bundles') $Bundle
$audioRoot = Join-Path $bundleRoot 'audio'
$manifestPath = Join-Path $bundleRoot 'audio-manifest.json'
$srcBgm = Join-Path $Source 'bgm'
$srcSfx = Join-Path $Source 'sfx'
$dstBgm = Join-Path $audioRoot 'bgm'
$dstSfx = Join-Path $audioRoot 'sfx'

Write-Host ("三国群英传 2 · 本地音频打包（BGM stereo {0}k / mono {1}k / SFX 原样）" -f $BgmKbps, $BgmMonoKbps) -ForegroundColor Magenta
Write-Host ("  ffmpeg : {0}" -f $Ffmpeg)
Write-Host ("  源     : {0}" -f $Source)
Write-Host ("  目标   : {0}" -f $audioRoot)

if (-not (Test-Path -LiteralPath $Ffmpeg)) {
  Bad "找不到 ffmpeg：$Ffmpeg"
  exit 1
}
foreach ($d in @($srcBgm, $srcSfx)) {
  if (-not (Test-Path -LiteralPath $d)) {
    Bad "源音频目录不存在：$d（先跑 tools\export_audio.py 导出原始音频）"
    exit 1
  }
}
New-Item -ItemType Directory -Force -Path $dstBgm | Out-Null
New-Item -ItemType Directory -Force -Path $dstSfx | Out-Null

$srcBgmFiles = @(Get-ChildItem -LiteralPath $srcBgm -File -Filter '*.mp3' | Sort-Object Name)
$srcSfxFiles = @(Get-ChildItem -LiteralPath $srcSfx -File -Filter '*.mp3' | Sort-Object Name)
if ($srcBgmFiles.Count -eq 0) { Bad "源 BGM 目录没有 mp3：$srcBgm"; exit 1 }
if ($srcSfxFiles.Count -eq 0) { Bad "源 SFX 目录没有 mp3：$srcSfx"; exit 1 }

# ---------------------------------------------------------------------------
# 1) 读旧清单（幂等依据：bytes + sha256(12) + 编码参数）
# ---------------------------------------------------------------------------
$oldFiles = @{}
$oldBgmEncode = ''
if (Test-Path -LiteralPath $manifestPath) {
  try {
    $text = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
    $old = $text | ConvertFrom-Json
    if ($old -and $old.files) {
      foreach ($p in $old.files.PSObject.Properties) { $oldFiles[$p.Name] = $p.Value }
    }
    if ($old -and $old.encode -and $old.encode.bgm) { $oldBgmEncode = [string]$old.encode.bgm }
  } catch {
    Bad ("旧清单读不了（{0}），本次全部重做" -f $_.Exception.Message)
    $oldFiles = @{}
  }
}
$bgmBitrate = '' + $BgmKbps + 'k'
$bgmMonoBitrate = '' + $BgmMonoKbps + 'k'
$bgmEncode = 'libmp3lame -b:a ' + $bgmBitrate + ' (mono ' + $bgmMonoBitrate + ')' + $(if ($BgmMono) { ' [all-mono]' } else { '' }) + $(if ($SfxKbps -gt 0) { (' sfx ' + $SfxKbps + 'k mono') } else { ' sfx-copy' })
$encodeChanged = ($oldBgmEncode -ne $bgmEncode) -and ($oldBgmEncode -ne '')
if ($encodeChanged) { Info ("BGM 编码参数变了：'{0}' → '{1}'，全部 BGM 重转" -f $oldBgmEncode, $bgmEncode) }

# ---------------------------------------------------------------------------
# 2) BGM：ffmpeg 转码（stereo 56k / mono 48k；先写临时文件再改名，不留半截文件）
# ---------------------------------------------------------------------------
Step ("BGM 转码（{0} 档 → {1}）" -f $srcBgmFiles.Count, $bgmEncode)
$bgmSkipped = 0
$bgmDone = 0
$bgmBefore = 0
$bgmAfter = 0
foreach ($f in $srcBgmFiles) {
  $dst = Join-Path $dstBgm $f.Name
  $key = 'audio/bgm/' + [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  $bgmBefore += $f.Length

  # 幂等：清单记录的 bytes/sha 与磁盘一致即跳过（省掉 10 次 ffmpeg 调用）
  $old = $oldFiles[$key]
  $skip = $false
  if (-not $Force -and -not $encodeChanged -and (Test-Path -LiteralPath $dst) -and $old) {
    $item = Get-Item -LiteralPath $dst
    if ([long]$old.bytes -eq $item.Length -and [string]$old.sha256 -eq (Get-Sha256Hex $dst).Substring(0, 12)) { $skip = $true }
  }
  if ($skip) {
    $bgmSkipped += 1
    $bgmAfter += (Get-Item -LiteralPath $dst).Length
    continue
  }

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('sanguo_audio_' + [guid]::NewGuid().ToString('N') + '.mp3')
  # mono 源（64k）用 48k，stereo 源（128k）用 56k：MP3 只认 32/40/48/56/64… 这些整档码率，
  # 写 54k 会被 lame 就近吞回 56k（实测文件一个字节都没变），所以这里按声道数分档。
  $ch = Get-AudioChannels $f.FullName
  $rate = $(if ($BgmMono -or $ch -eq 1) { $bgmMonoBitrate } else { $bgmBitrate })
  $extra = @()
  if ($BgmMono) { $extra = @('-ac', '1', '-ar', '32000') }
  Info ("  {0}：{1} 声道 → {2}{3}" -f $f.Name, $(if ($ch -eq 0) { '?' } else { $ch }), $rate, $(if ($BgmMono) { '（强制单声道 32kHz）' } else { '' }))
  try {
    & $Ffmpeg -hide_banner -loglevel error -nostdin -y -i $f.FullName @extra -codec:a libmp3lame -b:a $rate -f mp3 $tmp 2>&1 | Out-String | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tmp)) {
      Bad ("ffmpeg 转码失败（exit={0}）：{1}" -f $LASTEXITCODE, $f.Name)
      continue
    }
    Move-Item -LiteralPath $tmp -Destination $dst -Force
    $bgmDone += 1
    $bgmAfter += (Get-Item -LiteralPath $dst).Length
  } finally {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
  }
}
Info ("BGM：转码 {0} 档 / 跳过 {1} 档；{2} → {3}" -f $bgmDone, $bgmSkipped, (Format-Size $bgmBefore), (Format-Size $bgmAfter))

# ---------------------------------------------------------------------------
# 3) SFX：-SfxKbps > 0 时转码（R199 起：20MB 总包限制下必须压），否则原样复制
# ---------------------------------------------------------------------------
if ($SfxKbps -gt 0) {
  Step ("SFX 转码（{0} 档 → {1}k mono 22.05kHz）" -f $srcSfxFiles.Count, $SfxKbps)
} else {
  Step ("SFX 复制（{0} 档）" -f $srcSfxFiles.Count)
}
$sfxSkipped = 0
$sfxDone = 0
$sfxBefore = 0
$sfxAfter = 0
foreach ($f in $srcSfxFiles) {
  $dst = Join-Path $dstSfx $f.Name
  $key = 'audio/sfx/' + [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  $sfxBefore += $f.Length
  $skip = $false
  if (-not $Force -and -not $encodeChanged -and (Test-Path -LiteralPath $dst)) {
    $item = Get-Item -LiteralPath $dst
    $old = $oldFiles[$key]
    # 注意：只有「复制模式」dst 才等于源长度；转码模式下必须只比清单，不能拿源长度比 dst
    if ($old -and [long]$old.bytes -eq $item.Length -and [string]$old.sha256 -eq (Get-Sha256Hex $dst).Substring(0, 12)) {
      $skip = $true
    }
  }
  if ($skip) {
    $sfxSkipped += 1
    $sfxAfter += (Get-Item -LiteralPath $dst).Length
    continue
  }
  if ($SfxKbps -gt 0) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('sanguo_sfx_' + [guid]::NewGuid().ToString('N') + '.mp3')
    try {
      $sfxRate = '' + $SfxKbps + 'k'
      & $Ffmpeg -hide_banner -loglevel error -nostdin -y -i $f.FullName -ac 1 -ar 22050 -codec:a libmp3lame -b:a $sfxRate -f mp3 $tmp 2>&1 | Out-String | Out-Null
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tmp)) {
        Bad ("SFX ffmpeg 失败（exit={0}）：{1}" -f $LASTEXITCODE, $f.Name)
        continue
      }
      Move-Item -LiteralPath $tmp -Destination $dst -Force
    } finally {
      if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
  } else {
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
  }
  $sfxDone += 1
  $sfxAfter += (Get-Item -LiteralPath $dst).Length
}
Info ("SFX：{0} {1} 档 / 跳过 {2} 档；{3} → {4}" -f $(if ($SfxKbps -gt 0) { '转码' } else { '复制' }), $sfxDone, $sfxSkipped, (Format-Size $sfxBefore), (Format-Size $sfxAfter))

# ---------------------------------------------------------------------------
# 4) 清掉目标目录里多出来的 mp3（源目录已删的曲子不能残留在包里）
# ---------------------------------------------------------------------------
$srcBgmNames = @{}
foreach ($f in $srcBgmFiles) { $srcBgmNames[$f.Name] = $true }
$srcSfxNames = @{}
foreach ($f in $srcSfxFiles) { $srcSfxNames[$f.Name] = $true }
$stale = 0
foreach ($f in @(Get-ChildItem -LiteralPath $dstBgm -File -Filter '*.mp3' -ErrorAction SilentlyContinue)) {
  if (-not $srcBgmNames.ContainsKey($f.Name)) { Remove-Item -LiteralPath $f.FullName -Force; $stale += 1 }
}
foreach ($f in @(Get-ChildItem -LiteralPath $dstSfx -File -Filter '*.mp3' -ErrorAction SilentlyContinue)) {
  if (-not $srcSfxNames.ContainsKey($f.Name)) { Remove-Item -LiteralPath $f.FullName -Force; $stale += 1 }
}
if ($stale -gt 0) { Info ("清掉目标目录里源目录没有的旧文件 {0} 档" -f $stale) }

# ---------------------------------------------------------------------------
# 5) 重新生成 audio-manifest.json（以磁盘上的成品为准，路径 = 包内相对路径）
# ---------------------------------------------------------------------------
Step '生成 audio-manifest.json'
$items = New-Object System.Collections.Generic.List[object]
$totalBytes = 0
foreach ($f in @(Get-ChildItem -LiteralPath $dstBgm -File -Filter '*.mp3' | Sort-Object Name)) {
  $key = 'audio/bgm/' + [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  $rel = 'audio/bgm/' + $f.Name
  $sha = Get-Sha256Hex $f.FullName
  $items.Add([pscustomobject]@{ Key = $key; Rel = $rel; Bytes = $f.Length; Sha = $sha }) | Out-Null
  $totalBytes += $f.Length
}
foreach ($f in @(Get-ChildItem -LiteralPath $dstSfx -File -Filter '*.mp3' | Sort-Object Name)) {
  $key = 'audio/sfx/' + [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
  $rel = 'audio/sfx/' + $f.Name
  $sha = Get-Sha256Hex $f.FullName
  $items.Add([pscustomobject]@{ Key = $key; Rel = $rel; Bytes = $f.Length; Sha = $sha }) | Out-Null
  $totalBytes += $f.Length
}
$sorted = @($items | Sort-Object Key)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('{')
$lines.Add('  "version": 1,')
$lines.Add('  "bundle": ' + (ConvertTo-JsonString $Bundle) + ',')
$lines.Add('  "source": "assets/bundles/res/audio",')
$lines.Add('  "encode": {"bgm":"' + $bgmEncode + '","sfx":"copy"},')
$lines.Add('  "count": ' + $sorted.Count + ',')
$lines.Add('  "bytes": ' + $totalBytes + ',')
$lines.Add('  "files": {')
for ($i = 0; $i -lt $sorted.Count; $i++) {
  $it = $sorted[$i]
  $line = '    ' + (ConvertTo-JsonString $it.Key) + ': {"path":' + (ConvertTo-JsonString $it.Rel) +
          ',"bytes":' + $it.Bytes + ',"sha256":"' + $it.Sha.Substring(0, 12) + '"}'
  if ($i -lt $sorted.Count - 1) { $line += ',' }
  $lines.Add($line)
}
$lines.Add('  }')
$lines.Add('}')
$manifestText = ($lines -join "`n") + "`n"
[System.IO.File]::WriteAllText($manifestPath, $manifestText, $utf8)
Info ("清单：{0}（{1} 档 / {2}）" -f $manifestPath, $sorted.Count, (Format-Size $totalBytes))

# ---------------------------------------------------------------------------
# 6) 汇总
# ---------------------------------------------------------------------------
Step '结果'
$srcTotal = $bgmBefore + $sfxBefore
$dstTotal = $totalBytes
Write-Host ('  {0,-8}{1,10}{2,10}{3,12}{4,10}' -f '类别', '源', '目标', '变化', '档数')
Write-Host ('  {0,-8}{1,10}{2,10}{3,12}{4,10}' -f 'BGM', (Format-Size $bgmBefore), (Format-Size $bgmAfter), ('{0:N1}%' -f ($bgmAfter * 100.0 / $bgmBefore)), $srcBgmFiles.Count)
Write-Host ('  {0,-8}{1,10}{2,10}{3,12}{4,10}' -f 'SFX', (Format-Size $sfxBefore), (Format-Size $sfxAfter), ('{0:N1}%' -f ($sfxAfter * 100.0 / $sfxBefore)), $srcSfxFiles.Count)
Write-Host ('  {0,-8}{1,10}{2,10}{3,12}{4,10}' -f '合计', (Format-Size $srcTotal), (Format-Size $dstTotal), ('{0:N1}%' -f ($dstTotal * 100.0 / $srcTotal)), $sorted.Count)
Info ("跳过 {0} 档（已存在且字节 + sha256 一致，未重转/未重拷）" -f ($bgmSkipped + $sfxSkipped))
Info ("跳到下一次出包：tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload -Audio embed")

if ($script:Failures -gt 0) {
  Write-Host ("`n❌ 有 {0} 项失败" -f $script:Failures) -ForegroundColor Red
  exit 1
}
Write-Host "`n✅ 本地音频就绪（跑第二遍应打印「跳过 109 档」）" -ForegroundColor Green
exit 0
