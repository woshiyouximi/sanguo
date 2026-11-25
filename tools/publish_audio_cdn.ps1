<#
  publish_audio_cdn.ps1 —— 把 dist\audio-cdn\ 同步到 CDN 根目录（上传 / 校验两件事）

  为什么是「本地目录」而不是各种云 SDK：
    sftp / COS / OSS / S3 在本机都先挂载成盘符或 UNC（rclone mount、cosfs、ossfs、
    sshfs、Windows 网络驱动器），脚本只负责「把 109 个文件按相对路径摆好 + 校验字节」。
    这样不引入任何云凭据、不装 SDK、在 CI 里也能跑；挂载/凭据是运维那一步的事。
    传入 URL 形式（sftp:// cos:// oss:// s3:// http:// …）会**明确报错退出**，不会静默跳过。

  两个模式（二选一）：

    -Target <目录>
        同步 `dist\audio-cdn\audio\**` + `audio-manifest.json` 到该目录。
        逐档打印 相对路径 / 字节 / sha256 前 12 位 / 动作（copy | same），
        末行打印总字节与变化数。幂等：内容一致的文件不重写，第二次跑 0 变化。
        目标可写性会先探测（只读挂载会报错）。

    -Verify <baseUrl>
        逐档 HEAD `<baseUrl>/<相对路径>`（并发 ≤ 4），校验 HTTP 200 + Content-Length
        与清单一致；打印缺失 / 大小不符清单，失败退出码 1。

  退出码：0 成功；1 校验失败；2 参数 / 环境错误。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish_audio_cdn.ps1 -Target X:\cdn\sanguo\audio-cdn
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish_audio_cdn.ps1 -Target \\nas\web\sanguo\audio-cdn
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish_audio_cdn.ps1 -Verify https://cdn.your.com/sanguo/audio-cdn
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish_audio_cdn.ps1 -Target X:\cdn\audio-cdn -Prune

  注意：本文件必须存成 UTF-8 **with BOM**（同 build_wechat.ps1，PS5.1 按 ANSI 读无 BOM 会乱码）。
#>
[CmdletBinding()]
param(
  # 本地目录 / 已挂载的 sftp、COS、OSS 盘符或 UNC；与 -Verify 二选一
  [string]$Target = '',
  # CDN 根地址（http/https），逐档 HEAD 校验；与 -Target 二选一
  [string]$Verify = '',
  # 源目录（默认 <repo>\dist\audio-cdn，一般不用改）
  [string]$Source = '',
  # 期望档数（清单里的 count 必须等于它）
  [int]$ExpectCount = 109,
  # HEAD 并发（上限 4）
  [int]$Concurrency = 4,
  [int]$TimeoutSec = 20,
  # 删除目标目录里清单之外的文件（危险，默认只警告）
  [switch]$Prune
)

$ErrorActionPreference = 'Stop'

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Source) { $Source = Join-Path $script:RepoRoot 'dist\audio-cdn' }

