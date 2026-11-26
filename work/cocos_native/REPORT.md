# Cocos Creator 原生 Android APK 出包报告

项目：三國群英傳2·豎版重製 · Cocos 客户端骨架（`F:\sanguo\game\cocos`，Creator 3.8.8）
任务：用 Cocos Creator 的 **native（cocos2d-x）构建**产出真正的原生 Android APK，
替换掉之前那个「WebView 壳 + web-mobile」的 `dist\android\sanguo-cocos.apk`。
执行：cocos-native 智能体 · 2026-11-26

---

## 0. 结论速览

| 项 | 值 |
|---|---|
| 成品 | `F:\sanguo\dist\android\sanguo-native.apk` |
| 字节 | **42,034,281** |
| SHA-256 | `8EFF5D4593664AACE29C135AD0E529309EF69DA52D1654B6167AEBF6650EE5E8` |
| package | `com.sanguo.sango2` |
| versionCode / versionName | `1` / `1.0` |
| ABI | **`arm64-v8a`**（`native-code: 'arm64-v8a'`） |
| minSdk / targetSdk / compileSdk | 21 / 34 / 36 |
| 引擎 .so | `lib/arm64-v8a/libcocos.so` = 65,618,256 B（APK 内压缩 19,203,245 B） |
| 签名 | v1(JAR) + v2 均通过，`CN=Android Debug`（debug 包，可直接 adb install） |
| 应用名 | 三國群英傳2·豎版 |
| 启动 Activity | `com.cocos.game.AppActivity` |
| ZIP 条目数 | 3,066 |

**这是真原生包**：`libcocos.so` 由 CMake + ninja 现场编译 568 个编译/链接目标产出
（`[568/568] Linking CXX shared library ...\obj\arm64-v8a\libcocos.so`），
资源以 Cocos 原生 asset 形式打进 `assets/assets/{internal,main,res}`，不走 WebView。

---

## 1. 环境勘察（勘察后确认的事实）

| 组件 | 位置 | 版本 |
|---|---|---|
| Cocos Creator 编辑器 | `F:\sanguo\tools\cocos\cc388\CocosCreator.exe` | 3.8.8（Electron 31.3.1） |
| 引擎 / 原生模板 | `F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine` | 3.8.8 |
| JDK | `F:\devtools\jdk\jdk-17.0.21+9` | Temurin 17.0.21+9 |
| Android SDK | `F:\devtools\android\sdk` | — |
| AGP | 模板 `native\engine\android\build.gradle` | **8.10.1** |
| Gradle | `gradle-wrapper.properties` → 8.11.1 | 8.11.1（本机已缓存） |
| CMake | `F:\devtools\android\sdk\cmake\3.22.1` | 3.22.1（+ 自带 ninja） |
| NDK | `F:\devtools\android\sdk\ndk\23.1.7779620` | r23b / Clang 12.0.8 |
| build-tools | `34.0.0 / 35.0.0 / 36.0.0 / 36.1.0` | 构建实际解析到 35.0.0、36.0.0 |
| platforms | `android-34 / android-36` | — |

勘察时**缺失**的两件（已补）：**没有 NDK**、**没有 gradle 发行版在线可达**。

### 1.1 三个必须知道的坑（不改就会白花时间）

1. **`ELECTRON_RUN_AS_NODE=1` 会让 CocosCreator.exe 退化成 node**。本机 shell 环境里就有这个变量，
   不 `Remove-Item Env:\ELECTRON_RUN_AS_NODE` 的话，`--help` 打印的是 node 自己的帮助、`--project` 报 bad option，
   看起来像「构建失败」。
2. **CLI 成功也返回非 0 退出码**（实测 34 / 36）。唯一成功判据是日志里出现
   `build Task (android) Finished` 且产物目录存在。
3. **CLI 的 `--build "packageName=xxx"` 进不了 `options.packages.android`**，会被当成顶层键丢弃，
   随后报 `构建参数 options.packages.android.packageName("") 校验失败, 该选项为必填项，不允许为空`。
   原生平台参数必须走 `configPath` 的 JSON。

