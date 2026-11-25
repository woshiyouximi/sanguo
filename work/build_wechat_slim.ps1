# build_wechat_slim.ps1 —— 一条命令产出「可上传的微信小游戏包」：构建 + 把 res 搬到远程目录
# 用法:  pwsh -File F:\sanguo\work\build_wechat_slim.ps1 [-Server https://cdn.example.com/sanguo/]
param([string]$Server = 'https://cdn.example.com/sanguo/')

$ErrorActionPreference = 'Stop'
$exe = 'F:\sanguo\tools\cocos\cc388\CocosCreator.exe'
$proj = 'F:/sanguo/game/cocos'
$out = 'F:/sanguo/game/cocos-build'
$log = 'F:\sanguo\work\build_wechat_slim.log'
$err = 'F:\sanguo\work\build_wechat_slim.err.log'

# exe 是 Electron，这个变量在 agent/shell 里通常被继承成 node 模式，必须清掉
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item $log, $err -ErrorAction SilentlyContinue

$buildArg = "platform=wechatgame;debug=false;md5Cache=true;buildPath=$out;startScene=0b007000-1a2b-4c3d-8e4f-000000000001;server=$Server"
Write-Host "building wechatgame -> $out\wechatgame ..."
$sw = [Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $exe `
  -ArgumentList @('--project', $proj, '--build', $buildArg) `
  -PassThru -NoNewWindow -RedirectStandardOutput $log -RedirectStandardError $err
$p.WaitForExit()
$sw.Stop()

$finished = Select-String -Path $log -Pattern 'build Task \(wechatgame\) Finished' | Select-Object -Last 1
if (-not $finished) {
  Write-Host "构建失败，看日志: $log / $err" -ForegroundColor Red
  Get-Content $log -Tail 20
  exit 1
}
Write-Host ("build ok in {0:N0}s" -f $sw.Elapsed.TotalSeconds) -ForegroundColor Green

# 把 res 搬到远程目录并改 settings.json（CLI 无法传 bundleConfigs，只能后处理）
node 'F:\sanguo\work\pack_remote.mjs' "$out/wechatgame" $Server res
