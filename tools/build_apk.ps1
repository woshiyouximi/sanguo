# [216_apk] 无 Gradle 的 APK 构建流水线：aapt2 → javac → d8 → ZipPack（assets 逐条 STORED）→ zipalign → apksigner
#
# 为什么手写：这台机器只有 JDK 17 + Android SDK 的 platforms/build-tools，
# 没有 NDK、没有 cmake、没有 gradle（也明确不下载，几百 MB 起）。本作是纯 Canvas2D + WebAudio
# 的多页 web 应用，不需要原生编译，所以「资源 → 字节码 → 签名」这三段可以直接调 SDK 里的命令行工具拼出来。
#
# 用法（任意目录）：
#   pwsh -NoProfile -File F:\sanguo\tools\build_apk.ps1
# 产出：
#   F:\sanguo\dist\android\sanguo-debug.apk
#
# 纪律：本脚本只写 apk\build\、apk\assets\www\、apk\keystore\、dist\android\ 四处，
# 不改 game\**（只读取 game\web、game\data、game\dist）。

param(
  # main  = 完整游戏包 → dist\android\sanguo-debug.apk
  # smoke = 最小烟雾包 → dist\android\sanguo-smoke.apk（< 1 MB，assets\www 只有一页 ES5 探针）
  # 两者共用同一份 java / 同一个 classes.dex，只有 assets、清单（包名/应用名）、输出文件名不同。
  [ValidateSet('main', 'smoke')]
  [string]$Variant = 'main'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# 外部工具（aapt2 / javac / d8）输出是 UTF-8，而中文 Windows 的控制台默认 GBK：
# 不显式指定，badging 里的「三國群英傳 2」到这里就是乱码，断言会假失败。
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }
try { $OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

# ===================== 参数（全部绝对路径，集中在这里） =====================
$Root        = 'F:\sanguo'
$JdkHome     = 'F:\devtools\jdk\jdk-17.0.21+9'
$SdkHome     = 'F:\devtools\android\sdk'
$BuildTools  = Join-Path $SdkHome 'build-tools\34.0.0'
$AndroidJar  = Join-Path $SdkHome 'platforms\android-34\android.jar'
$D8Jar       = Join-Path $BuildTools 'lib\d8.jar'
$Aapt2       = Join-Path $BuildTools 'aapt2.exe'
$ZipAlign    = Join-Path $BuildTools 'zipalign.exe'
$ApkSigner   = Join-Path $BuildTools 'apksigner.bat'
$Javac       = Join-Path $JdkHome 'bin\javac.exe'
$Java        = Join-Path $JdkHome 'bin\java.exe'
$Keytool     = Join-Path $JdkHome 'bin\keytool.exe'

$ApkDir      = Join-Path $Root 'apk'
$Manifest    = Join-Path $ApkDir 'AndroidManifest.xml'
$ResDir      = Join-Path $ApkDir 'res'
$JavaDir     = Join-Path $ApkDir 'java'
$TestDir     = Join-Path $ApkDir 'test\java'
$AssetsDir   = Join-Path $ApkDir 'assets'
$WwwDir      = Join-Path $AssetsDir 'www'
$BuildDir    = Join-Path $ApkDir 'build'
$GenDir      = Join-Path $BuildDir 'gen'
$ClassDir    = Join-Path $BuildDir 'classes'
$DexDir      = Join-Path $BuildDir 'dex'
$ResZip      = Join-Path $BuildDir 'res.zip'
$BaseApk     = Join-Path $BuildDir 'base.apk'
$PackedApk   = Join-Path $BuildDir 'packed.apk'
$AlignedApk  = Join-Path $BuildDir 'aligned.apk'

$WebDir      = Join-Path $Root 'game\web'
$DataDir     = Join-Path $Root 'game\data'
$DistDir     = Join-Path $Root 'game\dist'

$KeystoreDir = Join-Path $ApkDir 'keystore'
$Keystore    = Join-Path $KeystoreDir 'debug.jks'
$StorePass   = '123456'
$KeyAlias    = 'debug'

$OutDir      = Join-Path $Root 'dist\android'
$OutApk      = Join-Path $OutDir 'sanguo-debug.apk'

$MinSdk      = '24'
$TargetSdk   = '34'
$StartedAt   = Get-Date

# ===================== 变体（main / smoke） =====================
# smoke 包存在的意义：把「壳能不能起来」和「游戏页面能不能起来」彻底分开。
# 如果 sanguo-smoke.apk 打开是 SHELL OK，而主包黑屏，那问题在页面/WebView 内核，不在壳。
if ($Variant -eq 'smoke') {
  $IsMain    = $false
  $Manifest  = Join-Path $ApkDir 'AndroidManifest.smoke.xml'
  $AssetsDir = Join-Path $ApkDir 'smoke'          # ZipPack 把这里的内容包成 assets\...
  $WwwDir    = Join-Path $AssetsDir 'www'
  $OutApk    = Join-Path $OutDir 'sanguo-smoke.apk'
  $PkgName   = 'com.sanguo.webview.smoke'
  $MaxApk    = 1000000
} else {
  $IsMain    = $true
  $Manifest  = Join-Path $ApkDir 'AndroidManifest.xml'
  $AssetsDir = Join-Path $ApkDir 'assets'
  $WwwDir    = Join-Path $AssetsDir 'www'
  $OutApk    = Join-Path $OutDir 'sanguo-debug.apk'
  $PkgName   = 'com.sanguo.webview'
  $MaxApk    = 0
}

# keytool / apksigner.bat 都靠 JAVA_HOME 或 PATH 找 java，先把本次会话指到 JDK 17
$env:JAVA_HOME = $JdkHome
$env:PATH = "$JdkHome\bin;$env:PATH"

# PS 5.1（.NET Framework 版）默认没把 ZipFile 类型装进会话，不显式加载就报「找不到类型
# [System.IO.Compression.ZipFile]」。3b 装 assets、6 装 classes.dex 都要用它。
try {
  Add-Type -AssemblyName System.IO.Compression -ErrorAction Stop
  Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
} catch {
  throw "无法加载 System.IO.Compression（3b/6 需要它写 zip）：$($_.Exception.Message)"
}

# ===================== 小工具 =====================
function Write-Step([string]$no, [string]$title) {
  Write-Host ''
  Write-Host "=== [$no] $title ===" -ForegroundColor Cyan
}

function Format-Size([long]$bytes) {
  # 两个口径都给：MB 按 10^6（手机/应用商店的算法），MiB 按 2^20（资源管理器/dir 的算法）
  return ('{0:N0} B = {1:N2} MB = {2:N2} MiB' -f $bytes, ($bytes / 1e6), ($bytes / 1MB))
}

# 跑外部命令：输出直接流到控制台（这就是报告里的"原始输出"），失败立刻抛，不静默重试。
# 注意：PS 5.1 在 $ErrorActionPreference='Stop' 下会把子进程写的任何一行 stderr 当成
# NativeCommandError 抛出（javac 的「注: ... 使用或覆盖了已过时的 API」就是这种无害 stderr），
# 所以这里临时降到 Continue，成败只认 $LASTEXITCODE。
function Invoke-Tool([string]$exe, [string[]]$argv, [string]$what) {
  if (-not (Test-Path -LiteralPath $exe)) { throw "缺少工具：$exe（$what）" }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $exe @argv 2>&1 | ForEach-Object { "$_" }
  } finally {
    $ErrorActionPreference = $prev
  }
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    throw "$what 失败（exit $code）：`n  $exe $($argv -join ' ')`n  原始输出见上方。"
  }
}