---

## 2. NDK 安装

`sdkmanager` 可用（`F:\devtools\android\sdk\cmdline-tools\latest\bin\sdkmanager.bat`），
但直接下官方包更快（本机到 dl.google.com 是通的）：

```
https://dl.google.com/android/repository/android-ndk-r23b-windows.zip
```

| 项 | 值 |
|---|---|
| 下载字节 | 788,638,042（6 秒，`curl.exe -L --retry 5 -C -`） |
| 解压 | `tar.exe -xf <zip> -C F:\devtools\android\ndk`，7,925 条目，exit 0 |
| `source.properties` `Pkg.Revision` | **23.1.7779620**（r23b 是 23.1.x，不是 23.2.x） |
| 最终路径 | **`F:\devtools\android\sdk\ndk\23.1.7779620`** |
| 占用 | **2,594,612,807 B（2,474 MB），7,447 个文件** |

为什么最后放进 `sdk\ndk\<version>` 而不是 `F:\devtools\android\ndk\...`：
**AGP 8.x 忽略 `local.properties` 里的 `ndk.dir`**，只认 `$sdk.dir\ndk\<ndkVersion>` 加
`gradle.properties` 的 `PROP_NDK_VERSION`。放外面会报找不到 NDK。

顺带补的：`sdkmanager "cmake;3.22.1"` → `F:\devtools\android\sdk\cmake\3.22.1\bin\ninja.exe`。
模板 `app\build.gradle` 写死 `cmake { version "3.22.1" }`，而 Cocos 自带的 cmake 是 3.24.3 且**没有 ninja**，
不装这个 AGP 的 externalNativeBuild 跑不起来。

---

## 3. 生成原生工程

### 3.1 实际可用的 CLI 形态

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:JAVA_HOME='F:\devtools\jdk\jdk-17.0.21+9'
$env:ANDROID_SDK_ROOT='F:\devtools\android\sdk'
$env:NDK_ROOT='F:\devtools\android\sdk\ndk\23.1.7779620'
& F:\sanguo\tools\cocos\cc388\CocosCreator.exe --project F:/sanguo/game/cocos `
    --build "configPath=F:/sanguo/work/cocos_native/build_android.json"
```

`F:\sanguo\work\cocos_native\build_android.json`（实际生效的那份）：

```json
{
  "platform": "android",
  "name": "android",
  "outputName": "android",
  "debug": true,
  "md5Cache": false,
  "buildPath": "F:/sanguo/game/cocos-build-native",
  "startScene": "0b007000-1a2b-4c3d-8e4f-000000000001",
  "packages": {
    "android": {
      "packageName": "com.sanguo.sango2",
      "sdkPath": "F:/devtools/android/sdk",
      "ndkPath": "F:/devtools/android/sdk/ndk/23.1.7779620",
      "javaHome": "F:/devtools/jdk/jdk-17.0.21+9",
      "javaPath": "",
      "apiLevel": 34,
      "appABIs": ["arm64-v8a"],
      "androidInstant": false,
      "appBundle": false,
      "inputSDK": false,
      "maxAspectRatio": "2.1",
      "resizeableActivity": false,
      "orientation": { "portrait": true, "upsideDown": false, "landscapeLeft": false, "landscapeRight": false },
      "keystorePath": "", "keystorePassword": "", "keystoreAlias": "", "keystoreAliasPassword": ""
    }
  }
}
```

日志实证：
- `android_2.log` → `2026-11-26 08:37:20 - debug: ==== build Task (android) Finished in (25 s)ms ====`
- `android_3.log` → `2026-11-26 08:40:10 - debug: ==== build Task (android) Finished in (8 s)ms ====`（改包名后重建）

### 3.2 生成的目录

