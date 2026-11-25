<#
.SYNOPSIS
  把小游戏出包复制成一个带时间戳的新目录，专供微信开发者工具打开。

.DESCRIPTION
  开发者工具的编译缓存按「项目路径」保存：同一个 dist\wechat-upload 反复出包时，
  它会拿旧的文件清单去找旧 hash 的 chunk，报 ENOENT（见 project/203）。
  换一个新路径即等于冷编译。

.EXAMPLE
  powershell -NoProfile -File tools\make_test_build.ps1
#>
param(
  [string]$Source = "dist\wechat-upload",
  [string]$Prefix = "wechat-test"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root $Source
if (-not (Test-Path $src)) { throw "找不到出包目录：$src" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dst = Join-Path (Join-Path $root 'dist') ("$Prefix-$stamp")
Copy-Item $src $dst -Recurse -Force

$files = Get-ChildItem $dst -Recurse -File
$sum = ($files | Measure-Object -Property Length -Sum).Sum
Write-Host ("[test-build] 已复制：{0}" -f $dst)
Write-Host ("[test-build] 档数 {0} / {1:N2} MB" -f $files.Count, ($sum / 1MB))

$verify = Join-Path (Join-Path $root 'work\map_ide') 'verify_pkg.js'
if (Test-Path $verify) {
  Push-Location $root
  try { node $verify $dst } finally { Pop-Location }
}
Write-Host '[test-build] 在开发者工具里打开上面的新目录，并执行：工具 -> 清除缓存 -> 全部清除 -> 编译'
