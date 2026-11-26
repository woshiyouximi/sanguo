<#
  build_wechat.ps1 —— 一条命令出「可上传的微信小游戏包」

      构建（wechatgame + web-mobile）→ 按 Mode 处理资源 → 注入 AppID → 体检 → 体积表

  三种 Mode（资源怎么放，决定包能不能上传）：

    preview  资源内嵌在 assets/res，不做任何拆分。
             → 给微信开发者工具「扫码预览」用。主包 > 4 MB 是正常的，**不能上传**。

    upload   资源走微信分包 subpackages/res/（主包只剩引擎 + 代码）。
             → 可以「上传」到微信后台。主包 < 4 MB，整体 < 20 MB。

    remote   资源走 CDN（assets.server + remoteBundles，包内不再带 res）。
             → 可以上传；同时要把 dist\cdn\remote\ 整个传到 CDN 根，且下面必须有 remote/ 前缀
                （引擎实际请求 <server>remote/res/…）。

  为什么脚本里全是防御性判断（都是本项目真踩过的坑）：
   1) Cocos Creator 是 Electron 应用。环境里若残留 ELECTRON_RUN_AS_NODE=1，
      exe 会退化成 node 解释器，--project 直接报 "bad option"（而且看起来像构建失败）。
   2) CLI **经常以 exit code = null 结束**（日志里其实早就 Finished），
      所以成功判据只能是「日志有 `build Task (<platform>) Finished`」+「产物目录存在」。
   3) `startScene` 不传 → CLI 静默不产出任何东西（没产物、没报错）。
   4) `--build` 传不了 `bundleConfigs`，所以「哪个 bundle 走远程/分包」只能构建后处理。
   5) wechatgame 模板内置 Cocos 演示 AppID，`--build appid=...` 实测不生效，
      只能构建后覆写 project.config.json 再回读校验。
   6) 微信要求每个分包根目录下必须有 game.js，纯资源分包放一个空占位文件。
   7) game.json 带 BOM 时微信 IDE 报 JSON 解析错误；这里校验首字节必须是 0x7B（'{'）。

  用法：
    .\tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode upload
    .\tools\build_wechat.ps1 -AppId wx… -Mode preview
    .\tools\build_wechat.ps1 -AppId wx… -Mode remote -Server https://cdn.your.com/sanguo/
    .\tools\build_wechat.ps1 -AppId wx… -Mode upload -SkipWeb     # 只出小游戏包，不重建 web-mobile
    .\tools\build_wechat.ps1 -AppId wx… -Mode upload -Open        # 出包后打开产物目录
    .\tools\build_wechat.ps1 -AppId wx… -Mode upload -KeepAudio   # 保留音效（= -Audio embed，默认剔除）
    .\tools\build_wechat.ps1 -AppId wx… -Mode upload -Audio none   # 剔除但不生成 CDN 清单
    .\tools\build_wechat.ps1 -AppId wx… -Mode upload -Audio cdn -AudioBase https://cdn.your.com/sanguo/audio-cdn
                                                                   # 出包时把 CDN 音频根写进包内 audio-remote.json（源文件仍留空）

   8) 本文件必须存成 UTF-8 **with BOM**：Windows PowerShell 5.1 按 ANSI 读无 BOM 的 .ps1，
      中文注释会变成乱码，并报 `Unexpected token` 之类的假语法错误。
   9) 本机执行策略禁止直接 `.\xx.ps1`，用
      `powershell -NoProfile -ExecutionPolicy Bypass -File tools\build_wechat.ps1 …`。

  音频（16.07 MB / 109 档：10 首 BGM + 99 个音效）装不进 20 MB 总配额，所以默认不从包里发，
  改走 CDN（运行侧的接线在 `game/cocos/assets/scripts/AudioHost.ts`，见 `project/77_音频CDN通道.md`）：

    -Audio cdn    （默认）照旧把音频从包内剔除，同时生成两样东西：
                    dist\wechat-upload\audio-manifest.json  逻辑名 → 相对路径 / 字节数 / sha256 前 12 位
                    dist\audio-cdn\audio\{bgm,sfx}\*.mp3    保持相对路径，整个目录直传 CDN
                    dist\audio-cdn\audio-manifest.json     同一份清单（运行时会去 CDN 取）
                  再去 assets\bundles\res\audio-remote.json 填 CDN 根、重新出包。
    -Audio none   只剔除，不生成清单/目录（只想确认「静音但绝不崩」时用）。
    -Audio embed  不剔除（等价旧的 -KeepAudio）：音频进包 → 总包 ~31.9 MB，**不能上传**，仅本地验证。

  音频剔除按扩展名做（.mp3/.ogg/.wav/.m4a/.aac），所以 audio-remote.json、audio-manifest.json
  这类 .json 不会被误删；同理 CDN 目录只能从**工程源目录** `assets/bundles/res/audio` 复制，
  不能拿构建产物 —— 那边 mp3 叫 `native\<uuid 前2>\<uuid>.<hash>.mp3`，不可读也不稳定。
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AppId,
  [string]$Server = 'https://cdn.example.com/sanguo/',
  [ValidateSet('upload', 'preview', 'remote')][string]$Mode = 'upload',

  # 路径/工具（一般不用改）
  [string]$Project = 'F:/sanguo/game/cocos',
  [string]$OutDir = 'F:/sanguo/game/cocos-build',
  [string]$DistRoot = 'F:/sanguo/dist',
  [string]$Tools = 'F:/sanguo/work',
  [string]$CreatorExe = 'F:\sanguo\tools\cocos\cc388\CocosCreator.exe',
  [string]$StartScene = '0b007000-1a2b-4c3d-8e4f-000000000001',   # Boot.scene
  [string]$ResBundle = 'res',
  # 音频：cdn = 剔除 + 生成 CDN 清单/目录（默认）；none = 只剔除；embed = 留在包里
  [ValidateSet('cdn', 'none', 'embed')][string]$Audio = 'cdn',
  # CDN 音频根（如 https://cdn.your.com/sanguo/audio-cdn）：只写进**出包产物**里的
  # audio-remote.json，源工程里的文件始终留空；留空 = 包内静音（不崩，只是没声）
  [string]$AudioBase = '',
  [switch]$SkipWeb,
  [switch]$KeepAudio,
  [switch]$Open,

  # 资源瘦身（-Mode upload 出包前的 png 瘦身）：默认关，加了才动构建产物
  #   png 是包里唯一还能动的大块（音频不许删、已有 webp 已是有损），瘦身方式见 slim_png.py
  [switch]$Slim,
  [int]$SlimMinBytes = 10240,      # 小于这个体积的 png 不动（省几十字节不值得改 fmt）
  [int]$SlimQuality = 92,          # webp 质量；现有 1210 张 webp 实测等效 q85-86
  [string]$Python = ''             # 指定 python（需 Pillow）；留空自动找
)

