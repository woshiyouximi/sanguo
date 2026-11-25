# 把本机的 6 个模型传到云机（35.8 GB）
#
# 用法：
#   .\upload.ps1 -HostName root@region-xx.autodl.com -Port 12345 -RemoteRoot /root/sango_ai
#   .\upload.ps1 ... -SkipHash          # 跳过本地 sha256（省 3 分钟）
#
# 为什么不是"直接在云上下载"：本机用的 text encoder 是 int8_convrot 量化版，
# 公开仓库不一定有同款；换编码器会改变出图风格（见 models_manifest.json 的 fallback）。
param(
  [Parameter(Mandatory = $true)][string]$HostName,
  [int]$Port = 22,
  [string]$RemoteRoot = "/root/sango_ai",
  [string]$ModelsRoot = "F:\AI\ComfyUI\models",
  [switch]$SkipHash
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$man = Get-Content (Join-Path $here "models_manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$sshArgs = @("-P", "$Port")
Write-Host "==> 目标 $HostName`:$RemoteRoot (port $Port)"

foreach ($f in $man.files) {
  $local = Join-Path (Join-Path $ModelsRoot $f.dir) $f.name
  if (-not (Test-Path -LiteralPath $local)) { throw "本机缺文件：$local" }
  $len = (Get-Item -LiteralPath $local).Length
  if ($len -ne $f.size) { throw "大小不符：$local 实际 $len 期望 $($f.size)" }
}

Write-Host "==> 建目录"
& ssh @sshArgs $HostName "mkdir -p $RemoteRoot/ComfyUI/models/{diffusion_models,text_encoders,vae} $RemoteRoot/out $RemoteRoot/logs"

foreach ($f in $man.files) {
  $local = Join-Path (Join-Path $ModelsRoot $f.dir) $f.name
  $remote = "$RemoteRoot/ComfyUI/models/$($f.dir)/$($f.name)"
  $sizeGB = [math]::Round($f.size / 1GB, 2)
  Write-Host "==> ($sizeGB GB) $($f.name)"
  # 已存在且大小一致就跳过：断点续跑靠这个
  $remoteLen = (& ssh @sshArgs $HostName "stat -c %s '$remote' 2>/dev/null || echo 0").Trim()
  if ($remoteLen -eq "$($f.size)") { Write-Host "   已存在且大小一致，跳过"; continue }
  & scp -P $Port -C $local "${HostName}:$remote"
  if ($LASTEXITCODE -ne 0) { throw "scp 失败：$($f.name)" }
}

if (-not $SkipHash) {
  Write-Host "==> 校验（远端 sha256，35 GB 约 3~5 分钟）"
  & ssh @sshArgs $HostName "cd $RemoteRoot && python3 models_check.py --hash --root $RemoteRoot"
} else {
  & ssh @sshArgs $HostName "cd $RemoteRoot && python3 models_check.py --root $RemoteRoot"
}

Write-Host @"

==> 完成。下一步在云机上：
    cd $RemoteRoot
    bash setup_cloud.sh                 # 若是全新机器，先跑这个
    python ComfyUI/main.py --listen 0.0.0.0 --port 8188 > logs/comfy.log 2>&1 &
    python run_batch.py --jobs jobs_v0.csv --workers 4 --out out
"@
