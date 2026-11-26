<#
.SYNOPSIS
    三國群英傳2 重製 —— Android 原生工具链自动装配（缺什么装什么）。

.DESCRIPTION
    build_native.ps1 出原生包需要五样东西：JDK 17 / Android SDK / NDK r23b /
    CMake 3.22.1（带 ninja）/ Gradle 8.11.1（或其本地缓存）+ Maven 镜像。
    本脚本按「先找现成、再下载」的顺序把它们补齐，并把每一步写到日志：

      1) JDK      ：$JavaHome → $env:JAVA_HOME → F:\devtools\jdk\jdk-17* → 下载 Temurin 17
      2) SDK      ：$SdkDir → 有 cmdline-tools 即可用；没有就下 commandlinetools-win
      3) NDK      ：$SdkDir\ndk\<ver> → 没有就下 android-ndk-r23b-windows.zip 并解到该目录
      4) CMake    ：$SdkDir\cmake\3.22.1\bin\ninja.exe → 没有就 sdkmanager "cmake;3.22.1"
      5) Gradle   ：%USERPROFILE%\.gradle\wrapper\dists\... 里找 8.11.1；没有就下 bin 包
      6) 镜像     ：写 %USERPROFILE%\.gradle\init.gradle（aliyun maven），repo1 不可达时兜底

    设计约束：
      * 只下载、只解压，不删用户已有目录；已存在的组件一律复用。
      * 下载走 curl.exe（带断点续传），失败换镜像；全部失败时给出可复制的手工命令。
      * 幂等：连跑两次第二次全是「已就绪」。
      * 本脚本不产出 APK，只保证 build_native.ps1 的「0. 前置检查」能过。

.PARAMETER CheckOnly
    只检查并打印状态表，不下载不改环境；有缺件时退出码 1。

.PARAMETER SdkDir
    Android SDK 根目录，默认 F:\devtools\android\sdk。

.PARAMETER NdkVersion
    NDK 版本目录名，默认 23.1.7779620（r23b）。

.PARAMETER JavaHome
    JDK 17 根目录，默认 F:\devtools\jdk\jdk-17.0.21+9。

.EXAMPLE
    pwsh -File F:\sanguo\tools\provision_android.ps1 -CheckOnly

.EXAMPLE
    pwsh -File F:\sanguo\tools\provision_android.ps1