# -KeepAudio 是 -Audio embed 的旧名，保留兼容；其余情况以 -Audio 为准
$script:AudioMode = if ($KeepAudio) { 'embed' } else { $Audio }
# 与 Remove-UnusedAudio 共用的扩展名表：删什么，就要能从 CDN 目录取到什么
$script:AudioExts = @('.mp3', '.ogg', '.wav', '.m4a', '.aac')

# base 只对 -Audio cdn 有意义；参数组合不对就早失败，别跑完几分钟构建才报（不允许静默忽略）
$script:AudioBaseUrl = $AudioBase.Trim().TrimEnd('/')
if ($script:AudioBaseUrl -and $script:AudioMode -ne 'cdn') {
  throw "-AudioBase 需要 -Audio cdn（当前 -Audio $($script:AudioMode)）：base 只用于远程音频"
}
if ($script:AudioBaseUrl -and $Mode -eq 'remote') {
  throw "-AudioBase 不支持 -Mode remote（remote 的 res 整体走 CDN，包里不保留可注入的 res bundle）"
}

# R193：CDN base 的权威来源是 tools\audio_cdn_config.json（不进源码、不含示例域名）。
# 优先级：-AudioBase 参数 > 配置文件；两者都空 = 静音出包（显式告警，不拦构建）。
$script:AudioCdnConfigPath = Join-Path $PSScriptRoot 'audio_cdn_config.json'
if (-not $script:AudioBaseUrl -and $script:AudioMode -eq 'cdn' -and (Test-Path $script:AudioCdnConfigPath)) {
  try {
    $cfg = Get-Content $script:AudioCdnConfigPath -Raw -Encoding utf8 | ConvertFrom-Json
    if ($cfg -and $cfg.base) { $script:AudioBaseUrl = ([string]$cfg.base).Trim().TrimEnd('/') }
  } catch {
    Write-Warning "读 tools\audio_cdn_config.json 失败（$($_.Exception.Message)），按「未配置 CDN」继续"
  }
}
# 占位/本机地址一律拒绝：历史上 example.com 曾被写进发布包（project/142 §6）
if ($script:AudioBaseUrl -match '(?i)example\.(com|org|net)|your\.com|localhost|127\.0\.0\.1') {
  throw "-AudioBase '$($script:AudioBaseUrl)' 是占位或本机地址，发布包不能带它；请把真实 CDN 根填进 tools\audio_cdn_config.json（或传 -AudioBase）"
}
if (-not $script:AudioBaseUrl -and $script:AudioMode -eq 'cdn') {
  Write-Warning '音频将以静音出包：未配置 CDN base（tools\audio_cdn_config.json 的 base 为空）。填好后重出包即可，这一步不拦构建。'
}

$ErrorActionPreference = 'Stop'
$script:Failures = New-Object System.Collections.Generic.List[string]

function Fail([string]$Message) {
  $script:Failures.Add($Message) | Out-Null
  Write-Host "  ✗ $Message" -ForegroundColor Red
}

function Info([string]$Message) { Write-Host "  · $Message" -ForegroundColor Gray }
function Step([string]$Message) { Write-Host "`n== $Message" -ForegroundColor Cyan }

function Get-DirStat {
  param([string]$Path, [string[]]$ExcludeRel = @())
  $result = [pscustomobject]@{ Bytes = 0; Files = 0 }
  if (-not (Test-Path -LiteralPath $Path)) { return $result }
  $root = (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\') + '\'
  $bytes = 0
  $files = 0
  foreach ($item in Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue) {
    $rel = $item.FullName.Substring($root.Length)
    $skip = $false
    foreach ($prefix in $ExcludeRel) {
      if ($rel -like "$prefix*") { $skip = $true; break }
    }
    if ($skip) { continue }
    $bytes += $item.Length
    $files += 1
  }
  return [pscustomobject]@{ Bytes = $bytes; Files = $files }
}

function Format-Size([double]$Bytes) {
  if ($Bytes -ge 1MB) { return ('{0:N2} MB' -f ($Bytes / 1MB)) }
  return ('{0:N0} KB' -f ($Bytes / 1KB))
}

# 中文按 2 列宽算，否则 '项目/体积' 表会歪（-f 的补空格只数字符数）
function Get-DisplayWidth([string]$Text) {
  if ([string]::IsNullOrEmpty($Text)) { return 0 }
  $w = 0
  foreach ($ch in $Text.ToCharArray()) {
    $code = [int][char]$ch
    if (($code -ge 0x1100 -and $code -le 0x115F) -or ($code -ge 0x2E80 -and $code -le 0xA4CF) -or
        ($code -ge 0xAC00 -and $code -le 0xD7A3) -or ($code -ge 0xF900 -and $code -le 0xFAFF) -or
        ($code -ge 0xFE30 -and $code -le 0xFE6F) -or ($code -ge 0xFF00 -and $code -le 0xFF60) -or
        ($code -ge 0xFFE0 -and $code -le 0xFFE6)) { $w += 2 } else { $w += 1 }
  }
  return $w
}

function Pad-Display([string]$Text, [int]$Width) {
  $d = Get-DisplayWidth $Text
  if ($d -ge $Width) { return $Text }
  return $Text + (' ' * ($Width - $d))
}

function Pad-DisplayLeft([string]$Text, [int]$Width) {
  $d = Get-DisplayWidth $Text
  if ($d -ge $Width) { return $Text }
  return (' ' * ($Width - $d)) + $Text
}

function Write-Row([string]$Name, [double]$Bytes, [int]$Files, [string]$Note = '') {
  $line = '  ' + (Pad-Display $Name 26) + (Pad-DisplayLeft (Format-Size $Bytes) 12) +
          (Pad-DisplayLeft ([string]$Files) 10) + '  ' + $Note
  Write-Host $line.TrimEnd()
}

# 剔除没人引用的音效（.mp3/.ogg/.wav/.m4a/.aac）。Cocos 版脚本零引用，音频模块也裁了；
# 留着只是白占微信 20 MB 配额。返回被删掉的字节/文件数。
$script:AudioPruned = [pscustomobject]@{ Bytes = 0; Files = 0 }
# 音频 CDN 的产出统计（-Audio cdn 时由 Write-AudioCdn 填）
$script:AudioCdn = [pscustomobject]@{ Files = 0; Bytes = 0; Dir = ''; Manifest = '' }
function Remove-UnusedAudio([string]$Root) {
  if ($script:AudioMode -eq 'embed') { return }
  if (-not (Test-Path -LiteralPath $Root)) { return }
  $exts = $script:AudioExts
  $victims = @(Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $exts -contains $_.Extension.ToLowerInvariant() })
  if ($victims.Count -eq 0) { return }
  $bytes = ($victims | Measure-Object Length -Sum).Sum
  foreach ($v in $victims) { Remove-Item -LiteralPath $v.FullName -Force -ErrorAction SilentlyContinue }
  $script:AudioPruned = [pscustomobject]@{
    Bytes = $script:AudioPruned.Bytes + $bytes
    Files = $script:AudioPruned.Files + $victims.Count
  }
}