# 跑外部命令并收集输出（给要解析/打印的验证步骤用）
function Invoke-Capture([string]$exe, [string[]]$argv) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $lines = & $exe @argv 2>&1 | ForEach-Object { "$_" }
  } finally {
    $ErrorActionPreference = $prev
  }
  return @($lines)
}

Write-Host '三國群英傳 2 · APK 构建（WebView 壳 + 本地 HTTP 服务 + 未压缩音频）' -ForegroundColor Yellow
Write-Host "  JDK      : $JdkHome"
Write-Host "  SDK      : $SdkHome"
Write-Host "  build-tools: $BuildTools"
Write-Host "  输出     : $OutApk"

# ===================== [1/10] 清理 + 复制站点 =====================
Write-Step '1/10' '清理 build\ 与 assets\www\，把 game\web + game\data + game\dist 平铺进 assets\www'

# 注意：smoke 变体**不能**删 $WwwDir——那里是手写的烟雾页，删了就没了
foreach ($p in @($BuildDir, $(if ($IsMain) { $WwwDir } else { $null }))) {
  if (-not $p) { continue }
  if (Test-Path -LiteralPath $p) {
    Remove-Item -LiteralPath $p -Recurse -Force
    Write-Host "  已删除 $p"
  }
}
New-Item -ItemType Directory -Force -Path $BuildDir  | Out-Null
New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null
New-Item -ItemType Directory -Force -Path $OutDir    | Out-Null
New-Item -ItemType Directory -Force -Path $KeystoreDir | Out-Null

