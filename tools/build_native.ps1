#Requires -Version 7.0
<#
.SYNOPSIS
    三國群英傳2·豎版重製 —— Cocos Creator 3.8.8 原生 Android（cocos2d-x）出包脚本。

.DESCRIPTION
    产出一个真正的原生 APK（lib/arm64-v8a/libcocos.so + assets/ 资源包），
    不是 WebView 壳 + web-mobile 的那种包。

    流程四步：
      1) 同步闸门：node work\cocos_sync\sync_core3.mjs --diff-only，有差异直接中止；
      2) 调 CocosCreator CLI（configPath 方式）生成原生工程 + 编译资源包；
      3) 用本机已缓存的 gradle 发行版跑 :android:assembleDebug（CMake + NDK r23b）；
      4) 复制成品到 dist\android\sanguo-native.apk，aapt2 核对 badging，报字节 / SHA-256。

    为什么这么绕（都是踩过的坑，改之前先看）：
      * ELECTRON_RUN_AS_NODE=1 会让 CocosCreator.exe 退化成 node，必须先 Remove-Item；
      * CLI 传 `packageName=xxx` 这类顶层键**进不了** packages.android，必须写 configPath JSON；
      * CocosCreator 跑成功也返回非 0 退出码（实测 34/36），唯一成功判据是日志出现
        `build Task (android) Finished` 且产物目录存在；
      * gradlew.bat 会去 services.gradle.org 下 gradle 发行版（本机网络超时），
        所以直接调用 %USERPROFILE%\.gradle 里已缓存的 gradle.bat，绕开 wrapper；
      * repo1.maven.org（Maven Central）在本机不可达，构建仓库换成 aliyun 镜像；
      * app_name 只能出现一处，否则 AGP 报 Duplicate resources：
        值写在 native\engine\android\res\values\strings.xml，proj\res\values\strings.xml 必须删掉；
      * namespace 不能叫 ...native（native 是 Java 关键字），所以包名是 com.sanguo.sango2。

.PARAMETER OutApk
    成品 APK 目标路径，默认 F:\sanguo\dist\android\sanguo-native.apk。

.PARAMETER SkipSyncCheck
    跳过第 1 步同步闸门（只在明确知道 core 镜像已同步时用）。

.PARAMETER SkipCocosBuild
    跳过第 2 步 Cocos 构建，直接用现有的 native\ 工程和 cocos-build-native\android\data 跑 gradle。

.PARAMETER Clean
    构建前删掉 cocos-build-native\android\proj\build 与 native\engine\android（强制重新生成原生模板）。

.EXAMPLE
    pwsh -File F:\sanguo\tools\build_native.ps1

.EXAMPLE
    pwsh -File F:\sanguo\tools\build_native.ps1 -SkipCocosBuild
#>
[CmdletBinding()]
param(
    [string] $OutApk = 'F:\sanguo\dist\android\sanguo-native.apk',
    [switch] $SkipSyncCheck,
    [switch] $SkipCocosBuild,
    [switch] $Clean,
    [switch] $NoProvision
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}
# 控制台按 UTF-8 输出，避免中文在 GBK 代码页下变乱码
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

# ---------------------------------------------------------------- 常量路径
$Root       = 'F:\sanguo'
$Project    = Join-Path $Root 'game\cocos'
$BuildPath  = Join-Path $Root 'game\cocos-build-native'          # Cocos buildPath
$AndroidOut = Join-Path $BuildPath 'android'                      # <buildPath>\android
$ProjDir    = Join-Path $AndroidOut 'proj'                        # gradle 根工程
$NativeDir  = Join-Path $Project 'native\engine\android'          # 原生模板落地处
$DataDir    = Join-Path $AndroidOut 'data'                        # 会被当成 assets\ 塞进 APK
$WorkDir    = Join-Path $Root 'work\cocos_native'                 # 日志与 config JSON
$CreatorExe = Join-Path $Root 'tools\cocos\cc388\CocosCreator.exe'
$SdkDir     = 'F:\devtools\android\sdk'
$NdkDir     = Join-Path $SdkDir 'ndk\23.1.7779620'
$JavaHome   = 'F:\devtools\jdk\jdk-17.0.21+9'
$StartScene = '0b007000-1a2b-4c3d-8e4f-000000000001'              # Boot.scene
$PackageName = 'com.sanguo.sango2'
$AppAbi     = @('arm64-v8a', 'armeabi-v7a')
$AppAbiText = $AppAbi -join ':'
$ApiLevel   = 34