```
F:\sanguo\game\cocos\native\engine\            ← 原生工程模板落地（生成 08:39:08）
├─ android\
│  ├─ app\{build.gradle, AndroidManifest.xml, src\com\cocos\game\AppActivity.java, libs\}
│  ├─ instantapp\ , res\values\strings.xml , build.gradle , CMakeLists.txt , build-cfg.json
└─ common\{Classes\Game.cpp, CMakeLists.txt, localCfg.cmake, xr.cmake, cocos-version.json}

F:\sanguo\game\cocos-build-native\android\   ← buildPath 产物
├─ data\        ← 会被当成 APK 的 assets\ 打进去（settings.json 08:40:10）
├─ proj\        ← gradle 根工程（gradlew.bat / build.gradle / settings.gradle / gradle.properties / local.properties）
└─ assets → data（符号链接）
```

`proj\gradle.properties` 关键值（`updateAndroidGradleValues()` 生成，**`PROP_NDK_VERSION` 是自动写对的**）：

```
PROP_COMPILE_SDK_VERSION=36     PROP_MIN_SDK_VERSION=21      PROP_TARGET_SDK_VERSION=34
PROP_BUILD_TOOLS_VERSION=36.0.0 PROP_NDK_VERSION=23.1.7779620 PROP_APP_ABI=arm64-v8a
APPLICATION_ID=com.sanguo.sango2  PROP_IS_DEBUG=true         PROP_APP_NAME=android
RES_PATH=F:/sanguo/game/cocos-build-native/android
NATIVE_DIR=F:/sanguo/game/cocos/native/engine/android
COCOS_ENGINE_PATH=F:/sanguo/tools/cocos/cc388/resources/resources/3d/engine/native
```

`proj\settings.gradle` 中 `project(':app').name = "android"` → gradle 任务是 **`:android:assembleDebug`**。

### 3.3 重要认知：Cocos CLI 这版**不跑 gradle**

Cocos 3.8.8 的 CLI 构建只做「生成原生工程 + 编译资源包」，不产出 APK、不生成 `publish\`。
`native-pack-tool\lib\platforms\android.js` 里 `make()` 确实会调 `gradlew.bat :assembleDebug`，
但 CLI 走的是 `create()` 分支。**gradle 必须自己起**，见下一节。

---

## 4. gradle 报错与修法（按踩坑顺序）

| # | 完整错误行 | 根因 | 修法 |
|---|---|---|---|
| 1 | `java.net.ConnectException: Connection timed out: connect` @ `org.gradle.wrapper.Install.createDist` | `gradlew.bat` 要去 `services.gradle.org` 下 8.11.1 发行版，本机网络超时 | 直接调用本机已缓存的 gradle：`C:\Users\liutian\.gradle\wrapper\dists\gradle-8.11.1-bin\bpt9gzteqjrbo1mjrsomdt32c\gradle-8.11.1\bin\gradle.bat`（同目录 `.ok` 标记齐全），绕开 wrapper |
| 2 | 依赖解析卡死 / `Could not resolve com.android.tools.build:gradle:8.10.1` | `repo1.maven.org`（Maven Central）本机不可达；`dl.google.com` 正常 | 把 `google() / mavenCentral()` 仓库块换成 `google() + aliyun 镜像（public / gradle-plugin / google）`，改动 `native\engine\android\build.gradle`（2 处）与 `proj\build.gradle`（1 处） |
| 3 | `Namespace 'com.sanguo.native' is not a valid Java package name as 'native' is a Java keyword.`（`native\engine\android\app\build.gradle` 第 13 行 `namespace APPLICATION_ID`） | 包名末段用了 Java 关键字 `native` | `packageName` 改 **`com.sanguo.sango2`**，重跑 Cocos 构建（8 s） |
| 4 | `Resource and asset merger: Duplicate resources` — `[string/app_name] ...native\engine\android\res\values\strings.xml` 与 `...proj\res\values\strings.xml` | `generateAppNameValues()` 见模板里没有 `app_name` 就再写一份到 `proj\res\values\` | 中文名只写在 `native\engine\android\res\values\strings.xml`（`三國群英傳2·豎版`，`translatable="false"`），删掉 `proj\res\values\strings.xml`；此后 `generateAppNameValues()` 检测到已存在就跳过，不会再生 |
| 5 | AGP 自动装 `Android SDK Build-Tools 35 v.35.0.0` | `PROP_BUILD_TOOLS_VERSION=36.0.0` 之外 AGP 还要 35 | 已自动安装并接受 license，无需处理（记录备查） |

最终构建：

```
BUILD SUCCESSFUL in 1m 28s
70 actionable tasks: 59 executed, 11 up-to-date
```

编译链实证（`gradle_5.log`）：

```
> Task :android:configureCMakeDebug[arm64-v8a]
C/C++: -- Android: Targeting API '21' with architecture 'arm64', ABI 'arm64-v8a', and processor 'aarch64'
C/C++: -- The CXX compiler identification is Clang 12.0.8
C/C++: -- OPTION USE_SE_V8: ON / CC_USE_GLES3: ON / USE_AUDIO: ON / USE_EDIT_BOX: ON
C/C++: ninja: Entering directory `...\build\Debug\184h2k4p\arm64-v8a'
C/C++: [568/568] Linking CXX shared library ...\obj\arm64-v8a\libcocos.so
```

