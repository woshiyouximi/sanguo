# 从云机拉回结果（图片 / 序列帧 / manifest）
#
# 用法：
#   .\pull_results.ps1 -HostName root@region-xx.autodl.com -Port 12345 -RemoteRoot /root/sango_ai
#   .\pull_results.ps1 ... -Dest F:\sanguo\cloud\in_v0
#
# 只拉 out/ 与 logs/：模型和 ComfyUI 本体不回来。
param(
  [Parameter(Mandatory = $true)][string]$HostName,
  [int]$Port = 22,
  [string]$RemoteRoot = "/root/sango_ai",
  [string]$Dest = "F:\sanguo\cloud\in_v0"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "==> 远端 out/ 大小"
& ssh -P $Port $HostName "du -sh $RemoteRoot/out; ls $RemoteRoot/out | wc -l"

Write-Host "==> 拉取 out/（可重跑，已存在的文件会被覆盖成最新）"
& scp -P $Port -r "${HostName}:$RemoteRoot/out/*" $Dest

Write-Host "==> 拉取 manifest 与日志"
& scp -P $Port "${HostName}:$RemoteRoot/out/_manifest.json" (Join-Path $Dest "_manifest.json")
& scp -P $Port "${HostName}:$RemoteRoot/logs/comfy.log" (Join-Path $Dest "comfy.log")

# 本地统计
$png = Get-ChildItem -LiteralPath $Dest -Filter *.png -ErrorAction SilentlyContinue
$mb = if ($png) { [math]::Round(($png | Measure-Object -Property Length -Sum).Sum / 1MB, 1) } else { 0 }
Write-Host "==> 完成：$($png.Count) 张 PNG，$mb MB → $Dest"

if (Test-Path (Join-Path $Dest "_manifest.json")) {
  $m = Get-Content (Join-Path $Dest "_manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  Write-Host "    manifest：" -NoNewline
  $m.counters | Format-Table | Out-String | Write-Host
  $errs = $m.jobs.PSObject.Properties | Where-Object { $_.Value.status -eq "error" }
  if ($errs) {
    Write-Host "    失败任务：" -ForegroundColor Yellow
    $errs | ForEach-Object { Write-Host ("      {0}  {1}" -f $_.Name, $_.Value.err) }
  }
}