$CfgJson    = Join-Path $WorkDir 'build_android.json'
$CocosLog   = Join-Path $WorkDir 'cocos_build.log'
$CocosErr   = Join-Path $WorkDir 'cocos_build.err.log'
$GradleLog  = Join-Path $WorkDir 'gradle_build.log'

function Write-Step([string] $msg) {
    Write-Host ''
    Write-Host ('=' * 78) -ForegroundColor DarkCyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host ('=' * 78) -ForegroundColor DarkCyan
}

function Assert-Path([string] $p, [string] $what) {
    if (-not (Test-Path -LiteralPath $p)) { throw "$what 不存在：$p" }
}

# ---------------------------------------------------------------- 0. 前置检查
Write-Step '0/5 前置检查'

$provScript = Join-Path $Root 'tools\provision_android.ps1'
if ($NoProvision) {
    Write-Host '  已按 -NoProvision 跳过工具链自动装配。' -ForegroundColor Yellow
}
elseif (Test-Path -LiteralPath $provScript) {
    Write-Host '  检查 Android 工具链（缺件会自动下载，日志 work\cocos_native\provision.log）'
    & $provScript -SdkDir $SdkDir -NdkVersion (Split-Path $NdkDir -Leaf) -JavaHome $JavaHome
    if ($LASTEXITCODE -ne 0) {
        throw '工具链装配失败：先看 work\cocos_native\provision.log，按其中「手工兜底」三行装齐再重跑，或加 -NoProvision 自行准备环境。'
    }
}
else {
    Write-Host '  未找到 tools\provision_android.ps1，跳过自动装配' -ForegroundColor Yellow
}
Assert-Path $CreatorExe 'CocosCreator.exe'
Assert-Path $Project    'Cocos 项目'
Assert-Path $SdkDir     'Android SDK'
Assert-Path $NdkDir     'NDK 23.1.7779620'
Assert-Path (Join-Path $JavaHome 'bin\java.exe') 'JDK 17'
if (-not (Test-Path -LiteralPath $WorkDir)) { New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null }

$env:JAVA_HOME         = $JavaHome
$env:ANDROID_SDK_ROOT  = $SdkDir
$env:ANDROID_HOME      = $SdkDir
$env:NDK_ROOT          = $NdkDir
Write-Host "  JAVA_HOME        = $JavaHome"
Write-Host "  ANDROID_SDK_ROOT = $SdkDir"
Write-Host "  NDK_ROOT         = $NdkDir"

# ---------------------------------------------------------------- 1. 同步闸门
if (-not $SkipSyncCheck) {
    Write-Step '1/5 同步闸门：core 镜像差异检查'
    $syncScript = Join-Path $Root 'work\cocos_sync\sync_core3.mjs'
    Assert-Path $syncScript 'sync_core3.mjs'
    $syncOut = & node $syncScript --diff-only 2>&1 | Out-String
    Write-Host $syncOut.Trim()
    if ($syncOut -match '有差异\s*(\d+)') {
        $n = [int] $Matches[1]
        if ($n -gt 0) {
            throw "core 镜像有 $n 个文件陈旧，先跑 node work\cocos_sync\sync_core3.mjs 再出包（本轮中止，未改动任何产物）。"
        }
    }
    elseif ($syncOut -notmatch '相同') {
        throw "无法解析 sync_core3.mjs --diff-only 的输出，请人工确认：`n$syncOut"
    }
    Write-Host '  闸门通过：无陈旧文件。' -ForegroundColor Green
}
else {
    Write-Host '  已按 -SkipSyncCheck 跳过同步闸门。' -ForegroundColor Yellow
}