（spine / dragonbones / video / webview / physx / xr 全 OFF，符合本项目 2D 需求。）

---

## 5. APK 验证

### 5.1 badging（`aapt2 dump badging`）

```
package: name='com.sanguo.sango2' versionCode='1' versionName='1.0'
         platformBuildVersionName='16' platformBuildVersionCode='36'
         compileSdkVersion='36' compileSdkVersionCodename='16'
sdkVersion:'21'
targetSdkVersion:'34'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.ACCESS_NETWORK_STATE'
uses-permission: name='android.permission.ACCESS_WIFI_STATE'
uses-permission: name='com.android.vending.BILLING'
application-label:'三國群英傳2·豎版'
application: label='三國群英傳2·豎版' icon='res/mipmap-mdpi-v4/ic_launcher.png'
launchable-activity: name='com.cocos.game.AppActivity'
native-code: 'arm64-v8a'
```

### 5.2 签名（`apksigner verify --print-certs`）

```
Verifies
Verified using v1 scheme (JAR signing): true
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 1
Signer #1 certificate DN: C=US, O=Android, CN=Android Debug
Signer #1 certificate SHA-256 digest: 25d18b2b384c172f6479464334e82c02f68eae01903f4e8683bb16ad2b696e84
```

### 5.3 ZIP 内容（3,066 条目）

| 扩展名 | 条目 | 解压字节 | 压缩字节 |
|---|---|---|---|
| `.so` | 1 | 65,618,256 | 19,203,245 |
| `.png` | 186 | 7,903,943 | 7,903,943 |
| `.mp3` | **109** | **6,298,093** | 6,298,093 |
| `.js` | 10 | 5,361,511 | 1,491,293 |
| `.webp` | **1,210** | **5,132,148** | 5,132,148 |
| `.json` | 1,537 | 2,689,128 | 567,543 |
| `.dex` | 4 | 667,760 | 325,831 |
| `.bin` | 2 | 266,763 | 66,647 |
| 其它（.sf/.mf/.rsa/.xml/.arsc/.gz/.properties） | — | — | — |

顶层目录：

| 路径 | 文件数 | 字节 |
|---|---|---|
| `lib/arm64-v8a/libcocos.so` | 1 | 65,618,256（压缩 19,203,245） |
| `assets/` | 3,049 | 27,591,213 |
| `classes*.dex` | 4 | 667,760 |
| `res/`（图标等） | 5 | 60,373 |
| `META-INF/` | 4 | 880,284 |

`libcocos.so` 三个形态（可核对是否被 strip）：

| 阶段 | 路径 | 字节 |
|---|---|---|
| 链接产物（未 strip） | `proj\build\android\intermediates\cxx\Debug\184h2k4p\obj\arm64-v8a\libcocos.so` | 375,391,832 |
| merged | `...\merged_native_libs\debug\...\out\lib\arm64-v8a\libcocos.so` | 375,391,832 |
| **strip 后进 APK** | `...\stripped_native_libs\debug\...\out\lib\arm64-v8a\libcocos.so` | **65,618,256** |

### 5.4 可复现性