# 站点根 = game\web 的平铺副本。为什么还要 data 与 dist：页面里 fetch('../data/x.json')、
# import '../dist/core/x.js' 在"页面位于站点根"时归一化成 /data/、/dist/，所以这两棵树必须
# 也平铺到 assets\www 下，否则 APK 里会 404（浏览器本地跑时它们是 game\data、game\dist）。
if ($IsMain) {
Copy-Item -LiteralPath $WebDir  -Destination $WwwDir -Recurse -Force
Copy-Item -LiteralPath $DataDir -Destination (Join-Path $WwwDir 'data') -Recurse -Force
Copy-Item -LiteralPath $DistDir -Destination (Join-Path $WwwDir 'dist') -Recurse -Force

$wwwFiles = @(Get-ChildItem -LiteralPath $WwwDir -Recurse -File -Force)
$wwwBytes = [long](($wwwFiles | Measure-Object -Property Length -Sum).Sum)
Write-Host ("  assets\www : {0:N0} 个文件 / {1}" -f $wwwFiles.Count, (Format-Size $wwwBytes))

$bgmFiles = @(Get-ChildItem -LiteralPath (Join-Path $WwwDir 'assets\audio\bgm') -Filter '*.mp3' -File)
$bgmBytes = [long](($bgmFiles | Measure-Object -Property Length -Sum).Sum)
$bgmMax   = $bgmFiles | Sort-Object Length -Descending | Select-Object -First 1
$sfxFiles = @(Get-ChildItem -LiteralPath (Join-Path $WwwDir 'assets\audio\sfx') -File)
Write-Host ("  bgm        : {0} 个 mp3 / {1}（最大 {2} = {3:N0} B，未压缩原样复制）" -f `
    $bgmFiles.Count, (Format-Size $bgmBytes), $bgmMax.Name, $bgmMax.Length)
Write-Host ("  sfx        : {0} 个文件" -f $sfxFiles.Count)
} else {
# smoke：assets 只有手写的一页；不碰 game\**，也不碰主包用的 apk\assets\www
$smokePage = Join-Path $WwwDir 'campaign.html'
if (-not (Test-Path -LiteralPath $smokePage)) { throw "烟雾包缺页面：$smokePage" }
$wwwFiles = @(Get-ChildItem -LiteralPath $WwwDir -Recurse -File -Force)
$wwwBytes = [long](($wwwFiles | Measure-Object -Property Length -Sum).Sum)
Write-Host ("  smoke assets\www : {0} 个文件 / {1}（不含任何游戏素材）" -f `
    $wwwFiles.Count, (Format-Size $wwwBytes))
}

# ===================== [2/10] aapt2 compile =====================
Write-Step '2/10' 'aapt2 compile --dir apk\res -o apk\build\res.zip'
Invoke-Tool $Aapt2 @('compile', '--dir', $ResDir, '-o', $ResZip) 'aapt2 compile'
Write-Host ("  res.zip    : {0:N0} B" -f (Get-Item -LiteralPath $ResZip).Length)