# ---------------------------------------------------------------- 2. Cocos 构建
if (-not $SkipCocosBuild) {
    Write-Step '2/5 Cocos Creator 生成原生工程 + 编译资源包'

    if (Get-Process CocosCreator -ErrorAction SilentlyContinue) {
        throw '已有 CocosCreator 进程在跑（同一项目不能并发构建），先关掉再重试。'
    }

    $cfg = [ordered]@{
        platform   = 'android'
        name       = 'android'
        outputName = 'android'
        debug      = $true
        md5Cache   = $false                                   # 原生包保持 md5Cache=false，settings.bundleVers 才是自洽的空表
        buildPath  = ($BuildPath -replace '\\', '/')
        startScene = $StartScene
        packages   = [ordered]@{
            android = [ordered]@{
                packageName          = $PackageName
                sdkPath              = ($SdkDir -replace '\\', '/')
                ndkPath              = ($NdkDir -replace '\\', '/')
                javaHome             = ($JavaHome -replace '\\', '/')
                javaPath             = ''
                apiLevel             = $ApiLevel
                appABIs              = @($AppAbi)
                androidInstant       = $false
                appBundle            = $false
                inputSDK             = $false
                maxAspectRatio       = '2.1'
                resizeableActivity   = $false
                orientation          = [ordered]@{
                    portrait       = $true
                    upsideDown     = $false
                    landscapeLeft  = $false
                    landscapeRight = $false
                }
                keystorePath         = ''
                keystorePassword     = ''
                keystoreAlias        = ''
                keystoreAliasPassword = ''
            }
        }
    }
    $cfgJsonText = $cfg | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText($CfgJson, $cfgJsonText, (New-Object Text.UTF8Encoding($false)))
    Write-Host "  构建配置：$CfgJson"

    if ($Clean) {
        foreach ($p in @((Join-Path $ProjDir 'build'), $NativeDir)) {
            if (Test-Path -LiteralPath $p) {
                Write-Host "  -Clean：删除 $p" -ForegroundColor Yellow
                Remove-Item -LiteralPath $p -Recurse -Force
            }
        }
    }

    # ELECTRON_RUN_AS_NODE 会把编辑器退化成 node，必须先摘掉
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    Remove-Item Env:\NODE_OPTIONS           -ErrorAction SilentlyContinue

    $buildArg = "configPath=$($CfgJson -replace '\\', '/')"
    Write-Host "  $CreatorExe --project $Project --build `"$buildArg`""
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath $CreatorExe `
        -ArgumentList @('--project', $Project, '--build', $buildArg) `
        -PassThru -RedirectStandardOutput $CocosLog -RedirectStandardError $CocosErr
    [void] $proc.WaitForExit(900000)
    $sw.Stop()

    if (-not $proc.HasExited) {
        $proc.Kill()
        throw "CocosCreator 超过 900 秒未退出，已强杀。日志：$CocosLog"
    }
    $cocosLogText = if (Test-Path $CocosLog) { Get-Content $CocosLog -Raw } else { '' }
    $finished = $cocosLogText -match 'build Task \(android\) Finished'
    Write-Host ("  退出码 {0}，耗时 {1:N0}s，日志标记 build Task (android) Finished = {2}" -f $proc.ExitCode, $sw.Elapsed.TotalSeconds, $finished)
    if (-not $finished) {
        $errText = if (Test-Path $CocosErr) { (Get-Content $CocosErr -Raw) } else { '' }
        throw "Cocos 构建失败（CLI 退出码不可靠，以日志标记为准）。`nstdout 尾部：`n$(($cocosLogText -split "`n" | Select-Object -Last 25) -join "`n")`nstderr：`n$errText"
    }
    Assert-Path $ProjDir 'gradle 根工程（proj）'
    Assert-Path (Join-Path $DataDir 'src\settings.json') '原生资源包 data\src\settings.json'
    Write-Host '  Cocos 构建通过。' -ForegroundColor Green
}
else {
    Write-Host '  已按 -SkipCocosBuild 跳过 Cocos 构建。' -ForegroundColor Yellow
    Assert-Path $ProjDir 'gradle 根工程（proj）'
}

# ---------------------------------------------------------------- 3. 构建后修补
Write-Step '3/5 构建后修补（app_name 去重 + Maven 镜像 + 编码）'

# 3a. app_name 只能有一处：proj\res\values\strings.xml 若被 generateAppNameValues 生成出来，必须删掉
$dupStrings = Join-Path $ProjDir 'res\values\strings.xml'
if (Test-Path -LiteralPath $dupStrings) {
    Remove-Item -LiteralPath $dupStrings -Force
    Write-Host "  已删除重复的 $dupStrings（app_name 保留在 native\engine\android\res\values\strings.xml）"
}

# 3b. Maven Central 在本机不可达：把 mavenCentral() 换成 aliyun 镜像（幂等）
$mirrorBlock = @(
    "        google()",
    "        maven { url 'https://maven.aliyun.com/repository/public' }",
    "        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }",
    "        maven { url 'https://maven.aliyun.com/repository/google' }"
) -join "`n"
foreach ($g in @((Join-Path $NativeDir 'build.gradle'), (Join-Path $ProjDir 'build.gradle'))) {
    if (-not (Test-Path -LiteralPath $g)) { continue }
    $txt = [IO.File]::ReadAllText($g, [Text.Encoding]::UTF8)
    if ($txt -match 'mavenCentral\(\)') {
        $txt = $txt -replace "(?m)^\s*mavenCentral\(\)\s*$", $mirrorBlock
        $txt = $txt -replace "(?m)^\s*google\(\)\s*\r?\n\s*google\(\)\s*$", "        google()"
        [IO.File]::WriteAllText($g, $txt, (New-Object Text.UTF8Encoding($false)))
        Write-Host "  已把 mavenCentral() 换成 aliyun 镜像：$g"
    }
    else {
        Write-Host "  仓库已是镜像配置：$g"
    }
}

# 3c. 编码统一 UTF-8，避免 javac 中文乱码/告警
$gradleProps = Join-Path $ProjDir 'gradle.properties'
if (Test-Path -LiteralPath $gradleProps) {
    $gp = [IO.File]::ReadAllText($gradleProps, [Text.Encoding]::UTF8)
    foreach ($kv in @(
            @('PROP_NDK_VERSION', '23.1.7779620'),
            @('PROP_APP_ABI',     $AppAbiText),
            @('APPLICATION_ID',   $PackageName)
        )) {
        $k = $kv[0]; $v = $kv[1]
        if ($gp -match "(?m)^\s*$([regex]::Escape($k))\s*=.*$") {
            $gp = $gp -replace "(?m)^\s*$([regex]::Escape($k))\s*=.*$", "$k=$v"
        }
        else {
            $gp = $gp.TrimEnd() + "`n$k=$v`n"
        }
    }
    [IO.File]::WriteAllText($gradleProps, $gp, (New-Object Text.UTF8Encoding($false)))
    Write-Host "  已核对 $gradleProps（PROP_NDK_VERSION=23.1.7779620 / PROP_APP_ABI=$AppAbiText / APPLICATION_ID=$PackageName）"
}

# ---------------------------------------------------------------- 4. gradle 出 APK
Write-Step '4/5 gradle :android:assembleDebug'

$gradleBat = $null
$distsRoot = Join-Path $env:USERPROFILE '.gradle\wrapper\dists\gradle-8.11.1-bin'
if (Test-Path -LiteralPath $distsRoot) {
    $cand = Get-ChildItem -Path $distsRoot -Recurse -Filter 'gradle.bat' -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\gradle-8\.11\.1\\bin\\gradle\.bat$' }
    # 优先选已打完的发行版（同目录有 .ok 标记的那一个）
    $gradleBat = ($cand | Where-Object { Test-Path (Join-Path (Split-Path (Split-Path $_.FullName -Parent) -Parent) '.ok') } | Select-Object -First 1).FullName
    if (-not $gradleBat) { $gradleBat = ($cand | Select-Object -First 1).FullName }
}
if (-not $gradleBat) {
    $gradleBat = Join-Path $ProjDir 'gradlew.bat'
    Write-Host '  未找到本机缓存的 gradle 8.11.1，回退到 gradlew.bat（需要能访问 services.gradle.org）。' -ForegroundColor Yellow
}
else {
    Write-Host "  使用本机缓存发行版：$gradleBat"
}
Assert-Path $gradleBat 'gradle 可执行文件'

$sw = [Diagnostics.Stopwatch]::StartNew()
# .bat 不能直接给 Start-Process -RedirectStandardOutput（UseShellExecute=false 起不了批处理），
# 统一套一层 cmd.exe /c。
$gArgs = @('-p', $ProjDir, '--no-daemon', '--console=plain', ':android:assembleDebug')
if ($gradleBat -match '\.(bat|cmd)$') {
    $gExe  = "$env:ComSpec"
    $gArgs = @('/c', "`"$gradleBat`"") + $gArgs
}
else {
    $gExe = $gradleBat
}
$gproc = Start-Process -FilePath $gExe `
    -ArgumentList $gArgs `
    -PassThru -RedirectStandardOutput $GradleLog -RedirectStandardError (Join-Path $WorkDir 'gradle_build.err.log')
[void] $gproc.WaitForExit(1800000)
$sw.Stop()
if (-not $gproc.HasExited) {
    $gproc.Kill()
    throw "gradle 超过 1800 秒未退出，已强杀。日志：$GradleLog"
}
$glog = if (Test-Path $GradleLog) { Get-Content $GradleLog -Raw } else { '' }
Write-Host ("  gradle 退出码 {0}，耗时 {1:N0}s" -f $gproc.ExitCode, $sw.Elapsed.TotalSeconds)
if ($glog -match '(?m)^BUILD SUCCESSFUL') {
    Write-Host '  BUILD SUCCESSFUL' -ForegroundColor Green
}
else {
    $tail = ($glog -split "`n" | Where-Object { $_ -match '^(FAILURE|\* What went wrong|> |Caused by)' } | Select-Object -Last 20) -join "`n"
    throw "gradle 构建失败。关键行：`n$tail`n完整日志：$GradleLog"
}

$builtApk = Join-Path $ProjDir 'build\android\outputs\apk\debug\android-debug.apk'
Assert-Path $builtApk 'gradle 产出的 APK'

# ---------------------------------------------------------------- 5. 交付 + 验证
Write-Step '5/5 交付与验证'

$outDir = Split-Path $OutApk -Parent
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
Copy-Item -LiteralPath $builtApk -Destination $OutApk -Force

$fi = Get-Item -LiteralPath $OutApk
$sha = (Get-FileHash -LiteralPath $OutApk -Algorithm SHA256).Hash

$aapt2 = Join-Path $SdkDir 'build-tools\36.0.0\aapt2.exe'
if (-not (Test-Path -LiteralPath $aapt2)) {
    $aapt2 = (Get-ChildItem (Join-Path $SdkDir 'build-tools') -Recurse -Filter 'aapt2.exe' -ErrorAction SilentlyContinue | Select-Object -Last 1).FullName
}

Write-Host ''
Write-Host "  APK     : $OutApk"
Write-Host ("  字节    : {0:N0}" -f $fi.Length)
Write-Host "  SHA-256 : $sha"
if ($aapt2 -and (Test-Path -LiteralPath $aapt2)) {
    Write-Host '  --- aapt2 dump badging ---'
    & $aapt2 dump badging $OutApk 2>$null |
        Select-String -Pattern '^package:|^sdkVersion|^targetSdkVersion|^application-label:|^launchable-activity|^native-code' |
        ForEach-Object { Write-Host ('  ' + $_.Line) }
}
else {
    Write-Host '  （未找到 aapt2，跳过 badging）' -ForegroundColor Yellow
}

# 资源包自检：确认 res 是内置 bundle 且不远程
$settingsInData = Join-Path $DataDir 'src\settings.json'
if (Test-Path -LiteralPath $settingsInData) {
    $sj = Get-Content $settingsInData -Raw | ConvertFrom-Json
    $remote = @($sj.assets.remoteBundles)
    $bundles = @($sj.assets.projectBundles)
    Write-Host ''
    Write-Host "  projectBundles   : $($bundles -join ', ')"
    Write-Host "  remoteBundles    : $(if ($remote.Count -eq 0) { '[] （全部内置）' } else { $remote -join ', ' })"
    if ($remote -contains 'res') { throw 'res 被标成了远程 bundle，APK 内资源将无法离线加载！' }
    $resDir = Join-Path $DataDir 'assets\res'
    if (Test-Path -LiteralPath $resDir) {
        $resFiles = Get-ChildItem -LiteralPath $resDir -Recurse -File
        Write-Host ("  assets\res       : {0:N0} 个文件 / {1:N0} B" -f $resFiles.Count, ($resFiles | Measure-Object Length -Sum).Sum)
        $mp3 = $resFiles | Where-Object { $_.Extension -eq '.mp3' }
        Write-Host ("  res 内 mp3       : {0:N0} 个 / {1:N0} B" -f $mp3.Count, ($mp3 | Measure-Object Length -Sum).Sum)
    }
}

Write-Step '完成'
Write-Host "  日志：$CocosLog"
Write-Host "        $GradleLog"