用新写的 `tools\build_native.ps1 -SkipSyncCheck -SkipCocosBuild` 重跑一次 gradle（8 s，全 up-to-date），
重新交付的 APK **SHA-256 与首次完全一致**（`8EFF5D45…0EE5E8`），42,034,281 B。

---

## 6. 三份资源证据（「资源在包里，且会加载」）

### 6.1 ① `settings.json` 的 bundles / remoteBundles / preloadBundles

直接从 **APK 内** `assets/src/settings.json`（22,310 B）解出来的 `assets` 段：

```json
{
  "server": "",
  "remoteBundles": [],
  "subpackages": [],
  "preloadBundles": [{ "bundle": "main" }],
  "bundleVers": {},
  "preloadAssets": [],
  "projectBundles": ["internal", "main", "res"],
  "downloadMaxConcurrency": 15
}
```

- `res` **不在** `remoteBundles`（该数组为空）→ 不会走远程下载；
- `res` **在** `projectBundles` 里 → 会作为内置 bundle 装载；
- `launch.launchScene = "db://assets/scene/Boot.scene"`；`screen.designResolution = 750×1334 policy 2`；
  `engine.platform = "android"`、`engine.debug = true`。

### 6.2 ② `assets/assets/res/` 的内部结构（APK 内实测）

`res` bundle 顶层只有 4 项，**和 web 版的 `config.json` + `index.js` 布局不同**（原生用 `cc.config.json`）：

| 项 | 字节 |
|---|---|
| `cc.config.json` | 635,172 |
| `index.js` | 606 |
| `import/<2hex>/<uuid>.json` | 1,525 个 / 1,842,241 |
| `native/<2hex>/<uuid>.<ext>` | 1,501 个 / 19,534,819 |

（合计 2 + 1,525 + 1,501 = 3,028 个文件 / 22,012,838 B，与 6.3 的 res 总量对得上。）

`cc.config.json` 解析：`name="res"`、`uuids=2916`、`paths=2915`、`hasPreloadScript=true`、
`importBase="import"`、`nativeBase="native"`、`deps=[]`。

`res/native/**` 扩展名分布（就是这些资源本体）：

| 扩展名 | 个数 | 字节 |
|---|---|---|
| `.webp` | 1,210 | 5,132,148 |
| `.png` | 181 | 7,843,570 |
| `.mp3` | **109** | **6,298,093** |
| `.bin` | 1 | 261,008 |

bundle 路径表（`paths` 的 key 语义）按一级目录统计：

| 目录 | 路径数 | 说明 |
|---|---|---|
| `face` | **1,601** | `face/full/*` **800**（400 张半身像 × sprite-frame+texture）、`face/thumb/*` **800**（400 张头像 × 2） |
| `hero` | 800 | 武将立绘/帧 |
| `bg` | 122 | |
| `items` | 114 | |
| `audio` | **109** | 与 109 个 mp3 一一对应（路径无扩展名，如 `audio/bgm/03`） |
| `anim` | 71 | |
| `ui` | 66 | |
| `data` | 17 | |
| `map` | 12 | |
| `audio-manifest` / `audio-remote` / `manifest` | 各 1 | |

#### 抽查：源 `.meta` 的 uuid → 构建产物文件（字节逐一比对，全部命中）

| 源资源 | uuid | 源字节 | 构建产物字节 |
|---|---|---|---|
| `face/full/001.webp` | `f75454ca-7369-41c8-9b01-fdfd1f734594` | 4,216 | 4,216 ✔ |
| `face/full/002.webp` | `9c342669-594e-46ab-9199-5343c4a133b4` | 4,374 | 4,374 ✔ |
| `face/full/150.webp` | `8a6b0736-780e-4782-a126-e3d9fe9bca30` | 4,828 | 4,828 ✔ |
| `face/thumb/001.webp` | `b2176951-3b2d-41d6-b33e-b49126e36c90` | 718 | 718 ✔ |
| `face/thumb/002.webp` | `d1358ea3-8d8e-42fb-aa37-fae3898199c9` | 678 | 678 ✔ |
| `face/thumb/150.webp` | `b2f89635-6fd4-4371-bac2-84564bc804d4` | 810 | 810 ✔ |
| `audio/bgm/03.mp3` | `c81ab6ad-42f8-4576-aeb3-3d4baed5fbbf` | 490,977 | 490,977 ✔ |
| `audio/bgm/04.mp3` | `b5c06cea-e8ad-46fa-81d2-3707096e5b7d` | 663,201 | 663,201 ✔ |
| `audio/bgm/05.mp3` | `9fb2b8a0-29be-4d9d-a06d-414e756614ed` | 535,761 | 535,761 ✔ |