# ===================== [3/10] aapt2 link（只打清单 + res） =====================
Write-Step '3/10' 'aapt2 link（清单 + res + R.java；assets 不走 -A，原因见步骤 6）'
# --no-compress：res 与 resources.arsc 全部 stored。理由不是凑体积：
#   ① res 里的 png 本来就是压缩格式，deflate 白烧 CPU 也压不小；
#   ② resources.arsc 必须 stored，否则部分 ROM 会拒绝安装。
Invoke-Tool $Aapt2 @(
  'link', '-o', $BaseApk, '-I', $AndroidJar, '--manifest', $Manifest,
  '--java', $GenDir, '--no-compress',
  $ResZip, '--min-sdk-version', $MinSdk, '--target-sdk-version', $TargetSdk
) 'aapt2 link'
Write-Host ("  base.apk   : {0}" -f (Format-Size ([long](Get-Item -LiteralPath $BaseApk).Length)))

# ===================== [4/10] javac =====================
Write-Step '4/10' 'javac（apk\java + build\gen 的 R.java）'
New-Item -ItemType Directory -Force -Path $ClassDir | Out-Null
$javaSources = @(Get-ChildItem -LiteralPath $JavaDir -Recurse -Filter '*.java' -File | ForEach-Object { $_.FullName })
$genSources  = @(Get-ChildItem -LiteralPath $GenDir  -Recurse -Filter '*.java' -File | ForEach-Object { $_.FullName })
Write-Host ("  源码       : {0} 个（java {1} / gen {2}）" -f ($javaSources.Count + $genSources.Count), $javaSources.Count, $genSources.Count)
Invoke-Tool $Javac (@('-J-Duser.language=en', '-J-Duser.country=US',
    '-source', '17', '-target', '17', '-Xlint:-options', '-nowarn', '-encoding', 'UTF-8',
    '-classpath', $AndroidJar, '-d', $ClassDir) + $javaSources + $genSources) 'javac'
$classFiles = @(Get-ChildItem -LiteralPath $ClassDir -Recurse -Filter '*.class' -File)
Write-Host ("  classes    : {0} 个 .class" -f $classFiles.Count)

# ===================== [4b] HttpUtil 纯逻辑单测 =====================
Write-Step '4b/10' 'HttpUtil 纯逻辑单测（桌面 JVM，不需要模拟器）'
$testClasses = Join-Path $BuildDir 'test-classes'
New-Item -ItemType Directory -Force -Path $testClasses | Out-Null
$httpUtil = Join-Path $JavaDir 'com\sanguo\webview\HttpUtil.java'
$httpTest = Join-Path $TestDir 'com\sanguo\webview\HttpUtilTest.java'
Invoke-Tool $Javac @('-encoding', 'UTF-8', '-d', $testClasses, $httpUtil, $httpTest) 'javac（单测）'
# -Dsun.stdout.encoding：Windows 上 JVM 默认按控制台代码页（GBK）输出，而控制台在这边是 UTF-8，
# 不加这一条，测试里的中文 PASS 行会变成乱码（PASS/FAIL 本身是 ASCII，不影响结论，但报告要能读）
Invoke-Tool $Java @('-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8',
    '-cp', $testClasses, 'com.sanguo.webview.HttpUtilTest') 'HttpUtilTest'

# ===================== [4c] AssetPathTest：拦截层在真实素材树上的证据 =====================
Write-Step '4c/10' 'AssetPathTest（桌面 JVM：每个素材都能被自己的 URL 找到 + MIME + 206 切片）'
# 1.1 的取数走 WebViewClient.shouldInterceptRequest，真机才跑得起来；但它依赖的判定全在 HttpUtil。
# 这里把 assets\www 下每个文件反推成「WebView 会发的 URL」再喂回 normalizePath，要求逐字回到原路径——
# 1671 个文件全对，才敢说「不存在壳能起来但资源全 404」这种半死状态。
$assetTest = Join-Path $TestDir 'com\sanguo\webview\AssetPathTest.java'
Invoke-Tool $Javac @('-encoding', 'UTF-8', '-d', $testClasses, $httpUtil, $assetTest) 'javac（AssetPathTest）'
Invoke-Tool $Java @('-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8',
    '-cp', $testClasses, 'com.sanguo.webview.AssetPathTest', $WwwDir) 'AssetPathTest'