function Write-Section([string]$Text) { Write-Host "`n== $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "  OK  $Text" -ForegroundColor Green }
function Write-Bad([string]$Text) { Write-Host "  FAIL $Text" -ForegroundColor Red }
function Write-Note([string]$Text) { Write-Host "  -   $Text" -ForegroundColor Gray }

function Format-Size([double]$Bytes) {
  if ($Bytes -ge 1MB) { return ('{0:N2} MB' -f ($Bytes / 1MB)) }
  if ($Bytes -ge 1KB) { return ('{0:N0} KB' -f ($Bytes / 1KB)) }
  return ('{0:N0} B' -f $Bytes)
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

function Get-FileLength([string]$Path) {
  return (Get-Item -LiteralPath $Path).Length
}

# ---------------------------------------------------------------------------
# 清单读取 + 本地自检（两个模式共用）
# ---------------------------------------------------------------------------
$manifestPath = Join-Path $Source 'audio-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  Write-Bad "找不到清单：$manifestPath"
  Write-Note '先跑一次 tools\build_wechat.ps1 -Audio cdn（它会生成 dist\audio-cdn）'
  exit 2
}

$mf = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$entries = @($mf.files.PSObject.Properties)
Write-Host '三国群英传 2 · 音频 CDN' -ForegroundColor Magenta
Write-Note ("源目录 : {0}" -f $Source)
Write-Note ("清单   : count={0} bytes={1} 条目={2}" -f $mf.count, $mf.bytes, $entries.Count)

$bad = New-Object System.Collections.Generic.List[string]
if ($entries.Count -ne [int]$mf.count) { $bad.Add("清单自相矛盾：count=$($mf.count) 实际条目=$($entries.Count)") }
if ([int]$mf.count -ne $ExpectCount) { $bad.Add("档数不是 $ExpectCount：count=$($mf.count)（-ExpectCount 可改，但别拿来掩盖缺档）") }

$sumBytes = 0
$items = New-Object System.Collections.Generic.List[object]
foreach ($p in $entries) {
  $rel = [string]$p.Value.path
  $bytes = [int64]$p.Value.bytes
  $sha12 = [string]$p.Value.sha256
  $local = Join-Path $Source $rel.Replace('/', '\')
  $sumBytes += $bytes
  if (-not (Test-Path -LiteralPath $local)) {
    $bad.Add("缺文件：$rel"); continue
  }
  $realLen = Get-FileLength $local
  if ($realLen -ne $bytes) { $bad.Add("大小不符：$rel 清单 $bytes 实际 $realLen"); continue }
  $realSha = (Get-Sha256Hex $local).Substring(0, 12)
  if ($realSha -ne $sha12) { $bad.Add("sha256 不符：$rel 清单 $sha12 实际 $realSha"); continue }
  $items.Add([pscustomobject]@{ Key = [string]$p.Name; Rel = $rel; Bytes = $bytes; Sha = $sha12; Local = $local }) | Out-Null
}
if ($sumBytes -ne [int64]$mf.bytes) { $bad.Add("清单 bytes 字段 $($mf.bytes) ≠ 逐档求和 $sumBytes") }
if ($bad.Count -gt 0) {
  Write-Bad "本地清单自检未通过（$($bad.Count) 项）："
  foreach ($b in $bad) { Write-Note $b }
  exit 2
}
Write-Ok ("本地自检通过：{0} 档 / {1}" -f $items.Count, (Format-Size $sumBytes))

# ---------------------------------------------------------------------------
# 模式 A：-Verify（只读，逐档 HEAD）
# ---------------------------------------------------------------------------
function Invoke-RemoteVerify([string]$BaseUrl) {
  $base = $BaseUrl.Trim().TrimEnd('/')
  if ($base -notmatch '^https?://') {
    Write-Bad "-Verify 只接受 http/https 地址：$BaseUrl"
    return 2
  }
  if ($Concurrency -gt 4) { $Concurrency = 4 }
  if ($Concurrency -lt 1) { $Concurrency = 1 }

  $targets = New-Object System.Collections.Generic.List[object]
  foreach ($it in $items) { $targets.Add([pscustomobject]@{ Rel = $it.Rel; Bytes = $it.Bytes; Url = "$base/$($it.Rel)" }) | Out-Null }
  $targets.Add([pscustomobject]@{ Rel = 'audio-manifest.json'; Bytes = (Get-FileLength $manifestPath); Url = "$base/audio-manifest.json" }) | Out-Null

  Write-Section ("-Verify {0}（{1} 档，并发 {2}）" -f $base, $targets.Count, $Concurrency)
  $pool = [runspacefactory]::CreateRunspacePool(1, $Concurrency)
  $pool.Open()
  $jobs = New-Object System.Collections.Generic.List[object]
  try {
    foreach ($t in $targets) {
      $ps = [powershell]::Create()
      $ps.RunspacePool = $pool
      [void]$ps.AddScript({
        param($url, $expect, $timeoutSec)
        $status = 0
        $len = $null
        $err = ''
        try {
          $r = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
          $status = [int]$r.StatusCode
          $h = $r.Headers['Content-Length']
          if ($null -ne $h) {
            if ($h -is [System.Array]) { $len = [int64]$h[0] } else { $len = [int64]$h }
          } elseif ($r.PSObject.Properties['RawContentLength'] -and $null -ne $r.RawContentLength) {
            $len = [int64]$r.RawContentLength
          }
        } catch {
          $resp = $_.Exception.Response
          if ($resp) {
            try { $status = [int]$resp.StatusCode } catch { $status = -1 }
          } elseif ($_.Exception.PSObject.Properties['StatusCode'] -and $null -ne $_.Exception.StatusCode) {
            $status = [int]$_.Exception.StatusCode
          } else {
            $status = -1
          }
          $err = $_.Exception.Message
        }
        return [pscustomobject]@{ Status = $status; Length = $len; Error = $err }
      }).AddArgument($t.Url).AddArgument($t.Bytes).AddArgument($TimeoutSec)
      $jobs.Add([pscustomobject]@{ Target = $t; Ps = $ps; Handle = $ps.BeginInvoke() }) | Out-Null
    }

    $missing = New-Object System.Collections.Generic.List[string]
    $mismatch = New-Object System.Collections.Generic.List[string]
    $ok = 0
    foreach ($j in $jobs) {
      $res = $null
      try { $res = $j.Ps.EndInvoke($j.Handle) } catch { $res = [pscustomobject]@{ Status = -1; Length = $null; Error = $_.Exception.Message } }
      $st = if ($res -and $res.Count -gt 0) { $res[0] } else { [pscustomobject]@{ Status = -1; Length = $null; Error = 'no result' } }
      if ($st.Status -ne 200) {
        $detail = if ($st.Error) { "（$($st.Error)）" } else { '' }
        $missing.Add(("{0}  HTTP {1}{2}" -f $j.Target.Rel, $st.Status, $detail))
      } elseif ($null -eq $st.Length) {
        $mismatch.Add(("{0}  200 但没有 Content-Length（无法核对字节）" -f $j.Target.Rel))
      } elseif ([int64]$st.Length -ne [int64]$j.Target.Bytes) {
        $mismatch.Add(("{0}  期望 {1} 实际 {2}" -f $j.Target.Rel, $j.Target.Bytes, $st.Length))
      } else {
        $ok++
      }
    }
  } finally {
    foreach ($j in $jobs) { try { $j.Ps.Dispose() } catch { } }
    $pool.Close()
  }

  Write-Host ("  通过 {0}/{1}" -f $ok, $targets.Count) -ForegroundColor $(if ($ok -eq $targets.Count) { 'Green' } else { 'Yellow' })
  if ($missing.Count -gt 0) {
    Write-Bad ("缺失 / 非 200：{0} 档" -f $missing.Count)
    $missing | Select-Object -First 20 | ForEach-Object { Write-Note $_ }
    if ($missing.Count -gt 20) { Write-Note ("… 还有 {0} 档" -f ($missing.Count - 20)) }
  }
  if ($mismatch.Count -gt 0) {
    Write-Bad ("大小不符 / 无法核对：{0} 档" -f $mismatch.Count)
    $mismatch | Select-Object -First 20 | ForEach-Object { Write-Note $_ }
    if ($mismatch.Count -gt 20) { Write-Note ("… 还有 {0} 档" -f ($mismatch.Count - 20)) }
  }
  if ($missing.Count -eq 0 -and $mismatch.Count -eq 0) {
    Write-Host "`nVERIFY OK  $base" -ForegroundColor Green
    return 0
  }
  Write-Host "`nVERIFY FAIL  $base" -ForegroundColor Red
  return 1
}

# ---------------------------------------------------------------------------
# 模式 B：-Target（同步 + 幂等）
# ---------------------------------------------------------------------------
function Invoke-SyncTarget([string]$TargetPath) {
  if ($TargetPath -match '^([a-zA-Z][a-zA-Z0-9+.\-]*)://') {
    Write-Bad "不支持直接对 $($Matches[1]):// 传输：-Target 只接受本地目录"
    Write-Note 'sftp / COS / OSS / S3 请先挂载成本地盘符或 UNC（rclone mount、cosfs、ossfs、网络驱动器）'
    Write-Note '示例：rclone mount mycos:/sanguo X: → -Target X:\audio-cdn'
    return 2
  }
  if ($TargetPath -match '^[a-zA-Z]:[^\\/]') {
    Write-Bad "路径不像本地绝对路径：$TargetPath（盘符后必须是 \）"
    return 2
  }

  if (-not (Test-Path -LiteralPath $TargetPath)) {
    try {
      New-Item -ItemType Directory -Force -Path $TargetPath | Out-Null
      Write-Note "目标不存在，已创建：$TargetPath"
    } catch {
      Write-Bad "无法创建目标目录：$TargetPath（$($_.Exception.Message)）"
      return 2
    }
  }
  if (-not (Test-Path -LiteralPath $TargetPath -PathType Container)) {
    Write-Bad "目标不是目录：$TargetPath"
    return 2
  }

  $srcFull = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
  $dstFull = (Resolve-Path -LiteralPath $TargetPath).Path.TrimEnd('\')
  if ($dstFull -eq $srcFull -or $dstFull.StartsWith($srcFull + '\') -or $srcFull.StartsWith($dstFull + '\')) {
    Write-Bad "目标不能与源目录重叠：源 $srcFull / 目标 $dstFull"
    return 2
  }

  # 可写性探测：只读挂载 / 权限不足要在这里就失败，别传一半
  $probe = Join-Path $dstFull ('.publish-probe-' + [guid]::NewGuid().ToString('N'))
  try {
    [System.IO.File]::WriteAllText($probe, 'ok')
  } catch {
    Write-Bad "目标不可写：$dstFull（$($_.Exception.Message)）"
    Write-Note '只读挂载 / 权限不足？先确认挂载参数后再跑'
    return 2
  } finally {
    if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue }
  }

  Write-Section ("同步 → {0}" -f $dstFull)
  Write-Host ('  ' + '相对路径'.PadRight(38) + '字节'.PadLeft(12) + '  sha256(12)    动作') -ForegroundColor DarkGray
  Write-Host ('  ' + ('-' * 78)) -ForegroundColor DarkGray

  $written = 0
  $same = 0
  $writeBytes = 0
  $expected = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($it in $items) {
    $rel = $it.Rel
    $dst = Join-Path $dstFull $rel.Replace('/', '\')
    [void]$expected.Add($rel.Replace('/', '\'))
    $rowStatus = 'copy'
    if (Test-Path -LiteralPath $dst -PathType Leaf) {
      if ((Get-FileLength $dst) -eq $it.Bytes -and (Get-Sha256Hex $dst).Substring(0, 12) -eq $it.Sha) {
        $rowStatus = 'same'
      }
    }
    if ($rowStatus -eq 'copy') {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
      Copy-Item -LiteralPath $it.Local -Destination $dst -Force
      $written++
      $writeBytes += $it.Bytes
    } else {
      $same++
    }
    $line = '  ' + $rel.PadRight(38) + ([string]$it.Bytes).PadLeft(12) + '  ' + $it.Sha + '  ' + $rowStatus
    Write-Host $line
  }

  # 清单本身
  $mfRel = 'audio-manifest.json'
  [void]$expected.Add($mfRel)
  $mfDst = Join-Path $dstFull $mfRel
  $mfBytes = Get-FileLength $manifestPath
  $mfSha = (Get-Sha256Hex $manifestPath).Substring(0, 12)
  $mfStatus = 'copy'
  if (Test-Path -LiteralPath $mfDst -PathType Leaf) {
    if ((Get-FileLength $mfDst) -eq $mfBytes -and (Get-Sha256Hex $mfDst).Substring(0, 12) -eq $mfSha) { $mfStatus = 'same' }
  }
  if ($mfStatus -eq 'copy') {
    Copy-Item -LiteralPath $manifestPath -Destination $mfDst -Force
    $written++
    $writeBytes += $mfBytes
  } else {
    $same++
  }
  Write-Host ('  ' + $mfRel.PadRight(38) + ([string]$mfBytes).PadLeft(12) + '  ' + $mfSha + '  ' + $mfStatus)

  # 目标里的多余文件
  $extras = New-Object System.Collections.Generic.List[string]
  foreach ($f in Get-ChildItem -LiteralPath $dstFull -Recurse -File -ErrorAction SilentlyContinue) {
    $rel = $f.FullName.Substring($dstFull.Length).TrimStart('\')
    if (-not $expected.Contains($rel)) { $extras.Add($rel) }
  }
  if ($extras.Count -gt 0) {
    if ($Prune) {
      foreach ($e in $extras) { Remove-Item -LiteralPath (Join-Path $dstFull $e) -Force -ErrorAction SilentlyContinue }
      Write-Note ("删除清单之外的文件 {0} 个（-Prune）" -f $extras.Count)
    } else {
      Write-Note ("目标里另有 {0} 个清单之外的文件（未动；-Prune 可删除）：{1}{2}" -f `
        $extras.Count, (($extras | Select-Object -First 5) -join ', '), $(if ($extras.Count -gt 5) { ' …' } else { '' }))
    }
  }

  Write-Host ('  ' + ('-' * 78)) -ForegroundColor DarkGray
  Write-Host ("  本次写入 {0} 档 / {1}；已一致跳过 {2} 档；合计 {3}" -f $written, (Format-Size $writeBytes), $same, (Format-Size ($sumBytes + $mfBytes)))
  if ($written -eq 0) {
    Write-Host "`nPUBLISH OK（0 变化，幂等）$dstFull" -ForegroundColor Green
  } else {
    Write-Host "`nPUBLISH OK（写入 $written 档 / $(Format-Size $writeBytes)）$dstFull" -ForegroundColor Green
  }
  return 0
}

# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
if ($Target -and $Verify) {
  Write-Bad '-Target 与 -Verify 只能二选一'
  exit 2
}
if (-not $Target -and -not $Verify) {
  Write-Bad '要么 -Target <本地目录>（上传），要么 -Verify <baseUrl>（校验）'
  Write-Host @'
  用法：
    tools\publish_audio_cdn.ps1 -Target X:\cdn\sanguo\audio-cdn
    tools\publish_audio_cdn.ps1 -Verify https://cdn.your.com/sanguo/audio-cdn
'@
  exit 2
}

if ($Verify) { exit (Invoke-RemoteVerify $Verify) }
exit (Invoke-SyncTarget $Target)