产物文件名形如 `native\f7\f75454ca-....webp`、`native\c8\c81ab6ad-....mp3`（前两位 hex 分目录）。

### 6.3 ③ APK 内 .png/.webp/.mp3 统计 + 与 `web-mobile` 的体量对比

| 类型 | APK 内（含 app 图标） | 其中 res bundle | web-mobile 对照 | 差异 |
|---|---|---|---|---|
| `.webp` | 1,210 / 5,132,148 B | 1,210 / 5,132,148 B | 1,210 / 5,132,148 B | **0** |
| `.png` | 186 / 7,903,943 B | 181 / 7,843,570 B | 181 / 7,843,570 B | **0** |
| `.mp3` | **109 / 6,298,093 B** | 109 / 6,298,093 B | 109 / 6,298,093 B | **0** |
| `res` bundle 合计 | — | **3,028 文件 / 22,012,838 B（20.99 MB）** | 3,028 文件 / 21,578,535 B（20.58 MB） | **+434,303 B = +2.01%** |

`res` 包体 +2.01%，远在 ±10% 以内。差异**全部来自 json 元数据**，多媒体本体逐字节相同：

| 子目录 | native | web-mobile | 差异 |
|---|---|---|---|
| `res/native/**`（图片/音频本体） | 1,501 个 / **19,534,819 B** | 1,501 个 / **19,534,819 B** | **0 B（完全一致）** |
| `res/import/**`（资源 json） | 1,525 个 / 1,842,241 B | 1,525 个 / 1,822,767 B | +19,474 B |
| `res/` 根（bundle 配置） | `cc.config.json`+`index.js` = 635,778 B | `config.ef49b.json`+`index.ef49b.js` = 220,949 B | +414,829 B |
| 合计 | 3,028 / 22,012,838 B | 3,028 / 21,578,535 B | **+434,303 B（+2.01%）** |

原生包的 `native/**` 与 web 版**一字不差**（同 1,501 个文件、同 19,534,819 B），
说明图片和音频既没被压缩转码、也没被裁剪；差额全部落在 bundle 配置与 json 序列化格式上
（原生把散装 uuid.json 打得更平、`cc.config.json` 承载了更多路径/依赖元信息）。

### 6.4 全包证据：音频确实在 APK 里、无需 CDN

- APK 内 `.mp3` = **109 个 / 6,298,093 B**；
- 源 `game\cocos\assets\bundles\res\audio` = **109 个 mp3 / 6,298,093 B**；
- 字节数**完全相等** → 一个不少、一个没转码、没有「按需远程拉」；
- `settings.json` 里 `server:""`、`remoteBundles:[]`，Res 包里 `audio-remote.json` 虽存在但对应 `audio/bgm/*` 的本地 mp3 全在包内。

结论：**完整包（全美术 + 全音频），无 CDN、无静音截断。**

### 6.5 与 proven-good `web-mobile\src\settings.ffbeb.json` 的逐字段 diff