# ===================== [5/10] d8 =====================
Write-Step '5/10' 'd8 --release（.class → classes.dex）'
New-Item -ItemType Directory -Force -Path $DexDir | Out-Null
$classPaths = @($classFiles | ForEach-Object { $_.FullName })
Invoke-Tool $Java (@('-cp', $D8Jar, 'com.android.tools.r8.D8', '--release', '--lib', $AndroidJar,
    '--min-api', $MinSdk, '--output', $DexDir) + $classPaths) 'd8'
$dexFile = Join-Path $DexDir 'classes.dex'
Write-Host ("  classes.dex: {0}" -f (Format-Size ([long](Get-Item -LiteralPath $dexFile).Length)))

# ===================== [6/10] ZipPack：base.apk + assets\www(stored) + classes.dex =====================
Write-Step '6/10' 'ZipPack：把 base.apk + assets\www（每条 STORED）+ classes.dex 合成 packed.apk'
# 为什么自己写打包这一步、不用 aapt2 的 -A：
#   aapt2.exe（build-tools 34.0.0）在中文 Windows 上打不开非 ASCII 文件名的 asset，首跑原始报错：
#     aapt2.exe : F:\sanguo\apk\assets\www\assets\hero\????.webp: error: failed to open file.
#   而 assets\hero 下有 400 张按武将中文名命名的立绘（页面就是按这些名字取图，不能改名）。
# 为什么不用 PB 自带的 System.IO.Compression：.NET Framework 的 NoCompression 实际写的是
#   "deflate + stored block"，条目方法仍为 8、每 32KB 还多 5 字节——不是真 stored，音频也就谈不上"未压缩"。
# ZipPack.java 用 java.util.zip 显式 setMethod(STORED)，同时保留 resources.arsc 的 stored
#   （targetSdk>=30 的机器强制要求），dex 走 deflate。
$ToolsDir = Join-Path $BuildDir 'tools'
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null
$zipPackSrc = Join-Path $Root 'apk\tools\ZipPack.java'
if (-not (Test-Path -LiteralPath $zipPackSrc)) { throw "缺少打包工具源码：$zipPackSrc" }
Invoke-Tool $Javac @('-encoding', 'UTF-8', '-d', $ToolsDir, $zipPackSrc) 'javac（ZipPack）'
Invoke-Tool $Java @('-cp', $ToolsDir, 'ZipPack', $BaseApk, $PackedApk, $AssetsDir, 'assets', $dexFile) 'ZipPack'

# ===================== [7/10] zipalign =====================
Write-Step '7/10' 'zipalign -f 4（必须在签名之前）'
Invoke-Tool $ZipAlign @('-f', '4', $PackedApk, $AlignedApk) 'zipalign'
Write-Host ("  aligned.apk: {0}" -f (Format-Size ([long](Get-Item -LiteralPath $AlignedApk).Length)))

# ===================== [8/10] 签名 =====================
Write-Step '8/10' 'keystore（首次生成）+ apksigner sign'
if (Test-Path -LiteralPath $Keystore) {
  Write-Host "  复用已有 keystore：$Keystore"
} else {
  Invoke-Tool $Keytool @('-J-Duser.language=en', '-J-Duser.country=US',
      '-genkeypair', '-keystore', $Keystore, '-storepass', $StorePass,
      '-keypass', $StorePass, '-alias', $KeyAlias, '-keyalg', 'RSA', '-keysize', '2048',
      '-validity', '10000', '-dname', 'CN=Sanguo Debug') 'keytool'
  Write-Host "  已生成 keystore：$Keystore（storepass/keypass=$StorePass，alias=$KeyAlias，10000 天）"
}
Invoke-Tool $ApkSigner @('sign', '--ks', $Keystore, '--ks-key-alias', $KeyAlias,
    '--ks-pass', "pass:$StorePass", '--key-pass', "pass:$StorePass",
    '--out', $OutApk, $AlignedApk) 'apksigner sign'