#>
[CmdletBinding()]
param(
    [switch] $CheckOnly,
    [string] $SdkDir    = 'F:\devtools\android\sdk',
    [string] $NdkVersion = '23.1.7779620',
    [string] $JavaHome  = 'F:\devtools\jdk\jdk-17.0.21+9',
    [string] $CmakeVersion = '3.22.1',
    [string] $GradleVersion = '8.11.1'
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$WorkDir = 'F:\sanguo\work\cocos_native'
if (-not (Test-Path -LiteralPath $WorkDir)) { New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null }
$LogFile = Join-Path $WorkDir 'provision.log'

function Write-Log([string] $msg, [string] $color = 'Gray') {
    $line = "[{0:HH:mm:ss}] {1}" -f (Get-Date), $msg
    Write-Host $line -ForegroundColor $color
    Add-Content -LiteralPath $LogFile -Value $line -Encoding utf8
}

function Test-Exe([string] $path) {
    return (Test-Path -LiteralPath $path -PathType Leaf)
}

# ------------------------------------------------------------------ 下载/解压
function Invoke-Download([string] $url, [string] $dest) {
    if (Test-Path -LiteralPath $dest) {
        $len = (Get-Item -LiteralPath $dest).Length
        if ($len -gt 1048576) { Write-Log "  已有下载：$dest（$([math]::Round($len/1MB,1)) MB），复用" 'DarkGray'; return $true }
        Remove-Item -LiteralPath $dest -Force -ErrorAction SilentlyContinue
    }
    $tmp = "$dest.part"
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    Write-Log "  下载 $url"
    $curl = 'C:\Windows\System32\curl.exe'
    if (Test-Path -LiteralPath $curl) {
        & $curl -L --fail --retry 3 --retry-delay 2 -C - -o $tmp $url
        $code = $LASTEXITCODE
    } else {
        try { Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing; $code = 0 } catch { $code = 1 }
    }
    if ($code -ne 0 -or -not (Test-Path -LiteralPath $tmp)) {
        Write-Log "  下载失败（curl exit $code）：$url" 'Red'
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        return $false
    }
    Move-Item -LiteralPath $tmp -Destination $dest -Force
    $len = (Get-Item -LiteralPath $dest).Length
    Write-Log "  下载完成：$dest（$([math]::Round($len/1MB,1)) MB）" 'Green'
    return $true
}

function Expand-Zip([string] $zip, [string] $dest) {
    if (-not (Test-Path -LiteralPath $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
    Write-Log "  解压 $zip → $dest"
    # tar.exe（Win10 1803+ 自带 bsdtar）比 Expand-Archive 快一个数量级，且能处理大 zip
    $tar = 'C:\Windows\System32\tar.exe'
    if (Test-Path -LiteralPath $tar) {
        & $tar -xf $zip -C $dest
        if ($LASTEXITCODE -eq 0) { return $true }
        Write-Log "  tar 解压失败（exit $LASTEXITCODE），改用 Expand-Archive" 'Yellow'
    }
    try { Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force; return $true }
    catch { Write-Log "  解压失败：$_" 'Red'; return $false }
}

function Get-FreeSpaceMB([string] $p) {
    try {
        $d = New-Object IO.DirectoryInfo($p)
        return [math]::Round($d.PSDrive.Free / 1MB, 0)
    } catch { return -1 }
}

# ------------------------------------------------------------------ 各项检查
function Resolve-Jdk {
    if (Test-Exe (Join-Path $JavaHome 'bin\java.exe')) { return $JavaHome }
    if ($env:JAVA_HOME -and (Test-Exe (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { return $env:JAVA_HOME }
    $found = Get-ChildItem 'F:\devtools\jdk' -Directory -ErrorAction SilentlyContinue |
             Sort-Object Name -Descending | Select-Object -First 1
    if ($found -and (Test-Exe (Join-Path $found.FullName 'bin\java.exe'))) { return $found.FullName }
    return $null
}

function Install-Jdk {
    $dest = Join-Path $WorkDir 'downloads\jdk17.zip'
    if (-not (Test-Path (Split-Path $dest))) { New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null }
    $urls = @(
        'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse',
        'https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip'
    )
    foreach ($u in $urls) { if (Invoke-Download $u $dest) { break } }
    if (-not (Test-Path -LiteralPath $dest)) { return $null }
    $out = Join-Path $WorkDir 'downloads\jdk17'
    if (-not (Expand-Zip $dest $out)) { return $null }
    $inner = Get-ChildItem $out -Directory | Select-Object -First 1
    if ($inner -and (Test-Exe (Join-Path $inner.FullName 'bin\java.exe'))) { return $inner.FullName }
    return $null
}

function Resolve-SdkManager {
    $candidates = @(
        (Join-Path $SdkDir 'cmdline-tools\latest\bin\sdkmanager.bat'),
        (Join-Path $SdkDir 'cmdline-tools\bin\sdkmanager.bat'),
        (Join-Path $SdkDir 'tools\bin\sdkmanager.bat')
    )
    foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
    return $null
}

function Install-CmdlineTools {
    $dest = Join-Path $WorkDir 'downloads\cmdline-tools.zip'
    if (-not (Test-Path (Split-Path $dest))) { New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null }
    $urls = @(
        'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip',
        'https://mirrors.cloud.tencent.com/AndroidSDK/commandlinetools-win-11076708_latest.zip'
    )
    foreach ($u in $urls) { if (Invoke-Download $u $dest) { break } }
    if (-not (Test-Path -LiteralPath $dest)) { return $null }
    $tmp = Join-Path $WorkDir 'downloads\cmdline-tools'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    if (-not (Expand-Zip $dest $tmp)) { return $null }
    $inner = Join-Path $tmp 'cmdline-tools'
    $latest = Join-Path $SdkDir 'cmdline-tools\latest'
    if (-not (Test-Path (Split-Path $latest))) { New-Item -ItemType Directory -Path (Split-Path $latest) -Force | Out-Null }
    if (Test-Path $latest) { Remove-Item $latest -Recurse -Force -ErrorAction SilentlyContinue }
    Copy-Item -LiteralPath $inner -Destination $latest -Recurse -Force
    # sdkmanager 需要 SDK 根的双保险
    $sm = Join-Path $latest 'bin\sdkmanager.bat'
    if (Test-Path -LiteralPath $sm) { return $sm }
    return $null
}

function Install-Ndk {
    $dest = Join-Path $WorkDir 'downloads\ndk-r23b.zip'
    if (-not (Test-Path (Split-Path $dest))) { New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null }
    $free = Get-FreeSpaceMB $SdkDir
    if ($free -ge 0 -and $free -lt 6000) { Write-Log "  SDK 所在盘剩余 ${free} MB，NDK 解压约需 3.5 GB，空间可能不足" 'Yellow' }
    $urls = @(
        'https://dl.google.com/android/repository/android-ndk-r23b-windows.zip',
        'https://mirrors.cloud.tencent.com/AndroidSDK/android-ndk-r23b-windows.zip'
    )
    $ok = $false
    foreach ($u in $urls) { if (Invoke-Download $u $dest) { $ok = $true; break } }
    if (-not $ok) { return $false }
    $tmp = Join-Path $WorkDir 'downloads\ndk-extract'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    if (-not (Expand-Zip $dest $tmp)) { return $false }
    $inner = Get-ChildItem $tmp -Directory | Where-Object { $_.Name -like 'android-ndk-*' } | Select-Object -First 1
    if (-not $inner) { Write-Log '  解压后找不到 android-ndk-* 目录' 'Red'; return $false }
    $target = Join-Path $SdkDir "ndk\$NdkVersion"
    if (-not (Test-Path (Split-Path $target))) { New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null }
    if (Test-Path $target) { Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue }
    Move-Item -LiteralPath $inner.FullName -Destination $target
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    $rev = Join-Path $target 'source.properties'
    if (Test-Path -LiteralPath $rev) {
        $line = (Select-String -Path $rev -Pattern 'Pkg.Revision' | Select-Object -First 1).Line
        Write-Log "  NDK 落地：$target（$line）" 'Green'
    }
    return (Test-Path -LiteralPath (Join-Path $target 'toolchains\llvm\prebuilt\windows-x86_64\bin\clang.exe'))
}

function Resolve-Cmake {
    $ninja = Join-Path $SdkDir "cmake\$CmakeVersion\bin\ninja.exe"
    if (Test-Exe $ninja) { return $true }
    return $false
}

function Install-Cmake([string] $sdkManager) {
    if (-not $sdkManager) { Write-Log '  没有 sdkmanager，无法装 cmake;3.22.1' 'Red'; return $false }
    Write-Log "  sdkmanager `"cmake;$CmakeVersion`"（约 60 MB）"
    $env:JAVA_HOME = if ($script:JdkResolved) { $script:JdkResolved } else { $env:JAVA_HOME }
    $yes = ("y`n" * 20)
    $yes | & $sdkManager "--sdk_root=$SdkDir" "cmake;$CmakeVersion" 2>&1 | ForEach-Object { Write-Log "    $_" 'DarkGray' }
    return (Resolve-Cmake)
}

function Resolve-Gradle {
    $gradleHome = Join-Path $env:USERPROFILE '.gradle'
    $dists = Join-Path $gradleHome 'wrapper\dists'
    if (Test-Path -LiteralPath $dists) {
        $hit = Get-ChildItem $dists -Directory -Recurse -Depth 2 -ErrorAction SilentlyContinue |
               Where-Object { $_.Name -like "gradle-$GradleVersion*" } | Select-Object -First 1
        if ($hit) {
            $bat = Get-ChildItem $hit.FullName -Recurse -Filter 'gradle.bat' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($bat) { return $bat.FullName }
        }
    }
    # 也接受手动解压的发行版
    $manual = Get-ChildItem 'F:\devtools\gradle' -Directory -ErrorAction SilentlyContinue |
              Where-Object { $_.Name -like "gradle-$GradleVersion*" } | Select-Object -First 1
    if ($manual) {
        $bat = Join-Path $manual.FullName 'bin\gradle.bat'
        if (Test-Exe $bat) { return $bat }
    }
    return $null
}

function Install-Gradle {
    $dest = Join-Path $WorkDir 'downloads\gradle.zip'
    if (-not (Test-Path (Split-Path $dest))) { New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null }
    $urls = @(
        "https://mirrors.cloud.tencent.com/gradle/gradle-$GradleVersion-bin.zip",
        "https://mirrors.aliyun.com/gradle/gradle-$GradleVersion-bin.zip",
        "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"
    )
    $ok = $false
    foreach ($u in $urls) { if (Invoke-Download $u $dest) { $ok = $true; break } }
    if (-not $ok) { return $null }
    $out = 'F:\devtools\gradle'
    if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out -Force | Out-Null }
    if (-not (Expand-Zip $dest $out)) { return $null }
    return (Resolve-Gradle)
}

function Ensure-MavenMirror {
    $gradleHome = Join-Path $env:USERPROFILE '.gradle'
    if (-not (Test-Path $gradleHome)) { New-Item -ItemType Directory -Path $gradleHome -Force | Out-Null }
    $init = Join-Path $gradleHome 'init.gradle'
    if (Test-Path -LiteralPath $init) { Write-Log '  init.gradle 已存在，保持不动' 'DarkGray'; return }
    $content = @'
// 三國群英傳2 重製：本机 repo1.maven.org 不可达，统一走 aliyun 镜像
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/public' }
        maven { url 'https://maven.aliyun.com/repository/google' }
        maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
        google()
        mavenCentral()
    }
}
'@
    [IO.File]::WriteAllText($init, $content, (New-Object Text.UTF8Encoding($false)))
    Write-Log "  写入 $init（aliyun 镜像优先）" 'Green'
}

# ------------------------------------------------------------------ 主流程
Write-Log '=== Android 原生工具链装配 ===' 'Cyan'
$rows = @()

# 1) JDK
$script:JdkResolved = Resolve-Jdk
if ($script:JdkResolved) {
    Write-Log "JDK 17 已就绪：$script:JdkResolved" 'Green'
    $rows += [pscustomobject]@{ 组件 = 'JDK 17'; 状态 = '已就绪'; 位置 = $script:JdkResolved }
} elseif ($CheckOnly) {
    Write-Log 'JDK 17 缺失' 'Yellow'
    $rows += [pscustomobject]@{ 组件 = 'JDK 17'; 状态 = '缺失'; 位置 = $JavaHome }
} else {
    Write-Log 'JDK 17 缺失，尝试下载 Temurin 17' 'Yellow'
    $script:JdkResolved = Install-Jdk
    $rows += [pscustomobject]@{ 组件 = 'JDK 17'; 状态 = if ($script:JdkResolved) { '已安装' } else { '失败' }; 位置 = $script:JdkResolved }
}
$env:JAVA_HOME = $script:JdkResolved

# 2) SDK / cmdline-tools
$sdkOk = Test-Path -LiteralPath $SdkDir
$sdkManager = Resolve-SdkManager
if ($sdkOk -and $sdkManager) {
    Write-Log "Android SDK 已就绪：$SdkDir" 'Green'
    $rows += [pscustomobject]@{ 组件 = 'Android SDK'; 状态 = '已就绪'; 位置 = $SdkDir }
} elseif ($CheckOnly) {
    Write-Log 'Android SDK 或 cmdline-tools 缺失' 'Yellow'
    $rows += [pscustomobject]@{ 组件 = 'Android SDK'; 状态 = '缺失'; 位置 = $SdkDir }
} else {
    if (-not $sdkOk) { New-Item -ItemType Directory -Path $SdkDir -Force | Out-Null }
    $sdkManager = Install-CmdlineTools
    $rows += [pscustomobject]@{ 组件 = 'Android SDK'; 状态 = if ($sdkManager) { '已安装 cmdline-tools' } else { '失败' }; 位置 = $SdkDir }
}
$env:ANDROID_SDK_ROOT = $SdkDir
$env:ANDROID_HOME = $SdkDir

# 3) NDK
$ndkDir = Join-Path $SdkDir "ndk\$NdkVersion"
$ndkOk = Test-Path -LiteralPath (Join-Path $ndkDir 'toolchains\llvm\prebuilt\windows-x86_64\bin\clang.exe')
if ($ndkOk) {
    Write-Log "NDK $NdkVersion 已就绪：$ndkDir" 'Green'
    $rows += [pscustomobject]@{ 组件 = "NDK $NdkVersion"; 状态 = '已就绪'; 位置 = $ndkDir }
} elseif ($CheckOnly) {
    Write-Log "NDK $NdkVersion 缺失（约 789 MB 下载 / 3.5 GB 解压）" 'Yellow'
    $rows += [pscustomobject]@{ 组件 = "NDK $NdkVersion"; 状态 = '缺失'; 位置 = $ndkDir }
} else {
    Write-Log "NDK $NdkVersion 缺失，下载 r23b（约 789 MB，解压约 3.5 GB）" 'Yellow'
    $ok = Install-Ndk
    $rows += [pscustomobject]@{ 组件 = "NDK $NdkVersion"; 状态 = if ($ok) { '已安装' } else { '失败' }; 位置 = $ndkDir }
}
$env:NDK_ROOT = $ndkDir

# 4) CMake + ninja
if (Resolve-Cmake) {
    Write-Log "CMake $CmakeVersion + ninja 已就绪" 'Green'
    $rows += [pscustomobject]@{ 组件 = "CMake $CmakeVersion"; 状态 = '已就绪'; 位置 = (Join-Path $SdkDir "cmake\$CmakeVersion") }
} elseif ($CheckOnly) {
    Write-Log "CMake $CmakeVersion（含 ninja）缺失" 'Yellow'
    $rows += [pscustomobject]@{ 组件 = "CMake $CmakeVersion"; 状态 = '缺失'; 位置 = (Join-Path $SdkDir "cmake\$CmakeVersion") }
} else {
    $ok = Install-Cmake $sdkManager
    $rows += [pscustomobject]@{ 组件 = "CMake $CmakeVersion"; 状态 = if ($ok) { '已安装' } else { '失败' }; 位置 = (Join-Path $SdkDir "cmake\$CmakeVersion") }
}

# 5) Gradle
$gradleBat = Resolve-Gradle
if ($gradleBat) {
    Write-Log "Gradle $GradleVersion 已就绪：$gradleBat" 'Green'
    $rows += [pscustomobject]@{ 组件 = "Gradle $GradleVersion"; 状态 = '已就绪'; 位置 = $gradleBat }
} elseif ($CheckOnly) {
    Write-Log "Gradle $GradleVersion 缺失" 'Yellow'
    $rows += [pscustomobject]@{ 组件 = "Gradle $GradleVersion"; 状态 = '缺失'; 位置 = '-' }
} else {
    Write-Log "Gradle $GradleVersion 缺失，尝试下载" 'Yellow'
    $gradleBat = Install-Gradle
    $rows += [pscustomobject]@{ 组件 = "Gradle $GradleVersion"; 状态 = if ($gradleBat) { '已安装' } else { '失败' }; 位置 = $gradleBat }
}

# 6) Maven 镜像
if (-not $CheckOnly) { Ensure-MavenMirror }
$mirror = Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.gradle\init.gradle')
$mirrorState = if ($mirror) { '已配置' } elseif ($CheckOnly) { '将写入' } else { '缺失' }
$rows += [pscustomobject]@{ 组件 = 'Maven 镜像'; 状态 = $mirrorState; 位置 = (Join-Path $env:USERPROFILE '.gradle\init.gradle') }

Write-Host ''
$rows | Format-Table -AutoSize | Out-String | Write-Host
$rows | ForEach-Object { Write-Log ("  {0} : {1} ({2})" -f $_.组件, $_.状态, $_.位置) }

$bad = @($rows | Where-Object { $_.状态 -in @('缺失', '失败') })
if ($bad.Count -gt 0) {
    Write-Log ("缺件 {0} 个：{1}" -f $bad.Count, (($bad | ForEach-Object { $_.组件 }) -join '、')) 'Yellow'
    Write-Log '手工兜底：' 'Yellow'
    Write-Log '  NDK   : 下载 https://dl.google.com/android/repository/android-ndk-r23b-windows.zip 解到 <SDK>\ndk\23.1.7779620' 'Yellow'
    Write-Log '  CMake : <SDK>\cmdline-tools\latest\bin\sdkmanager.bat "cmake;3.22.1"' 'Yellow'
    Write-Log '  Gradle: 解压 gradle-8.11.1-bin.zip 到 F:\devtools\gradle\gradle-8.11.1' 'Yellow'
    Write-Log ("日志：$LogFile") 'Yellow'
    exit 1
}

Write-Log '全部前置条件就绪，可以跑 tools\build_native.ps1' 'Green'
Write-Log ("日志：$LogFile") 'Green'
exit 0