| 字段 | web-mobile（对照，已验证头像正常） | native（本包） | 判定 |
|---|---|---|---|
| `CocosEngine` | `3.8.8` | `3.8.8` | 同 |
| `assets.server` | `""` | `""` | 同 |
| `assets.remoteBundles` | `[]` | `[]` | 同 |
| `assets.subpackages` | `[]` | `[]` | 同 |
| `assets.preloadBundles` | `[{bundle:"main"}]` | `[{bundle:"main"}]` | 同 |
| `assets.preloadAssets` | `[]` | `[]` | 同 |
| `assets.projectBundles` | `["internal","main","res"]` | `["internal","main","res"]` | 同 |
| `assets.downloadMaxConcurrency` | `15` | `15` | 同 |
| `assets.bundleVers` | `{internal:"d4a47", main:"e2db0", res:"ef49b"}` | `{}` | **差异（有意）** |
| `launch.launchScene` | `db://assets/scene/Boot.scene` | `db://assets/scene/Boot.scene` | 同 |
| `screen.designResolution` | `750×1334, policy 2` | `750×1334, policy 2` | 同 |
| `screen.exactFitScreen` | `true` | `true` | 同 |
| `engine.platform` | `web-mobile` | `android` | 平台字段，应不同 |
| `engine.debug` | `false` | `true` | debug 包，应不同 |

**唯一需要解释的差异是 `bundleVers`。** 原因是 `md5Cache`：
web 对照用的是 `md5Cache=true`，产物文件名带 hash（`config.ef49b.json`、`index.ef49b.js`），所以必须有 `bundleVers` 把 hash 告诉加载器；
本包用 `md5Cache=false`，产物是**无 hash 的 `cc.config.json` / `index.js`**，此时 `bundleVers` 必须为空——
如果照抄 `{res:"ef49b"}` 反而会让加载器去找 `config.ef49b.json` 而 404。

**配置改动说明（before / after）**：`md5Cache` 由 web 版的 `true` 改为本包的 `false`。
除此之外**没有**改动任何 bundle 路由配置：`remoteBundles` 保持 `[]`，`res` 未被挪进远程，`subpackages` 保持 `[]`，
也没有裁剪任何资源（`res` 3028 文件/22.0 MB，与对照同构同量）。
即：**没有为了「能出包」而牺牲任何资源**。

结论：`res` 是内置 bundle、`remoteBundles` 为空、`projectBundles` 含 `res`，
与已验证能正常显示头像的 web-mobile 配置**语义一致**，唯一差异是随 `md5Cache` 变化的 `bundleVers`。
再加上 6.2 的产物级抽查（face/full、face/thumb、audio 各命中且字节一致），
资源「在包里」与「定义正确、会被加载」两侧证据链闭合。

---

## 7. 复跑命令

新建脚本：**`F:\sanguo\tools\build_native.ps1`**（UTF-8 **带 BOM**，`Parser::ParseFile` 校验 `parseErrors=0`）。

```powershell
# 标准出包（含同步闸门 → Cocos 构建 → gradle → 交付）
pwsh -File F:\sanguo\tools\build_native.ps1

# 只重跑 gradle（资源/PHP 侧没动过时最省时间，实测 8 s）
pwsh -File F:\sanguo\tools\build_native.ps1 -SkipSyncCheck -SkipCocosBuild

# 强制重新生成原生模板 + 全量重编（约 1.5 min 起）
pwsh -File F:\sanguo\tools\build_native.ps1 -Clean

# 换交付路径
pwsh -File F:\sanguo\tools\build_native.ps1 -OutApk D:\tmp\test.apk
```

脚本干了什么（对应本次踩的坑，改之前先读注释）：

1. 检查 `CocosCreator.exe` / SDK / NDK / JDK 存在，导出 `JAVA_HOME`、`ANDROID_SDK_ROOT`、`NDK_ROOT`；
2. `node work\cocos_sync\sync_core3.mjs --diff-only`，若「有差异」> 0 直接抛错中止（不出半成品包）；
3. 写 `work\cocos_native\build_android.json`，`Remove-Item Env:\ELECTRON_RUN_AS_NODE`，
   以 `--build "configPath=..."` 调 CLI，成功判据是日志含 `build Task (android) Finished`（不看退出码）；
4. 构建后修补：删重复 `proj\res\values\strings.xml`；`mavenCentral()` → aliyun 镜像（幂等）；
   校正 `gradle.properties` 的 `PROP_NDK_VERSION/PROP_APP_ABI/APPLICATION_ID`；
