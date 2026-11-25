<#
.SYNOPSIS
  用微信开发者工具 CLI 上传小游戏（绕过 GUI 的编译缓存问题）。

.DESCRIPTION
  GUI 上传偶尔会把分包当成主包（报 80051 source size ... exceed max limit 4MB），
  但同一份包用 CLI 上传是正常的（见 project/203）。本脚本封装常用参数。

.EXAMPLE
  powershell -NoProfile -File tools\upload_wechat.ps1
  powershell -NoProfile -File tools\upload_wechat.ps1 -Version 0.1.1 -Desc "修透视边界"
#>
param(
  [string]$Project = "dist\wechat-upload",
  [string]$Version = "0.1.0",
  [string]$Desc = "sanguo vertical",
  [string]$Cli = "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root $Project
if (-not (Test-Path $proj)) { throw "找不到出包目录：$proj" }
if (-not (Test-Path $Cli)) { throw "找不到微信开发者工具 CLI：$Cli" }

Write-Host ("[upload] 项目 {0}" -f $proj)
Write-Host ("[upload] 版本 {0} / {1}" -f $Version, $Desc)

$log = Join-Path $root ("work\cli_upload_{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
& $Cli upload --project $proj -v $Version -d $Desc *> $log
$code = $LASTEXITCODE
Get-Content $log -Encoding utf8 | Select-Object -Last 20

$bad = Select-String -Path $log -Pattern '80051|exceed max limit' -Encoding utf8
if ($bad) {
  Write-Host '[upload] 失败：服务端报代码包超限（先把 dist\wechat-upload 复制成新目录再试，见 project/203）'
  exit 1
}
if ($code -ne 0) { Write-Host ("[upload] CLI 退出码 {0}（日志 {1}）" -f $code, $log) }
Write-Host ("[upload] 完成，日志：{0}" -f $log)
