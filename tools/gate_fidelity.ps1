# 打包前「和原作对比」门禁 —— 一条命令跑完，逐关打印 PASS/FAIL。
#
# 用法：
#   pwsh -NoProfile -File tools\gate_fidelity.ps1                 # 全跑（含 cocos 断言，需要 CDP 页面）
#   pwsh -NoProfile -File tools\gate_fidelity.ps1 -SkipCocos      # 跳 cocos 断言（CI 无浏览器时）
#   pwsh -NoProfile -File tools\gate_fidelity.ps1 -SkipTests      # 只想快速看数据/保真/对拍
#
# 判据与差异登记见 project\165_打包前原作对比门禁.md。
# 任何 FAIL 都会让脚本以非 0 退出；SKIP 不算失败，但会在汇总里点名。

param(
    [switch]$SkipCocos,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$log  = Join-Path $root 'work\gate_fidelity.log'
$res  = @()
$sw   = [System.Diagnostics.Stopwatch]::StartNew()

function Say($m) { Write-Host $m; Add-Content -Path $log -Value $m -Encoding utf8 }

function Run-Step {
    param([string]$Name, [string]$WorkDir, [string]$Exe, [string[]]$ArgList, [string]$Needle, [switch]$ExpectNonZero, [switch]$IgnoreExit)
    Say ("---- " + $Name)
    $out = & $Exe @ArgList 2>&1 | Out-String
    $code = $LASTEXITCODE
    $tail = ($out -split "`r?`n" | Where-Object { $_.Trim() -ne '' } | Select-Object -Last 3) -join ' | '
    $ok = $true
    if ($IgnoreExit) { $ok = $true } elseif ($ExpectNonZero) { $ok = ($code -ne 0) } else { $ok = ($code -eq 0) }
    if ($Needle) { $ok = $ok -and ($out -match [regex]::Escape($Needle)) }
    $status = 'FAIL'
    if ($ok) { $status = 'PASS' }
    $script:res += [pscustomobject]@{ Step = $Name; Status = $status; Code = $code; Tail = $tail }
    if (-not $ok) { Say ("     FAIL (exit=$code) :: " + $tail) }
    return $out
}

function Skip-Step($Name, $Why) {
    Say ("---- " + $Name + " :: SKIP (" + $Why + ")")
    $script:res += [pscustomobject]@{ Step = $Name; Status = 'SKIP'; Code = ''; Tail = $Why }
}

Say ("== 打包前门禁 " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " ==")
Say ("repo: " + $root)

# ---- G1 数据逐字段一致（k2 交付的审计入口）
$audit = Join-Path $root 'work\data_audit\run_all.mjs'
if (Test-Path $audit) {
    Push-Location $root
    Run-Step 'G1 数据逐字段一致' $root 'node' @($audit) '差异 0' | Out-Null
    Pop-Location
} else {
    Skip-Step 'G1 数据逐字段一致' 'work\data_audit\run_all.mjs 还没落地（k2-data-audit 交付后接入）'
}

# ---- G2 保真网
Push-Location $root
Run-Step 'G2 保真网 fidelity' $root 'node' @('work\fidelity\check.mjs') 'FAIL 0' | Out-Null
Pop-Location

# ---- G3 两端数值对拍
Push-Location $root
Run-Step 'G3 两端数值对拍' $root 'node' @('work\parity_num\run_all.mjs') '退出码 0' | Out-Null
Pop-Location

if (-not $SkipTests) {
    # ---- G4 web 全量测试
    Push-Location (Join-Path $root 'game')
    $t = Run-Step 'G4 web 全量测试' (Join-Path $root 'game') 'node' @('--test', 'tests/*.test.ts') $null
    if ($t -notmatch 'ℹ fail 0') { $res[-1].Status = 'FAIL' }
    Pop-Location

    # ---- G5/G6 类型
    Push-Location (Join-Path $root 'game')
    Run-Step 'G5 tsc --noEmit' (Join-Path $root 'game') 'npm.cmd' @('exec', '--', 'tsc', '--noEmit') $null | Out-Null
    Run-Step 'G6 tsc build' (Join-Path $root 'game') 'npm.cmd' @('exec', '--', 'tsc', '-p', 'tsconfig.build.json') $null | Out-Null
    Pop-Location
} else {
    Skip-Step 'G4 web 全量测试' '-SkipTests'
    Skip-Step 'G5 tsc --noEmit' '-SkipTests'
    Skip-Step 'G6 tsc build' '-SkipTests'
}

# ---- G7 cocos 类型
Push-Location (Join-Path $root 'game\cocos')
Run-Step 'G7 cocos tsc' (Join-Path $root 'game\cocos') 'node' @('..\node_modules\typescript\bin\tsc', '-p', 'tsconfig.check.json', '--noEmit') $null | Out-Null
Pop-Location

# ---- G8 cocos 断言六套（需要 CDP 页面；-SkipCocos 跳过）
if ($SkipCocos) {
    Skip-Step 'G8 cocos 断言' '-SkipCocos'
} else {
    # 这两套的位置随轮次搬过家（写死旧路径会静默 SKIP）。按可达性排候选，找到就跑。
    $asserts = @(
        'work\cocos_skin\skin_assert.mjs',
        'work\cocos_skinapply\skin_nodes_assert.mjs',
        'work\cocos_skin\skin_nodes_assert.mjs',
        'work\cocos_input\input_assert.mjs',
        'work\cocos_input\cmd_assert.mjs',
        'work\cocos_layout\assert_layout.mjs',
        'work\cocos_render3\assert_layout.mjs',
        'work\cocos_render\assert_layout.mjs'
    )
    $seen = @{}
    foreach ($a in $asserts) {
        $p = Join-Path $root $a
        $leaf = Split-Path $a -Leaf
        if (-not (Test-Path $p)) { if (-not $seen.ContainsKey($leaf)) { $seen[$leaf] = $false }; continue }
        if ($seen.ContainsKey($leaf)) { continue }   # 同名脚本只跑第一个可达的
        $seen[$leaf] = $true
        # assert_layout.mjs 连的是外部已在跑的 devtools(9333)，自己不开浏览器。
        # 门禁不替它起浏览器（起了也常因前台/端口不符而连不上），端口没开就明确 SKIP 并写原因。
        if ($leaf -eq 'assert_layout.mjs') {
            $up = $false
            try {
                $c = New-Object System.Net.Sockets.TcpClient
                $c.Connect('127.0.0.1', 9333); $up = $c.Connected; $c.Close()
            } catch { $up = $false }
            if (-not $up) { Skip-Step ("G8 " + $leaf) '需要 devtools 9333（先 node work\cocos_verify\cdp.mjs launch）'; continue }
        }
        Push-Location $root
        Run-Step ("G8 " + $leaf) $root 'node' @($p) $null | Out-Null
        Pop-Location
    }
    foreach ($k in $seen.Keys) { if (-not $seen[$k]) { Skip-Step ("G8 " + $k) '所有候选路径都不存在' } }
}

# ---- G9 音频 CDN
Push-Location $root
Run-Step 'G9 音频 CDN 校验' $root 'node' @('tools\check_audio_cdn.mjs') $null | Out-Null
Pop-Location

# ---- G10 微信包 gate（只在 dist 存在时跑）
$pkg = Join-Path $root 'dist\wechat-upload'
if (Test-Path $pkg) {
    Push-Location $root
    Run-Step 'G10 微信包 gate' $root 'node' @('work\map_ide\verify_pkg.js', 'dist\wechat-upload') 'RESULT: PASS' -IgnoreExit | Out-Null
    Pop-Location
} else {
    Skip-Step 'G10 微信包 gate' 'dist\wechat-upload 不存在（还没出包）'
}

# ---- G11 编码守门（R199 事故：PS 5.1 的 Set-Content 默认 CP936，用 Get-Content|Set-Content 改源码
#      会把中文写成 U+FFFD —— game/src/core/battle.ts 报废 1962 处，全量测试 1544 -> 586。
#      这道关不设 SKIP：脚本缺了就是 FAIL，因为它守的是「源码本身还能不能被读」。
#      注意：Run-Step 用数组 splat 传参，命名参数会被当成位置值（-Scope 会串到 -Max 上），
#      所以这里用 powershell.exe -File 起子进程，把参数交给 powershell.exe 自己解析。
$encScript = Join-Path $root 'tools\check_encoding.ps1'
$psHost = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $encScript)) {
    Say '---- G11 编码守门'
    Say '     FAIL :: tools\check_encoding.ps1 不存在'
    $script:res += [pscustomobject]@{ Step = 'G11 编码守门'; Status = 'FAIL'; Code = -1; Tail = 'check_encoding.ps1 missing' }
} elseif (-not (Test-Path $psHost)) {
    Say '---- G11 编码守门'
    Say '     FAIL :: 找不到 powershell.exe（Windows PowerShell 5.1）'
    $script:res += [pscustomobject]@{ Step = 'G11 编码守门'; Status = 'FAIL'; Code = -1; Tail = 'powershell.exe not found' }
} else {
    Push-Location $root
    Run-Step 'G11 编码守门' $root $psHost @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $encScript, '-Scope', 'game/src') 'ENCODING check: PASS' | Out-Null
    Pop-Location
}

# ---- 汇总
$sw.Stop()
Say ''
Say '================ 汇总 ================'
$res | ForEach-Object { Say (("{0,-6} {1,-24} {2}" -f $_.Status, $_.Step, $_.Tail)) }
$fail = @($res | Where-Object { $_.Status -eq 'FAIL' }).Count
$skip = @($res | Where-Object { $_.Status -eq 'SKIP' }).Count
$pass = @($res | Where-Object { $_.Status -eq 'PASS' }).Count
Say ("PASS $pass / FAIL $fail / SKIP $skip  用时 " + [int]$sw.Elapsed.TotalSeconds + 's')
Say ("日志: " + $log)
if ($fail -gt 0) {
    Say '结论：门禁未通过，不许打包。'
    exit 1
}
Say '结论：门禁通过（SKIP 项已在 project\165 §4 登记即可打包）。'
exit 0