5. 找本机缓存的 `gradle-8.11.1\bin\gradle.bat`（优先带 `.ok` 的那份），`cmd /c` 套一层跑
   `-p <proj> --no-daemon --console=plain :android:assembleDebug`，判 `BUILD SUCCESSFUL`；
6. 复制到 `dist\android\sanguo-native.apk`，打印 badging、字节、SHA-256，
   并自检 `projectBundles` / `remoteBundles` / `res` 的 mp3 数量。

### 手动等价命令（脚本坏了的兜底）

```powershell
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:JAVA_HOME='F:\devtools\jdk\jdk-17.0.21+9'
& F:\sanguo\tools\cocos\cc388\CocosCreator.exe --project F:/sanguo/game/cocos `
  --build "configPath=F:/sanguo/work/cocos_native/build_android.json"

& 'C:\Users\liutian\.gradle\wrapper\dists\gradle-8.11.1-bin\bpt9gzteqjrbo1mjrsomdt32c\gradle-8.11.1\bin\gradle.bat' `
  -p F:\sanguo\game\cocos-build-native\android\proj --no-daemon --console=plain :android:assembleDebug

Copy-Item F:\sanguo\game\cocos-build-native\android\proj\build\android\outputs\apk\debug\android-debug.apk `
          F:\sanguo\dist\android\sanguo-native.apk -Force
```

---

## 8. 已知限制 / 备注

1. **只出 `arm64-v8a`**（`appABIs:["arm64-v8a"]`）。要出 32 位或双 ABI，把 `appABIs` 加 `"armeabi-v7a"`，
   并把 `PROP_APP_ABI` 写成 `arm64-v8a:armeabi-v7a`；代价是 `.so` 编译时间与包体翻倍。
   当前主流设备均为 arm64，暂按单 ABI 交付。
2. **debug 包**（`debug:true`、`PROP_IS_DEBUG=true`，Android Debug 证书签名）。
   可直接 `adb install`，但上架需要 release keystore + `-Clean` 重编。
3. `md5Cache=false` 会导致 `settings.json` 的 `bundleVers` 为空表——这是自洽状态，不是缺陷（见 6.5）。
4. 构建链依赖本机三处「非官方默认」配置，换机需重做：
   ① NDK 必须落在 `sdk\ndk\23.1.7779620`；② 需要 `cmake;3.22.1`（含 ninja）；
   ③ Maven 仓库要换 aliyun 镜像（本机 `repo1.maven.org` 不通）。脚本已把 ②③ 幂等化，①靠文档约束。
5. `sdkmanager` 会警告 `Warning: SDK XML version 4 is higher than supported 3`——不影响使用。
6. 脚本控制台输出在 GBK 代码页下重定向时中文可能显示为乱码（脚本内已设 `[Console]::OutputEncoding = UTF8`，
   老终端仍可能乱），不影响构建结果与文件内容。

---

## 9. 交付物清单

| 文件 | 说明 |
|---|---|
| `F:\sanguo\dist\android\sanguo-native.apk` | **原生 APK**，42,034,281 B，SHA-256 `8EFF5D45…0EE5E8` |
| `F:\sanguo\tools\build_native.ps1` | 一键复跑脚本（UTF-8 BOM，parseErrors=0） |
| `F:\sanguo\work\cocos_native\REPORT.md` | 本报告 |
| `F:\sanguo\work\cocos_native\build_android.json` | 生效的构建配置 |
| `F:\sanguo\work\cocos_native\android_2.log` / `android_3.log` | Cocos 构建日志（含 `build Task (android) Finished`） |
| `F:\sanguo\work\cocos_native\gradle_5.log` | 成功的 gradle 日志（568 目标、BUILD SUCCESSFUL） |
| `F:\sanguo\game\cocos\native\engine\**` | 生成的原生工程（app / res / CMakeLists / build.gradle） |
| `F:\sanguo\game\cocos-build-native\android\{data,proj}\` | 资源产物 + gradle 工程 |

未改动：`F:\sanguo\project\**`、`game\src\**`、`game\web\**`、`game\tests\**`、`tools\build_wechat.ps1`、`apk\**`。
未使用 git。