# ---------------------------------------------------------------------------
# 音频 CDN（R83）：dist\audio-cdn\ + audio-manifest.json 的生成器。
# 幂等：目录先删后建、清单不带时间戳 —— 同一份源目录永远产出同一份字节。
# ---------------------------------------------------------------------------
function ConvertTo-JsonString([string]$Text) {
  return '"' + $Text.Replace('\', '\\').Replace('"', '\"') + '"'
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

function Write-AudioCdn([string]$AudioRoot, [string]$PackageRoot, [string]$RelRoot = '') {
  $cdnDir = Join-Path $DistRoot 'audio-cdn'
  if (-not (Test-Path -LiteralPath $AudioRoot)) {
    Info "工程里没有音频目录（$AudioRoot），跳过 CDN 生成"
    return
  }
  if (-not $RelRoot) { $RelRoot = $AudioRoot }
  $files = @(Get-ChildItem -LiteralPath $AudioRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $script:AudioExts -contains $_.Extension.ToLowerInvariant() } |
    Sort-Object FullName)
  if ($files.Count -eq 0) {
    Info "音频目录里没有可上传的音频：$AudioRoot"
    return
  }

  if (Test-Path -LiteralPath $cdnDir) { Remove-Item -LiteralPath $cdnDir -Recurse -Force }
  # 相对路径从 RelRoot（= assets\bundles\res）算起 → 清单键正好是运行时的 audio/sfx/<name>
  $relBase = (Resolve-Path -LiteralPath $RelRoot).Path.TrimEnd('\') + '\'
  $items = New-Object System.Collections.Generic.List[object]
  $bytes = 0
  foreach ($f in $files) {
    if ($f.FullName.Length -le $relBase.Length) { continue }
    $rel = $f.FullName.Substring($relBase.Length).Replace('\', '/')
    $ext = $f.Extension
    $key = $rel.Substring(0, $rel.Length - $ext.Length)   # audio/sfx/hit01.mp3 → audio/sfx/hit01
    $dest = Join-Path $cdnDir $rel.Replace('/', '\')
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
    Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
    $items.Add([pscustomobject]@{ Key = $key; Rel = $rel; Bytes = $f.Length; Sha = (Get-Sha256Hex $f.FullName) }) | Out-Null
    $bytes += $f.Length
  }
  $sorted = @($items | Sort-Object Key)

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('{')
  $lines.Add('  "version": 1,')
  $lines.Add('  "bundle": ' + (ConvertTo-JsonString $ResBundle) + ',')
  $lines.Add('  "source": "assets/bundles/res/audio",')
  $lines.Add('  "count": ' + $sorted.Count + ',')
  $lines.Add('  "bytes": ' + $bytes + ',')
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
  $text = ($lines -join "`n") + "`n"

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $cdnManifest = Join-Path $cdnDir 'audio-manifest.json'
  [System.IO.File]::WriteAllText($cdnManifest, $text, $utf8)
  $pkgManifest = ''
  if (Test-Path -LiteralPath $PackageRoot) {
    $pkgManifest = Join-Path $PackageRoot 'audio-manifest.json'
    [System.IO.File]::WriteAllText($pkgManifest, $text, $utf8)
  }

  $script:AudioCdn = [pscustomobject]@{
    Files = $sorted.Count
    Bytes = $bytes
    Dir = $cdnDir
    Manifest = if ($pkgManifest) { $pkgManifest } else { $cdnManifest }
  }
  Info ("音频 {0} 档 / {1} → {2}" -f $sorted.Count, (Format-Size $bytes), $cdnDir)
}

# ---------------------------------------------------------------------------
# 音频 base 注入（-AudioBase）：只写**出包后的产物**，源工程里的
# assets\bundles\res\audio-remote.json 永远留空 —— 换 CDN 不用改源码。
#
# 为什么不能只写 subpackages\res\audio-remote.json：Cocos 把 json 资产编译进了 bundle
# （config.<hash>.json 的 paths + import\<uuid 前2>\<uuid>.<hash>.json），运行时
# AudioHost.loadAudioBase() 用 bundle.load('audio-remote', JsonAsset) 读的是编译后的那份。
# 所以 raw 副本写一份（人可核对）+ 编译资源同步改 base；两者不一致 = 运行时静音。
# ---------------------------------------------------------------------------
function Get-AudioBundleDir([string]$Out) {
  $cands = @(
    (Join-Path $Out ("subpackages\" + $ResBundle)),
    (Join-Path $Out ("assets\bundles\" + $ResBundle)),
    (Join-Path $Out ("assets\" + $ResBundle)),
    (Join-Path $Out $ResBundle)
  )
  foreach ($d in $cands) {
    if (-not (Test-Path -LiteralPath $d)) { continue }
    $cfg = @(Get-ChildItem -LiteralPath $d -Filter 'config.*.json' -File -ErrorAction SilentlyContinue)
    if ($cfg.Count -gt 0) { return $d }
  }
  return ''
}

# 把编译后 json 里的 base 改成 $Base（已去尾斜杠）。返回 Targets/Changed/Already。
function Set-CompiledAudioBase([string]$BundleDir, [string]$Base) {
  $pattern = '("audio-remote"\s*,\s*\{\s*"base"\s*:\s*)"((?:[^"\\]|\\.)*)"'
  $baseJson = $Base.Replace('\', '\\').Replace('"', '\"')

  # 精确定位：meta 里的 uuid → import\<uuid 前2>\<uuid>.<hash>.json
  $metaPath = Join-Path $Project ("assets\bundles\" + $ResBundle + "\audio-remote.json.meta")
  $uuid = ''
  if (Test-Path -LiteralPath $metaPath) {
    $mt = [System.IO.File]::ReadAllText($metaPath, [System.Text.Encoding]::UTF8)
    $mm = [regex]::Match($mt, '"uuid"\s*:\s*"([0-9a-fA-F\-]+)"')
    if ($mm.Success) { $uuid = $mm.Groups[1].Value }
  }
  $targets = New-Object System.Collections.Generic.List[string]
  if ($uuid) {
    $dir = Join-Path (Join-Path $BundleDir 'import') $uuid.Substring(0, 2)
    if (Test-Path -LiteralPath $dir) {
      foreach ($f in Get-ChildItem -LiteralPath $dir -File -Filter ($uuid + '.*.json') -ErrorAction SilentlyContinue) {
        $targets.Add($f.FullName) | Out-Null
      }
    }
  }
  # 回退：扫描 import\**\*.json（bundle 里只有这一份 json 含 "audio-remote"）
  if ($targets.Count -eq 0) {
    $importDir = Join-Path $BundleDir 'import'
    if (Test-Path -LiteralPath $importDir) {
      foreach ($f in Get-ChildItem -LiteralPath $importDir -Recurse -File -Filter '*.json' -ErrorAction SilentlyContinue) {
        if ($f.Length -gt 8MB) { continue }
        $t = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
        if ($t.Contains('"audio-remote"')) { $targets.Add($f.FullName) | Out-Null }
      }
    }
  }

  $changed = 0
  $already = 0
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  foreach ($p in $targets) {
    $text = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
    $m = [regex]::Match($text, $pattern)
    if (-not $m.Success) { continue }
    if ($m.Groups[2].Value -eq $baseJson) { $already++; continue }
    # 只替换 base 的值，其余字节（_readme 里的中文、字段顺序）原样保留
    $newText = $text.Substring(0, $m.Groups[1].Index + $m.Groups[1].Length) + '"' + $baseJson + '"' +
               $text.Substring($m.Index + $m.Length)
    [System.IO.File]::WriteAllText($p, $newText, $utf8)
    $changed++
  }
  return [pscustomobject]@{ Targets = $targets.Count; Changed = $changed; Already = $already }
}

function Write-AudioBase([string]$Out, [string]$Base) {
  $norm = $Base.Trim().TrimEnd('/')
  $bundleDir = Get-AudioBundleDir $Out
  if (-not $bundleDir) {
    Fail "找不到 res bundle 目录，无法注入 audio base：$Out"
    return
  }
  $rawPath = Join-Path $bundleDir 'audio-remote.json'
  $utf8 = New-Object System.Text.UTF8Encoding($false)

  # _readme 从源文件抄过来，不维护两份文案
  $readme = ''
  $srcPath = Join-Path $Project ("assets\bundles\" + $ResBundle + "\audio-remote.json")
  if (Test-Path -LiteralPath $srcPath) {
    $srcText = [System.IO.File]::ReadAllText($srcPath, [System.Text.Encoding]::UTF8)
    $rm = [regex]::Match($srcText, '"_readme"\s*:\s*"((?:[^"\\]|\\.)*)"')
    if ($rm.Success) { $readme = $rm.Groups[1].Value }
  }

  if (-not $norm) {
    if (Test-Path -LiteralPath $rawPath) {
      Remove-Item -LiteralPath $rawPath -Force
      Info '清理上一轮注入的包内 audio-remote.json（本次 base 为空）'
    }
    $r = Set-CompiledAudioBase $bundleDir ''
    if ($r.Targets -eq 0) {
      Fail "找不到编译后的 audio-remote 资源（bundle：$bundleDir），base 无法核对"
      return
    }
    if ($r.Changed -gt 0) { Info ("编译资源 base 归零：{0} 处（上一轮残留）" -f $r.Changed) }
    Info 'audio base = （空）→ 包内静音（不写 audio-remote.json）'
    return
  }

  $text = '{' + "`n" + '  "base": ' + (ConvertTo-JsonString $norm) + ',' + "`n" +
          '  "_readme": ' + (ConvertTo-JsonString $readme) + "`n" + '}' + "`n"
  [System.IO.File]::WriteAllText($rawPath, $text, $utf8)
  Info ("包内 audio-remote.json：{0}" -f $rawPath)

  $r = Set-CompiledAudioBase $bundleDir $norm
  if ($r.Targets -eq 0) {
    Fail "找不到编译后的 audio-remote 资源（bundle：$bundleDir）：运行时读不到 base"
    return
  }
  if ($r.Changed -gt 0) { Info ("编译资源 base 已注入：{0} 处" -f $r.Changed) }
  else { Info ("编译资源已是该 base：{0} 处（未改写）" -f $r.Already) }
  Info ("audio base = {0}" -f $norm)
}

# 复制构建产物到稳定目录（先删干净，避免上一轮的残留混进包里）
function Copy-BuildTo([string]$Source, [string]$Target) {
  if (-not (Test-Path -LiteralPath $Source)) { throw "构建产物不存在：$Source" }
  if (Test-Path -LiteralPath $Target) {
    try {
      Remove-Item -LiteralPath $Target -Recurse -Force
    } catch {
      Write-Host "  ! 无法删除 $Target（$($_.Exception.Message)），改为清空内容" -ForegroundColor Yellow
      foreach ($child in Get-ChildItem -LiteralPath $Target -Force) {
        Remove-Item -LiteralPath $child.FullName -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Target -Recurse -Force
}

# ---------------------------------------------------------------------------
# 0) 前置检查
# ---------------------------------------------------------------------------
$sw = [Diagnostics.Stopwatch]::StartNew()
Write-Host "三国群英传 2 · 一键出包" -ForegroundColor Magenta
Write-Host ("  Mode   : {0}" -f $Mode)
Write-Host ("  音频   : {0}" -f $script:AudioMode)
Write-Host ("  AppId  : {0}" -f $AppId)
Write-Host ("  工程   : {0}" -f $Project)
Write-Host ("  产物根 : {0}" -f $OutDir)
if ($Mode -eq 'remote') { Write-Host ("  CDN    : {0}" -f $Server) }
if ($script:AudioBaseUrl) {
  Write-Host ("  audio base : {0}" -f $script:AudioBaseUrl)
} else {
  Write-Host '  audio base : （空 → 包内静音）'
}

if (-not (Test-Path -LiteralPath $CreatorExe)) { throw "找不到 CocosCreator.exe：$CreatorExe" }
if (-not (Test-Path -LiteralPath (Join-Path $Project 'assets'))) { throw "工程目录不对（没有 assets）：$Project" }
if ($AppId -notmatch '^wx[0-9a-fA-F]{16}$') {
  # 允许非 wx 前缀的自测号，但必须提示：微信只认 wx + 16 位十六进制
  Write-Host "  ⚠ AppId 形如 $AppId 不是标准的 wx + 16 位十六进制，上传会失败" -ForegroundColor Yellow
}

# Electron 退化：这个变量只要存在，Creator 就不认 --project
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$LogDir = Join-Path $Tools 'build-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ---------------------------------------------------------------------------
# 1) 构建（ExitCode 不可信：只看日志 Finished + 产物存在）
# ---------------------------------------------------------------------------
function Invoke-CocosBuild {
  param([string]$Platform)

  $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
  $log = Join-Path $LogDir ("{0}_{1}.log" -f $Platform, $stamp)
  $errLog = "$log.err"
  $arg = "platform=$Platform;debug=false;md5Cache=true;buildPath=$OutDir;startScene=$StartScene"
  if ($Platform -eq 'wechatgame' -and $Mode -eq 'remote') { $arg += ";server=$Server" }

  Step ("构建 {0}" -f $Platform)
  Info "参数：$arg"
  Info "日志：$log"

  $proc = Start-Process -FilePath $CreatorExe `
    -ArgumentList @('--project', $Project, '--build', $arg) `
    -PassThru -RedirectStandardOutput $log -RedirectStandardError $errLog
  $proc.WaitForExit(900000) | Out-Null
  if (-not $proc.HasExited) { throw "构建超时（>15 分钟）：$Platform，看日志 $log" }

  $text = if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Raw -Encoding UTF8 } else { '' }
  $finished = $text -match ("build Task \(" + [regex]::Escape($Platform) + "\) Finished")

  $product = Join-Path $OutDir $Platform
  $marker = if ($Platform -eq 'wechatgame') { 'game.json' } else { 'index.html' }
  $hasProduct = Test-Path -LiteralPath (Join-Path $product $marker)

  if (-not $finished -or -not $hasProduct) {
    Write-Host ("  ✗ {0} 构建失败（日志 Finished={1}，产物 {2}={3}，exit={4}）" -f `
      $Platform, $finished, $marker, $hasProduct, $proc.ExitCode) -ForegroundColor Red
    if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 30 }
    if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Tail 10 }
    throw "构建失败：$Platform（详见 $log）"
  }
  Write-Host ("  ✓ {0} 构建完成（exit={1} 不可信，以日志 Finished 为准）" -f $Platform, $proc.ExitCode) -ForegroundColor Green
  return $product
}

$wechatBuild = Invoke-CocosBuild -Platform 'wechatgame'
$webBuild = $null
if (-not $SkipWeb) {
  $webBuild = Invoke-CocosBuild -Platform 'web-mobile'
} else {
  $webBuild = Join-Path $OutDir 'web-mobile'
  Info '跳过 web-mobile 构建（-SkipWeb）'
}

# ---------------------------------------------------------------------------
# 2) 按 Mode 处理资源 → 稳定产物目录
# ---------------------------------------------------------------------------
Step ("处理资源（Mode = {0}）" -f $Mode)
$out = switch ($Mode) {
  'preview' { Join-Path $DistRoot 'wechat-preview' }
  'upload' { Join-Path $DistRoot 'wechat-upload' }
  'remote' { Join-Path $DistRoot 'wechat-remote' }
}

$packSubpackage = Join-Path $Tools 'pack_subpackage.mjs'
$packRemote = Join-Path $Tools 'pack_remote.mjs'

if ($Mode -eq 'preview') {
  Copy-BuildTo -Source $wechatBuild -Target $out
  Info "资源内嵌：assets/$ResBundle 保留在包内（主包会 > 4 MB，仅用于扫码预览）"
} elseif ($Mode -eq 'upload') {
  if (-not (Test-Path -LiteralPath $packSubpackage)) { throw "找不到分包脚本：$packSubpackage" }
  node $packSubpackage $wechatBuild $out $ResBundle
  if ($LASTEXITCODE -ne 0) { throw "pack_subpackage.mjs 失败（exit=$LASTEXITCODE）" }
} else {
  if (-not (Test-Path -LiteralPath $packRemote)) { throw "找不到远程化脚本：$packRemote" }
  Copy-BuildTo -Source $wechatBuild -Target $out
  node $packRemote $out $Server $ResBundle
  if ($LASTEXITCODE -ne 0) { throw "pack_remote.mjs 失败（exit=$LASTEXITCODE）" }
  # pack_remote 把 CDN 负载放在 <out>-remote\remote\<bundle>，收拢成固定的 dist\cdn
  $cdnTemp = "$out-remote"
  if (Test-Path -LiteralPath $cdnTemp) {
    $cdn = Join-Path $DistRoot 'cdn'
    if (Test-Path -LiteralPath $cdn) { Remove-Item -LiteralPath $cdn -Recurse -Force -ErrorAction SilentlyContinue }
    Move-Item -LiteralPath $cdnTemp -Destination $cdn
    Info "CDN 负载：$cdn（把整个 remote\ 上传到 <server> 根）"
  }
}

# ---------------------------------------------------------------------------
# 2.5) 剔除音频（先把包做小，再体检）：cdn/none 都删，embed 保留
# ---------------------------------------------------------------------------
if ($script:AudioMode -eq 'embed') {
  # R204：BGM 转 56 kbps + SFX 原样，109 档约 11.56 MB，靠 30 MB 总配额打进 res 分包；
  # 音频与清单由 tools\pack_audio_local.ps1 生成在 assets\bundles\res\audio + audio-manifest.json。
  $pkgAudio = @(Get-ChildItem -LiteralPath $out -Recurse -File -Filter '*.mp3' -ErrorAction SilentlyContinue)
  $pkgAudioBytes = ($pkgAudio | Measure-Object -Property Length -Sum).Sum
  if ($null -eq $pkgAudioBytes) { $pkgAudioBytes = 0 }
  Info ("本地音频已打入：{0} 档 / {1}（-Audio embed，BGM stereo 56k / mono 48k、SFX 原样，总计上限 30 MB）" -f $pkgAudio.Count, (Format-Size $pkgAudioBytes))
  if ($pkgAudio.Count -eq 0) {
    Fail '按 -Audio embed 出包但包里 0 个 mp3：先跑 tools\pack_audio_local.ps1'
  }
} else {
  Remove-UnusedAudio $out
  if ($Mode -eq 'remote') { Remove-UnusedAudio (Join-Path (Join-Path $DistRoot 'cdn') 'remote') }
  if ($script:AudioPruned.Files -gt 0) {
    Info ("剔除音频 {0} / {1} 个文件（-Audio embed 可保留）" -f (Format-Size $script:AudioPruned.Bytes), $script:AudioPruned.Files)
  }
}

# ---------------------------------------------------------------------------
# 2.6) 音频 CDN：清单 + 可直接上传的目录（-Audio cdn）
#      清单同时写进包根与 dist\audio-cdn\：前者给构建期核对，后者是 CDN 上的那份
# ---------------------------------------------------------------------------
if ($script:AudioMode -eq 'cdn') {
  Step '音频 CDN'
  Write-AudioCdn -AudioRoot (Join-Path $Project 'assets\bundles\res\audio') -RelRoot (Join-Path $Project 'assets\bundles\res') -PackageRoot $out
  if ($script:AudioCdn.Files -gt 0) {
    Info ("清单：{0}" -f $script:AudioCdn.Manifest)
    Info ("CDN 目录：{0}（保持 audio\sfx、audio\bgm 结构，整目录上传）" -f $script:AudioCdn.Dir)
  }
}

# ---------------------------------------------------------------------------
# 2.7) 注入音频 CDN 根（-AudioBase）：只改出包产物，源 json 的 base 永远留空
# ---------------------------------------------------------------------------
if ($script:AudioMode -eq 'cdn' -and $Mode -ne 'remote') {
  Step '音频 base'
  Write-AudioBase -Out $out -Base $script:AudioBaseUrl
} elseif ($script:AudioMode -eq 'cdn') {
  Info 'remote 模式：res 整体走 CDN，无法注入音频 base（源文件 base 为空 → 运行时静音）'
}

# ---------------------------------------------------------------------------
# 3) 注入 AppID（唯一可靠注入点：构建后覆写 + 回读校验）
# ---------------------------------------------------------------------------
Step '注入 AppID'
$pkg = Join-Path $out 'project.config.json'
if (-not (Test-Path -LiteralPath $pkg)) { throw "产物缺少 project.config.json：$out" }
$raw = [System.IO.File]::ReadAllText($pkg, [System.Text.Encoding]::UTF8)
$raw = [regex]::Replace($raw, '"appid"\s*:\s*"[^"]*"', '"appid":"' + $AppId + '"')
[System.IO.File]::WriteAllText($pkg, $raw, (New-Object System.Text.UTF8Encoding($false)))
$cfg = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
if ($cfg.appid -ne $AppId) { throw "AppID 覆写失败（产物里是 $($cfg.appid)）" }
Info "project.config.json → appid=$($cfg.appid) compileType=$($cfg.compileType)"
if ($cfg.compileType -ne 'game') {
  Write-Host "  ⚠ compileType 不是 game（$($cfg.compileType)）：导入时必须手动选「小游戏」" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 3.5) 资源瘦身（-Slim）：png → webp
#      R305：微信单包 20 MB（CLI 用 MiB 计数，见 work\cli_upload_020.log 里
#      19,030,717 B 显示为 '18.1 MB'），而包里 png 占 7.5 MB、mp3 6 MB 不许删、
#      已有 1210 张 webp 又都是 q85-86 的有损（重编码只会变大）→ 唯一能瘦的就是 png。
#      做法：同 uuid 换扩展名写 .webp + 把 import json 里的 "fmt":"0" 改成 "fmt":"4"；
#      引擎按 fmt 索引 extnames 取扩展名，所以不需要动 config/paths/uuids。
#      只替换「体积降幅 ≥10% 且可见像素平均误差 ≤6/255」的文件，其余原样保留。
# ---------------------------------------------------------------------------
if ($Slim) {
  Step '资源瘦身（png → webp）'
  $slimPy = Join-Path $PSScriptRoot 'slim_png.py'
  if (-not (Test-Path -LiteralPath $slimPy)) { Fail "找不到 $slimPy" }

  $py = $Python
  if (-not $py) {
    $cands = @(
      'C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe',
      (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe')
    )
    foreach ($c in $cands) {
      if (-not $py -and (Test-Path -LiteralPath $c)) { $py = $c }
    }
    if (-not $py) {
      $cmd = Get-Command python -ErrorAction SilentlyContinue
      if ($cmd) { $py = $cmd.Source }
    }
  }
  if (-not $py) { Fail '-Slim 需要带 Pillow 的 python：用 -Python 指定解释器' }

  # 两种包布局都试：upload = subpackages\<bundle>\native，preview/remote = assets\<bundle>\native
  $slimRoots = @(
    (Join-Path $out "subpackages\$ResBundle\native"),
    (Join-Path $out "assets\$ResBundle\native")
  ) | Where-Object { Test-Path -LiteralPath $_ }
  if ($slimRoots.Count -eq 0) { Fail "找不到 native 目录（试过 subpackages\$ResBundle\native 与 assets\$ResBundle\native）" }

  $slimLogDir = Join-Path $Tools 'build-logs'
  if (-not (Test-Path -LiteralPath $slimLogDir)) { New-Item -ItemType Directory -Path $slimLogDir -Force | Out-Null }
  $slimReport = Join-Path $slimLogDir ("slim_{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

  # 注意：不要写成 `Get-DirStat -Path $slimRoots[0]`——参数模式下 `[0]` 不会被当成索引，
  # 第一次跑就吃了一次「瘦身前 0 KB / 瘦身后 0 KB」的假告警。先落到标量再算。
  $slimRoot = @($slimRoots)[0]

  function Get-SlimStat([string]$Root) {
    $all = @(Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue)
    $bytes = 0L; $pngBytes = 0L; $png = 0; $webp = 0
    foreach ($f in $all) {
      $bytes += $f.Length
      if ($f.Extension -eq '.png') { $png++; $pngBytes += $f.Length }
      elseif ($f.Extension -eq '.webp') { $webp++ }
    }
    [pscustomobject]@{ Bytes = $bytes; Files = $all.Count; Png = $png; PngBytes = $pngBytes; Webp = $webp }
  }

  $beforeStat = Get-SlimStat $slimRoot
  Info ("瘦身前：{0} / {1} 文件，png {2} 张 / {3}" -f (Format-Size $beforeStat.Bytes), $beforeStat.Files, $beforeStat.Png, (Format-Size $beforeStat.PngBytes))

  $slimArgs = @($slimPy) + @($slimRoots) + @(
    '--mode', 'webp', '--min-bytes', "$SlimMinBytes", '--min-gain', '0.10',
    '--webp-quality', "$SlimQuality", '--webp-max-rgb-diff', '6.0',
    '--report', $slimReport, '--jobs', '8'
  )
  & $py @slimArgs
  if ($LASTEXITCODE -ne 0) { Fail "slim_png.py 失败（exit=$LASTEXITCODE），报告：$slimReport" }

  $afterStat = Get-SlimStat $slimRoot
  $saved = [long]$beforeStat.Bytes - [long]$afterStat.Bytes
  $script:SlimSaved = $saved
  Info ("瘦身后：{0} / {1} 文件，png {2} 张 / {3}，webp {4} 张" -f (Format-Size $afterStat.Bytes), $afterStat.Files, $afterStat.Png, (Format-Size $afterStat.PngBytes), $afterStat.Webp)
  Info ("省 {0}（{1:N1}%），报告：{2}" -f (Format-Size $saved), (100.0 * $saved / [Math]::Max(1, $beforeStat.Bytes)), $slimReport)
  if ($saved -le 0) { Fail '瘦身没有省下任何字节：先看报告，别把没瘦的包发上去' }
}

# ---------------------------------------------------------------------------
# 4) 校验：主包体积 / game.json 无 BOM / 分包根有 game.js
# ---------------------------------------------------------------------------
Step '校验'

$subRel = "subpackages\$ResBundle"
$excludeForMain = if ($Mode -eq 'upload') { @('subpackages\') } else { @() }
$main = Get-DirStat -Path $out -ExcludeRel $excludeForMain
$sub = if ($Mode -eq 'upload') { Get-DirStat -Path (Join-Path $out $subRel) } else { [pscustomobject]@{ Bytes = 0; Files = 0 } }
$cdn = if ($Mode -eq 'remote') { Get-DirStat -Path (Join-Path (Join-Path $DistRoot 'cdn') 'remote') } else { [pscustomobject]@{ Bytes = 0; Files = 0 } }
$total = $main.Bytes + $sub.Bytes + $cdn.Bytes
$limit = 4MB

if ($Mode -eq 'preview') {
  if ($main.Bytes -gt $limit) {
    Write-Host ("  ! 主包 {0} > 4 MB：preview 模式下属正常（资源内嵌），但**不能上传**" -f (Format-Size $main.Bytes)) -ForegroundColor Yellow
  }
} elseif ($main.Bytes -gt $limit) {
  Fail ("主包 {0} 超过 4 MB 上限，不能上传（超出 {1}）" -f (Format-Size $main.Bytes), (Format-Size ($main.Bytes - $limit)))
} else {
  Write-Host ("  ✓ 主包 {0} < 4 MB" -f (Format-Size $main.Bytes)) -ForegroundColor Green
}

# R204：-Audio embed 把 109 档音频打进分包，微信小游戏总配额是 30 MB；
# CDN/none 模式音频不在包里，仍按旧的 20 MB 预算卡（防止悄悄膨胀）。
$totalLimit = if ($script:AudioMode -eq 'embed') { 30MB } else { 20MB }
$totalLimitMb = [int]($totalLimit / 1MB)
if ($total -gt $totalLimit) {
  Fail ("整体 {0} 超过微信 {1} MB 上限（超出 {2}）" -f (Format-Size $total), $totalLimitMb, (Format-Size ($total - $totalLimit)))
} else {
  Write-Host ("  ✓ 整体 {0} < {1} MB（余量 {2}）" -f (Format-Size $total), $totalLimitMb, (Format-Size ($totalLimit - $total))) -ForegroundColor Green
}

# 4b) 资产包自洽检验（config → uuids → versions.native → native/import 四段对齐）
# 由 work\map_ide\verify_pkg.js 提供：抓「文件在磁盘上却读不到」这类错配（曾在旧包里踩过）。
if ($Mode -eq 'upload') {
  $verifyPkg = Join-Path $Tools 'map_ide\verify_pkg.js'
  if (Test-Path -LiteralPath $verifyPkg) {
    & node $verifyPkg $out
    if ($LASTEXITCODE -ne 0) {
      Fail "资产包自洽检验未通过（verify_pkg.js exit=$LASTEXITCODE），不要上传这个包"
    } else {
      Write-Host "  ✓ 资产包自洽检验通过（config/native/import 四段对齐）" -ForegroundColor Green
    }
  } else {
    Write-Host "  ! 未找到 work\map_ide\verify_pkg.js，跳过资产包自洽检验" -ForegroundColor Yellow
  }
}

# 4c) 音频自检：CDN 包查清单/代码点名/包内 base/远端 HEAD；本地包（-Audio embed）查
# 包内 109 档 native 落盘 + 编译清单 + 空 base。由 tools\check_audio_cdn.mjs 提供。
# CDN 远端失败在构建期非阻塞（CDN 通常是出包后才传），但会打印 [warn] 与发布前必须复跑的
# 完整命令；本地项失败一律 build 失败。
if ($script:AudioMode -in @('cdn', 'embed')) {
  $checkJs = Join-Path $PSScriptRoot 'check_audio_cdn.mjs'
  if (-not (Test-Path -LiteralPath $checkJs)) {
    Fail "找不到 tools\check_audio_cdn.mjs（音频自检缺失，不能跳过）"
  } else {
    $checkArgs = @($checkJs)
    # remote 模式包里没有本地 res bundle（--pkg 的 base 注入段不适用）
    if ($Mode -ne 'remote') { $checkArgs += @('--pkg', $out) }
    if ($script:AudioMode -eq 'cdn' -and $script:AudioBaseUrl) { $checkArgs += @('--base', $script:AudioBaseUrl) }
    if ($script:AudioMode -eq 'cdn') { $checkArgs += '--allow-remote-fail' }
    & node @checkArgs
    if ($LASTEXITCODE -ne 0) {
      Fail "音频自检未通过（check_audio_cdn.mjs exit=$LASTEXITCODE），不要上传这个包"
    }
  }
}


# game.json：必须存在（小游戏入口）、必须无 BOM、首字节 0x7B
$gameJson = Join-Path $out 'game.json'
if (-not (Test-Path -LiteralPath $gameJson)) {
  Fail "缺少 game.json（导入目录必须选到含 game.json 的这一层）"
} else {
  $bytes = [System.IO.File]::ReadAllBytes($gameJson)
  $first = if ($bytes.Length -gt 0) { $bytes[0] } else { 0 }
  if ($first -ne 0x7B) {
    Fail ("game.json 首字节是 0x{0:X2}（期望 0x7B '{'）：带 BOM 时微信 IDE 会报 JSON 解析错误" -f $first)
  } else {
    Write-Host ("  ✓ game.json 首字节 0x{0:X2}（无 BOM）" -f $first) -ForegroundColor Green
  }
  $gameCfg = Get-Content -LiteralPath $gameJson -Raw -Encoding UTF8 | ConvertFrom-Json
  $declared = @()
  if ($gameCfg.PSObject.Properties.Name -contains 'subpackages' -and $gameCfg.subpackages) {
    $declared = @($gameCfg.subpackages | ForEach-Object { $_.root })
  }
  if ($Mode -eq 'upload') {
    if ($declared -notcontains "subpackages/$ResBundle/") {
      Fail ("game.json 没声明分包 subpackages/$ResBundle/（实际：$($declared -join ', ')）")
    } else {
      Write-Host "  ✓ game.json 已声明分包 subpackages/$ResBundle/" -ForegroundColor Green
    }
  } elseif ($declared.Count -gt 0) {
    Info ("game.json 里还有 subpackages 声明：$($declared -join ', ')")
  }
}

if ($Mode -eq 'upload') {
  $subGameJs = Join-Path $out (Join-Path $subRel 'game.js')
  if (-not (Test-Path -LiteralPath $subGameJs)) {
    Fail "缺少 $subRel\game.js（微信要求每个分包根目录有入口文件）"
  } else {
    Write-Host "  ✓ $subRel\game.js 存在" -ForegroundColor Green
  }
  $subRes = Join-Path $out $subRel
  $n = if (Test-Path -LiteralPath $subRes) { (Get-ChildItem -LiteralPath $subRes -Recurse -File | Measure-Object).Count } else { 0 }
  if ($n -lt 10) { Fail ("$subRel 里只有 $n 个文件，资源没搬进去") }
}

if ($Mode -eq 'remote') {
  $settings = Get-ChildItem -LiteralPath (Join-Path $out 'src') -Filter 'settings*.json' -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $settings) {
    Fail 'src 下没有 settings*.json，远程 bundle 配置没写进去'
  } else {
    $s = Get-Content -LiteralPath $settings.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($s.assets.server -ne $Server) { Fail ("settings.assets.server = $($s.assets.server)（期望 $Server）") }
    elseif (@($s.assets.remoteBundles) -notcontains $ResBundle) { Fail "settings.assets.remoteBundles 里没有 $ResBundle" }
    else { Write-Host "  ✓ settings: server=$($s.assets.server) remoteBundles=$(@($s.assets.remoteBundles) -join ',')" -ForegroundColor Green }
  }
  if ($cdn.Files -eq 0) { Fail "dist\cdn\remote 是空的：CDN 负载没生成" }
}

# 音频 CDN：cdn 模式必须有清单，且任何非 embed 模式下包里都不许残留音频
if ($script:AudioMode -eq 'cdn') {
  if ($script:AudioCdn.Files -eq 0) {
    Fail '音频 CDN 目录没生成（dist\audio-cdn 为空）'
  } elseif (-not (Test-Path -LiteralPath (Join-Path $out 'audio-manifest.json'))) {
    Fail '包里没有 audio-manifest.json（-Audio cdn 的清单没写进去）'
  } else {
    Write-Host ("  ✓ 音频清单 {0} 档 / {1}（dist\audio-cdn）" -f $script:AudioCdn.Files, (Format-Size $script:AudioCdn.Bytes)) -ForegroundColor Green
  }
}
if ($script:AudioMode -ne 'embed') {
  $left = @(Get-ChildItem -LiteralPath $out -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $script:AudioExts -contains $_.Extension.ToLowerInvariant() })
  if ($left.Count -gt 0) {
    Fail ("包里还残留 $($left.Count) 个音频文件：剔除没生效")
  } else {
    Write-Host '  ✓ 包内无音频文件（全部交给 CDN）' -ForegroundColor Green
  }
}

# ---------------------------------------------------------------------------
# 5) 体积表 + 产物路径 + 下一步
# ---------------------------------------------------------------------------
$sw.Stop()
Step '体积表'
Write-Host ('  ' + (Pad-Display '项目' 26) + (Pad-DisplayLeft '体积' 12) + (Pad-DisplayLeft '文件数' 10) + '  说明') -ForegroundColor DarkGray
Write-Host ('  ' + ('-' * 62)) -ForegroundColor DarkGray
Write-Row '主包（扣除分包/CDN）' $main.Bytes $main.Files
if ($Mode -eq 'upload') { Write-Row "subpackages\$ResBundle" $sub.Bytes $sub.Files '微信分包' }
if ($script:AudioMode -eq 'embed' -and $pkgAudio.Count -gt 0) {
  Write-Row '  其中包内音频' $pkgAudioBytes $pkgAudio.Count '打进 res 分包，离线可播'
}
if ($Mode -eq 'remote') { Write-Row 'CDN 远程资源（remote\）' $cdn.Bytes $cdn.Files '需上传 CDN' }
Write-Row '合计' $total ($main.Files + $sub.Files + $cdn.Files)
if ($script:AudioCdn.Files -gt 0) {
  Write-Row '音频 CDN（不在包内）' $script:AudioCdn.Bytes $script:AudioCdn.Files '上传到 dist\audio-cdn，不占配额'
} elseif ($script:AudioPruned.Files -gt 0) {
  Write-Row '（已剔除音效）' $script:AudioPruned.Bytes $script:AudioPruned.Files '不占配额（没生成 CDN 目录）'
}
Write-Host ('  ' + ('-' * 62)) -ForegroundColor DarkGray
$limitText = if ($script:AudioMode -eq 'embed') { '主包 ≤ 4 MB，总计 ≤ 30 MB（-Audio embed 含包内音频）' } else { '主包 ≤ 4 MB，总计 ≤ 20 MB' }
Write-Host ("  限额：{0}。耗时 {1:N0}s" -f $limitText, $sw.Elapsed.TotalSeconds)

Step '产物'
Write-Host "  小游戏包 : $out"
if ($webBuild -and (Test-Path -LiteralPath $webBuild)) { Write-Host "  web 版   : $webBuild" }
if ($Mode -eq 'remote') { Write-Host ("  CDN 负载 : " + (Join-Path $DistRoot 'cdn') + "\remote\") }
if ($script:AudioCdn.Files -gt 0) { Write-Host "  音频 CDN : $($script:AudioCdn.Dir)" }
Write-Host ("  audio base = {0}" -f $(if ($script:AudioBaseUrl) { $script:AudioBaseUrl } else { '（空 → 包内静音）' }))
Write-Host "  构建日志 : $LogDir"

Step '下一步'
switch ($Mode) {
  'preview' {
    Write-Host '  1. 微信开发者工具 → 导入项目 → 目录选上面「小游戏包」（含 game.json 的那一层）'
    Write-Host '  2. 项目类型选「小游戏」（不是小程序）→ 点「预览」扫码'
    Write-Host '  3. 这一包资源内嵌，主包 > 4 MB 属正常；**不要点上传**（会被拒）'
  }
  'upload' {
    Write-Host '  1. 微信开发者工具 → 导入项目 → 目录选上面「小游戏包」→ 类型「小游戏」'
    Write-Host '  2. 直接点「上传」：主包 < 4 MB，资源在 subpackages/res/ 随包上传'
    Write-Host '  3. 若 IDE 缓存了旧包布局，先关掉 IDE 再重开（或杀掉占 46032 端口的进程）'
  }
  'remote' {
    Write-Host ("  1. 把 dist\cdn\remote\ 整个传到 CDN 根，使 {0}remote/res/… 可访问（注意 remote/ 前缀）" -f $Server)
    Write-Host '  2. 微信开发者工具 → 导入「小游戏包」→ 类型「小游戏」→ 上传'
    Write-Host '  3. 首包只剩引擎+代码；资源全走 CDN，抓包应看到 <server>remote/res/ 请求'
  }
}

if ($script:AudioMode -eq 'cdn' -and $script:AudioCdn.Files -gt 0) {
  Write-Host ''
  Write-Host '  → 把这些文件传到 CDN，改 remoteBase（assets\bundles\res\audio-remote.json 的 base）即可' -ForegroundColor Yellow
  Write-Host '  音频（CDN）四步：' -ForegroundColor Yellow
  Write-Host ("    1. 上传：powershell -File tools\publish_audio_cdn.ps1 -Target <已挂载的 CDN 目录>（或手动把 {0} 里的 audio\ 与 audio-manifest.json 传到 CDN 根）" -f $script:AudioCdn.Dir)
  Write-Host '    2. 填地址：出包时加 -AudioBase https://…/audio-cdn（推荐；源文件 audio-remote.json 保持空，别手改）'
  Write-Host '    3. 重新出包：再跑一遍本脚本（base 是运行时读包内 json，改完必须重新构建才生效）'
  Write-Host '    4. 验证：tools\publish_audio_cdn.ps1 -Verify https://…/audio-cdn；细节见 project\142_音频CDN上线.md'
  Write-Host '    注：不填 base / 不传 CDN = 静音，但绝不会崩（AudioHost 缺档只记账：不抛异常、不卡战斗）'
}

if ($Open) { Start-Process explorer.exe $out }

if ($script:Failures.Count -gt 0) {
  Write-Host "`n❌ 校验未通过（$($script:Failures.Count) 项）：" -ForegroundColor Red
  foreach ($f in $script:Failures) { Write-Host "   - $f" -ForegroundColor Red }
  exit 1
}
Write-Host "`n✅ 出包成功：$out" -ForegroundColor Green
exit 0
