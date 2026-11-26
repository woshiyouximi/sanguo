# R103 编成页调色板守卫（可复跑）
#
# 口径（与 project/195 一致）：750×1334、NEAREST、只数「出现 ≥8 次」的 RGB 值。
# 验收线：≥ 3631（project/195 实测 4241；3143/3134 是回退前的旧值）。
#
# 用法：
#   pwsh -NoProfile -File F:\sanguo\work\palette_guard\palette_guard.ps1
#   pwsh -NoProfile -File F:\sanguo\work\palette_guard\palette_guard.ps1 -Reuse    # 复用已有截图，不起浏览器
#
# 依赖：work\cocos_render3\cstat.py、work\cocos_verify\cdpweb.mjs、5299 静态服务（站点根 F:\sanguo\game）
# 收尾：无论成功失败都会 close + reap，不留验证浏览器。

[CmdletBinding()]
param(
    [int] $Threshold = 3631,
    [switch] $Reuse,
    [string] $PageUrl = 'http://127.0.0.1:5299/cocos-build/web-mobile/index.html',
    [int] $Port = 9333,
    [string] $Profile = 'F:\sanguo\work\.edgeprof_hud2'
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Root   = 'F:\sanguo'
$OutDir = Join-Path $Root 'work\palette_guard'
$Png    = Join-Path $OutDir 'deploy_750.png'
$Python = 'C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'
$Cstat  = Join-Path $Root 'work\cocos_render3\cstat.py'
$Cdp    = Join-Path $Root 'work\cocos_verify\cdpweb.mjs'
$Steps  = Join-Path $OutDir 'steps_palette.mjs'

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

function Reap {
    try { & node $Cdp close *> $null } catch { }
    try { & node (Join-Path $Root 'work\cocos_verify\reap.mjs') --kill --match=(Split-Path $Profile -Leaf) *> $null } catch { }
}

if (-not $Reuse) {
    if (Test-Path $Png) { Remove-Item $Png -Force }
    $env:OUTDIR   = $OutDir
    $env:PAGE_URL = $PageUrl
    $env:MATCH    = ([Uri]$PageUrl).Port.ToString()  # MATCH 是「页面 URL 里要包含的子串」，用端口比用监听的 9333 稳
    $env:PORT     = "$Port"
    $env:PROFILE  = $Profile

    # 5299 服务没起就直接报错（别让它默默失败成“截图不存在”）
    try {
        $r = Invoke-WebRequest -Uri $PageUrl -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode)" }
    } catch {
        throw "静态服务不可达：$PageUrl（先 cd F:\sanguo\game; node web/serve.mjs 5299）"
    }

    & node $Cdp launch *> (Join-Path $OutDir 'launch.log')
    if ($LASTEXITCODE -ne 0) { Reap; throw 'cdpweb launch 失败，见 launch.log' }
    try {
        & node $Cdp run $Steps *> (Join-Path $OutDir 'run.log')
        if ($LASTEXITCODE -ne 0) { throw 'cdpweb run 失败，见 run.log' }
    } finally {
        Reap
    }
}

if (-not (Test-Path $Png)) { throw "没有截图：$Png" }

# cstat.py 输出里的 d2（半分辨率 ≥8 次）即 project/195 的口径
$census = & $Python $Cstat $Png 2>&1 | Out-String
$line = ($census -split "`n" | Where-Object { $_ -match 'd2' } | Select-Object -First 3) -join "`n"
Write-Host $census.Trim()

$m = [regex]::Match($census, 'd2[^\d]*?(\d+)')
if (-not $m.Success) { throw "解析不了 cstat.py 的 d2 数字：`n$census" }
$count = [int] $m.Groups[1].Value

Write-Host ''
Write-Host ("  编成页色数（750×1334 半分辨率、≥8 次）: {0}" -f $count)
Write-Host ("  验收线                              : ≥ {0}" -f $Threshold)
if ($count -ge $Threshold) {
    Write-Host '  RESULT: PASS' -ForegroundColor Green
    exit 0
}
Write-Host '  RESULT: FAIL（色数掉了，先看 project/195 的 gridWeave/gridShade 是否被改坏）' -ForegroundColor Red
exit 1
