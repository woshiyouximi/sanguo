#Requires -Version 5.1
<#
.SYNOPSIS
    编码守门：查源码/文档有没有被 CP936（Windows PowerShell 5.1 的默认 ANSI 编码）写坏。

.DESCRIPTION
    本文件针对的事故：有人用 `(Get-Content -Raw) | Set-Content` 改源码，PS 5.1 按 CP936 读写，
    把中文注释写成 U+FFFD —— game/src/core/battle.ts 报废（1962 个 U+FFFD），全量测试从 1544 掉到 586。

    判定逻辑在 work/enc/scan_utf8.mjs（node 实现，跨平台、不依赖 PowerShell 的编码行为），
    这里只做三件事：找 node、把参数传下去、失败时打印一句「怎么修」。

.PARAMETER Scope
    要扫的目录（相对仓库根），可给多个；也可写成 -Scope game/src,game/tests。
    默认扫 scan_utf8.mjs 里的 DEFAULT_ROOTS：
        game/src  game/web  game/tests  game/cocos/assets/scripts  tools  project  docs  work/fidelity

.PARAMETER Max
    每个文件最多列出几处坏点（默认 20）。

.PARAMETER IncludeVendor
    连 vendored 第三方引擎 tools/cocos 一起扫（默认跳过，那里面本来就有 Chromium 许可证里的 U+FFFD）。

.PARAMETER Strict
    无视 work/enc/allowlist.json 的豁免（历史归档件会被重新算成 BAD）。

.EXAMPLE
    .\tools\check_encoding.ps1

.EXAMPLE
    .\tools\check_encoding.ps1 -Scope game/src

.EXAMPLE
    .\tools\check_encoding.ps1 -Scope game/src,game/tests -Max 5

.NOTES
    退出码：0 = 干净（或只有 WARN / 已豁免），1 = 有 BAD，2 = 环境缺失（找不到 node 或扫描器）。
    本文件必须以 UTF-8 **带 BOM** 保存：PS 5.1 读无 BOM 的 UTF-8 会按 GBK 解，中文注释全乱。
#>
[CmdletBinding()]
param(
    [string[]]$Scope = @(),
    [int]$Max = 20,
    [switch]$IncludeVendor,
    [switch]$Strict
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$scanner = Join-Path $root 'work\enc\scan_utf8.mjs'

if (-not (Test-Path -LiteralPath $scanner)) {
    Write-Host "ENCODING: 找不到扫描器 $scanner" -ForegroundColor Red
    exit 2
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host 'ENCODING: 找不到 node（守门用 node 实现，就是为了不依赖 PowerShell 自身的编码行为）' -ForegroundColor Red
    exit 2
}

$argList = @($scanner)
foreach ($s in $Scope) { if ($s) { $argList += $s } }
$argList += "--max=$Max"
if ($IncludeVendor) { $argList += '--include-vendor' }
if ($Strict) { $argList += '--strict' }

if ($Scope.Count -gt 0) {
    Write-Host ("ENCODING check: scope=" + ($Scope -join ' '))
} else {
    Write-Host 'ENCODING check: scope=(default roots)'
}

& $nodeCmd.Source @argList
$code = $LASTEXITCODE

if ($code -eq 0) {
    Write-Host 'ENCODING check: PASS (0 BAD)' -ForegroundColor Green
    exit 0
}
if ($code -ne 1) {
    Write-Host "ENCODING check: ERROR (scanner exit=$code)" -ForegroundColor Red
    exit $code
}

Write-Host 'ENCODING check: FAIL (有文件被写坏)' -ForegroundColor Red
Write-Host '怎么修：用 read/write/edit 工具、或用 python 显式 encoding="utf-8" 整文件重写；绝不要再 `Get-Content -Raw | Set-Content`（PS 5.1 默认 CP936，会把中文写成 U+FFFD）。'
exit 1