Write-Host ("  已签名     : {0}" -f (Format-Size ([long](Get-Item -LiteralPath $OutApk).Length)))

# ===================== [9/10] 验证 =====================
Write-Step '9/10' 'apksigner verify + aapt2 dump badging + APK 条目清单'

Write-Host ''
Write-Host '  --- apksigner verify --print-certs ---'
$verifyOut = Invoke-Capture $ApkSigner @('verify', '--verbose', '--print-certs', $OutApk)
$verifyOut | ForEach-Object { Write-Host "  $_" }
if (-not ($verifyOut -match 'Verifies')) { throw "apksigner verify 没通过：`n$($verifyOut -join "`n")" }

Write-Host ''
Write-Host '  --- aapt2 dump badging ---'
$badging = Invoke-Capture $Aapt2 @('dump', 'badging', $OutApk)
$badging | ForEach-Object { Write-Host "  $_" }
$pkgLine   = ($badging | Where-Object { $_ -like 'package:*' }       | Select-Object -First 1)
$labelLine = ($badging | Where-Object { $_ -like 'application-label*' } | Select-Object -First 1)
$sdkLine   = ($badging | Where-Object { $_ -like 'sdkVersion:*' }    | Select-Object -First 1)
$tgtLine   = ($badging | Where-Object { $_ -like 'targetSdkVersion:*' } | Select-Object -First 1)
$launchLine = ($badging | Where-Object { $_ -like 'launchable-activity:*' } | Select-Object -First 1)
Write-Host ''
Write-Host "  package      : $pkgLine"
Write-Host "  label        : $labelLine"
Write-Host "  $sdkLine"
Write-Host "  $tgtLine"
Write-Host "  $launchLine"
if ($pkgLine -notmatch [regex]::Escape("name='$PkgName'")) { throw "包名不对：$pkgLine" }
# strings.xml 里写的是「三國群英傳2」（没有空格），aapt2 原样输出，所以这里允许 0 或多个空格
if ($labelLine -notmatch '三國群英傳\s*2') { throw "应用名不对：$labelLine" }

Write-Host ''
Write-Host '  --- APK 条目清单（关键条目 + 音频是否 stored）---'
$zip = [System.IO.Compression.ZipFile]::OpenRead($OutApk)
try {
  $entries = @($zip.Entries)
  Write-Host ("  条目总数     : {0:N0}" -f $entries.Count)
  $must = if ($IsMain) {
    @('classes.dex', 'AndroidManifest.xml', 'resources.arsc',
      'assets/www/index.html', 'assets/www/campaign.html',
      'assets/www/main.js', 'assets/www/audio.js', 'assets/www/release.js',
      'assets/www/data/meta.json', 'assets/www/dist/core/battle.js')
  } else {
    @('classes.dex', 'AndroidManifest.xml', 'resources.arsc', 'assets/www/campaign.html')
  }
  foreach ($m in $must) {
    $e = $entries | Where-Object { $_.FullName -ceq $m } | Select-Object -First 1
    if (-not $e) { throw "APK 里缺条目：$m" }
    Write-Host ("  OK {0,-34} {1,12:N0} B  (compressed {2:N0})" -f $m, $e.Length, $e.CompressedLength)
  }
  # resources.arsc 必须 stored：Android 11+ 对 targetSdk>=30 的包强制要求，否则装不上
  $arsc = $entries | Where-Object { $_.FullName -ceq 'resources.arsc' } | Select-Object -First 1
  if (-not $arsc) { throw 'APK 里没有 resources.arsc' }
  if ($arsc.CompressedLength -ne $arsc.Length) {
    throw "resources.arsc 不是 stored（$($arsc.CompressedLength)/$($arsc.Length)），Android 11+ 会拒绝安装"
  }
  Write-Host ("  resources.arsc: stored {0:N0} B（Android 11+ 强制要求）" -f $arsc.Length)

  if ($IsMain) {
  # 400 张中文名立绘能进 zip、且条目名按 UTF-8 存，才说明资产没被 aapt2 那条路吃掉
  $heroEntries = @($entries | Where-Object { $_.FullName -like 'assets/www/assets/hero/*.webp' })
  Write-Host ("  hero 立绘    : {0} 个（中文文件名 / UTF-8 条目名）" -f $heroEntries.Count)
  if ($heroEntries.Count -lt 400) { throw "hero 立绘不足 400 张：$($heroEntries.Count)" }

  $bgmEntries = @($entries | Where-Object { $_.FullName -like 'assets/www/assets/audio/bgm/*.mp3' })
  $bgmTotal = [long](($bgmEntries | Measure-Object -Property Length -Sum).Sum)
  $stored = @($bgmEntries | Where-Object { $_.CompressedLength -eq $_.Length })
  Write-Host ("  bgm 条目     : {0} 个 / {1}" -f $bgmEntries.Count, (Format-Size $bgmTotal))
  Write-Host ("  bgm stored   : {0}/{1} 个条目 CompressedLength == Length（即完全未压缩）" -f $stored.Count, $bgmEntries.Count)
  $maxEntry = $bgmEntries | Sort-Object Length -Descending | Select-Object -First 1
  Write-Host ("  bgm 最大     : {0} = {1:N0} B" -f $maxEntry.FullName, $maxEntry.Length)
  if ($bgmEntries.Count -ne 10) { throw "bgm 条目数不是 10：$($bgmEntries.Count)" }
  if ($bgmTotal -lt 13e6) { throw "bgm 总字节 < 13 MB：$bgmTotal" }
  if ($stored.Count -ne $bgmEntries.Count) { throw "有 bgm 条目被压缩了：$($stored.Count)/$($bgmEntries.Count) stored" }

  $sfxEntries = @($entries | Where-Object { $_.FullName -like 'assets/www/assets/audio/sfx/*' })
  Write-Host ("  sfx 条目     : {0} 个" -f $sfxEntries.Count)
  } else {
  # 烟雾包：必须没有游戏素材，且整包 < 1 MB —— 它只是「壳 + 一页探针」
  $leak = @($entries | Where-Object { $_.FullName -like 'assets/www/dist/*' -or $_.FullName -like 'assets/www/assets/*' })
  Write-Host ("  游戏素材泄漏 : {0} 个条目（必须是 0）" -f $leak.Count)
  if ($leak.Count -ne 0) { throw "烟雾包里混进了游戏素材：$($leak[0].FullName)" }
  $probe = $entries | Where-Object { $_.FullName -ceq 'assets/www/campaign.html' } | Select-Object -First 1
  Write-Host ("  探针页       : {0:N0} B" -f $probe.Length)
  if ($probe.Length -gt 20000) { throw "探针页太大：$($probe.Length) B" }
  }
} finally {
  $zip.Dispose()
}

# ===================== [10/10] 汇总 =====================
Write-Step '10/10' '完成'
$final = Get-Item -LiteralPath $OutApk
$zip = [System.IO.Compression.ZipFile]::OpenRead($OutApk)
try { $entryCount = $zip.Entries.Count } finally { $zip.Dispose() }
$elapsed = (Get-Date) - $StartedAt
if ($MaxApk -gt 0 -and $final.Length -gt $MaxApk) {
  throw "烟雾包超过 $MaxApk B（实际 $($final.Length) B）——它必须是个能秒传的小包"
}
Write-Host ''
Write-Host ("  APK        : {0}" -f $final.FullName) -ForegroundColor Green
Write-Host ("  字节数     : {0:N0} B" -f $final.Length)
Write-Host ("  大小       : {0:N2} MB = {1:N2} MiB" -f ($final.Length / 1e6), ($final.Length / 1MB))
Write-Host ("  条目数     : {0:N0}" -f $entryCount)
Write-Host ("  耗时       : {0:N1} s" -f $elapsed.TotalSeconds)
Write-Host ''
Write-Host ("  安装：adb install -r {0}" -f $final.FullName) -ForegroundColor Yellow
Write-Host ("  抓日志：adb logcat -s SanguoShell") -ForegroundColor Yellow
