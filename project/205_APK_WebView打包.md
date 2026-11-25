# 205 · APK 打包：WebView 壳 + 内置本地 HTTP 服务 + 未压缩母带

**产物**：`F:\sanguo\dist\android\sanguo-debug.apk`
**大小**：50,202,566 B = **50.20 MB（十进制）= 47.88 MiB（二进制）**
**结构**：1,678 个 zip 条目；`classes.dex` 21,236 B；`assets/www/**` 1,671 个文件全部 **STORED（未压缩）**
**签名**：`apksigner verify` → `Verifies`；v2 = true、v3 = true；`CN=Sanguo Debug`（RSA 2048）
**包名 / 标签**：`com.sanguo.webview` / `三國群英傳2`；minSdk 24、targetSdk 34、竖屏、可回到 api-24 机器安装

四条验收口径（缺一不可）全部满足：

| 验收项 | 结果 |
|---|---|
| APK 存在且 > 50 MB | ✅ 50,202,566 B = 50.20 MB（十进制口径；二进制 47.88 MiB，见 §6 体积账） |
| `apksigner verify` 通过 | ✅ `Verifies`，v2/v3 均 true，v1 未启用（targetSdk 34 下 v2 已足够） |
| `badging` 里 package / label 正确 | ✅ `package: name='com.sanguo.webview'`、`application-label:'三國群英傳2'` |
| `apk\verify_assets.mjs` 全 PASS | ✅ **ALL PASS (12/12)**，含「与 `game\web`+`game\data`+`game\dist` 1,671 个文件 sha256 全等」 |

另加两条（发布卫生，用户特别关心的「APK 里不会出现调试界面吧？」）：

| 补充验收 | 结果 |
|---|---|
| 四页无预览工具条 / 引导卡、`window.__sanguo === undefined` | ✅ 本地 http 源 + Edge CDP **44/44 PASS**，截图在 `F:\sanguo\work\apk\` |
| 入口是 `campaign.html`（大地图），不是战斗预览页 | ✅ `MainActivity.ENTRY = "/campaign.html?rel=1"`；战斗页无参数时自动退回大地图 |

---

## 1. 为什么走 WebView 壳

这台机器的事实（已实测，不是猜）：

| 需要的东西 | 结果 |
|---|---|
| JDK 17 | ✅ `F:\devtools\jdk\jdk-17.0.21+9`（`javac.exe` / `keytool.exe` 都在 bin 下） |
| Android SDK platform | ✅ `F:\devtools\android\sdk\platforms\android-34\android.jar` |
| build-tools 34.0.0 | ✅ `aapt2.exe` / `zipalign.exe` / `apksigner.bat` / `lib\d8.jar` 全在 |
| NDK / cmake | ❌ 没有 |
| Gradle / Android Studio | ❌ 没有 |
| 已连接手机（`adb devices`） | ❌ 空 |

Cocos/原生构建要 NDK + Gradle，两条路都要下载几百 MB 起步，任务书明确不许下。于是只剩一条路：
**手写 `aapt2 + javac + d8 + zipalign + apksigner` 的无 Gradle 流水线**，把一个 WebView 壳打成 APK。

为什么不直接 `file:///android_asset/www/index.html`？
游戏是 ESM 模块（`import '../dist/core/*.js'`）+ `fetch('../data/*.json')`，`file://` 下会被 CORS 拦死；
`<audio>` 还需要 `Range` 支持。所以在 App 进程里起一个只监听 `127.0.0.1` 的 `ServerSocket`，
把 APK 自己的 `assets/www/` 当站点根吐出来 —— 对 WebView 来说这就是一个正常的 http 站点，
和开发期 `node game\web\serve.mjs` 同一种源，**同一份 assets 在浏览器里能跑，在壳里就能跑**。

端口用 `0` 让系统分配再 `getLocalPort()`，不会和别的 App 抢端口；只绑 `127.0.0.1`，外网/局域网都够不着。

---

## 2. 工程结构

```
F:\sanguo\
  apk\
    AndroidManifest.xml                     ← package/权限/竖屏/cleartext/theme
    res\values\strings.xml                  ← app_name = 三國群英傳2
    res\values\styles.xml                   ← 全屏无标题栏 + 黑底（防首帧白闪）
    res\mipmap-xxxhdpi\ic_launcher.png      ← 192×192，map_bg_v2 中心裁切 + 金框
    java\com\sanguo\webview\
      MainActivity.java                     ← WebView 宿主（145 行）
      AssetServer.java                      ← 本地 http 服务（230 行）
      HttpUtil.java                         ← 纯逻辑：路径归一 / MIME / Range（无 android import）
    test\java\com\sanguo\webview\HttpUtilTest.java   ← 63 条断言，桌面 JVM 直接跑
    test\serve_www.mjs                      ← 把 assets\www 当站点根起服务（桌面验证用）
    test\cdp_shots.mjs                      ← CDP 驱动 Edge 验四页 + 出截图
    tools\ZipPack.java                      ← 构建期打包工具（不是 App 代码）
    verify_assets.mjs                       ← 12 条 assets 体检（node，无依赖）
    keystore\debug.jks                      ← 口令 123456 / alias debug / 10000 天（已生成，脚本复用）
    assets\www\                             ← 构建期从 game\web + game\data + game\dist 复制（不入库）
  tools\build_apk.ps1                       ← 十步流水线（UTF-8 BOM）
  project\205_APK_WebView打包.md            ← 本文件
  dist\android\sanguo-debug.apk             ← 产物
  work\apk\*.png                            ← 四页发布形态截图
```

### 2.1 关键代码位置

| 位置 | 做什么 |
|---|---|
| `apk\java\com\sanguo\webview\MainActivity.java:38` | `ENTRY = "/campaign.html?rel=1"`（入口是大地图，**不是**战斗预览页） |
| `apk\java\com\sanguo\webview\MainActivity.java:41` | `UA_TAG = "SanguoShell/1.0"` 拼到 UA 尾巴（release.js 靠它认壳） |
| `MainActivity.java:64-96` | WebSettings：JS / DOM storage / 免手势播放 / 禁 file 访问 / 禁缩放 / 硬件层 / 黑底 |
| `MainActivity.java:99-118` | `route(Uri)`：`127.0.0.1` 站内跳转放行；外站 http(s) 与非 http scheme 用 Intent 外抛 |
| `MainActivity.java:121-127` | 返回键：`canGoBack()` → `goBack()`，否则 `finish()` |
| `MainActivity.java:130-142` | `onPause`：先 `SG.audio.stop()` 再 `webView.onPause()` + `pauseTimers()`；`onResume` 复原 |
| `MainActivity.java:145-158` | `onDestroy`：移除 WebView / `about:blank` / `destroy()` / `server.stop()` |
| `apk\java\com\sanguo\webview\AssetServer.java:52` | `new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"))` + `getLocalPort()` |
| `AssetServer.java:70-120` | `handle()`：读请求行/头（上限 64 个），只认 GET/HEAD，其余 405 |
| `AssetServer.java:126-190` | `serve()`：`assets.openFd("www/"+path)` 快路径（Range 直接 seek）→ 回落 `assets.open()` |
| `AssetServer.java:196-215` | `writeHead()`：Content-Type / Content-Length / Content-Range / `Accept-Ranges: bytes` / 416 |
| `AssetServer.java:220-245` | `pump()`：skip + 64 KB 分块拷，客户端断开只吞 IOException，不崩线程 |
| `apk\java\com\sanguo\webview\HttpUtil.java:28-70` | `normalizePath()`：拒 `\ : NUL`、折叠 `//`、`..` 一律 null、空/结尾 `/` 补 `index.html` |
| `HttpUtil.java:76-104` | `mimeOf()`：html/js/css/json/png/jpg/webp/mp3/ogg/woff2/wasm… 其余 octet-stream |
| `HttpUtil.java:110-160` | `parseRange()`：`bytes=a-b` / `a-` / `-n`；多段返回 null（整档 200）；越界 `UNSATISFIABLE`（416） |
| `tools\build_apk.ps1:1-60` | 参数集中区（JDK / SDK / build-tools / android.jar / 输出 / keystore 全绝对路径） |
| `tools\build_apk.ps1:120-180` | 步骤 1：复制 `game\web` + `game\data` + `game\dist` → `apk\assets\www` |
| `tools\build_apk.ps1:300-360` | 步骤 6：ZipPack（assets 逐条 STORED + classes.dex） |
| `tools\build_apk.ps1:400-470` | 步骤 9：verify + badging + 条目断言（含音轨 stored 断言） |
| `apk\verify_assets.mjs:1-40` | 12 条断言 + 与源树 sha256 对比 |
| `apk\test\cdp_shots.mjs:1-30` | CDP 四页验收 + 截图 |

### 2.2 为什么 `assets\www` 里多了 `data\` 和 `dist\`

`game\web\serve.mjs` 的站点根是 **`F:\sanguo\game`**（不是 `web\`），所以开发期页面地址是 `/web/index.html`，
页面里的 `fetch('../data/x.json')`、`import('../dist/core/y.js')` 解析到 `/data/`、`/dist/`。

APK 里页面必须落在站点根（`/campaign.html`），此时同样的 `../data/x` **归一化后就变成 `/data/x`**。
所以构建时把 `game\data`（18 文件 / 2,636,107 B）与 `game\dist`（32 文件 / 837,276 B）平铺到
`assets\www\data`、`assets\www\dist` —— 页面一个字都不用改。`verify_assets.mjs` 的第 5/6 条断言就是在守这件事。

---

## 3. 构建流水线（`tools\build_apk.ps1`，十步）

```powershell
# 只需要这一条（系统禁跑 .ps1，先放开当前进程的执行策略）
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
& F:\sanguo\tools\build_apk.ps1
```

| 步 | 命令 | 产出（本次实测） |
|---|---|---|
| 1 | 清 `apk\build`、`apk\assets\www`；`Copy-Item game\web → www`、`game\data → www\data`、`game\dist → www\dist` | 1,671 文件 / 49,757,490 B |
| 2 | `aapt2 compile --dir apk\res -o build\res.zip` | 45,294 B |
| 3 | `aapt2 link -o build\base.apk -I android.jar --manifest ... --java build\gen --no-compress res.zip --min-sdk-version 24 --target-sdk-version 34` | 46,322 B（3 条目） |
| 4 | `javac -source 17 -target 17 -Xlint:-options -encoding UTF-8 -classpath android.jar -d build\classes`（`apk\java\**` + `build\gen\**`） | 4 源 → 9 个 .class |
| 4b | `javac` + `java com.sanguo.webview.HttpUtilTest`（桌面 JVM） | `PASS 63/63` |
| 5 | `java -cp lib\d8.jar com.android.tools.r8.D8 --release --lib android.jar --min-api 24 --output build\dex <*.class>` | `classes.dex` 21,236 B |
| 6 | `javac tools\ZipPack.java` → `java -cp build\tools ZipPack base.apk packed.apk assets\www assets build\dex\classes.dex` | 50,062,275 B |
| 7 | `zipalign -f 4 build\packed.apk build\aligned.apk` | 50,064,682 B |
| 8 | `keytool -genkeypair`（已存在则复用）+ `apksigner sign --ks ... --out dist\android\sanguo-debug.apk` | 50,202,566 B |
| 9 | `apksigner verify --verbose --print-certs` + `aapt2 dump badging` + 条目断言 | 见 §4 |
| 10 | 汇总打印 | 18.9 s |

### 3.1 两个必须知道的坑（都已绕过并把理由写进注释）

**坑 1：`aapt2 link -A` 打不开中文文件名的 asset。**

原始报错（没有静默重试）：

```
aapt2.exe : F:\\sanguo\\apk\\assets\\www\\assets\\hero\\<中文名>.webp: error: failed to open file.
```

`assets\hero` 下 400 张武将立绘是按中文名命名的（`丁原.webp`、`于禁.webp`…），JS 按名字取图，不能改名。
build-tools 34.0.0 的 aapt2 在中文 Windows 上处理不了非 ASCII 文件名。于是：

- 步骤 3 **不带 `-A`**，只 link 清单 + res + R.java；
- 新增 **步骤 6 `ZipPack.java`** 自己写 zip：base.apk 条目原样搬（保留各自压缩方法，`resources.arsc` 必须保持 stored），
  `assets/www/**` 每一条 **`setMethod(STORED)` + setSize + setCompressedSize + setCrc** 写入（真未压缩），
  `classes.dex` 走 deflate。条目名按 UTF-8 写，Android AssetManager 认。

**坑 2：.NET 的 `CompressionLevel::NoCompression` 不是真 stored。**

第一版用 `ZipFile::Open(...,'Update')` + `CreateEntryFromFile(..., NoCompression)`，结果写出来是
**method=8 的 deflate + stored block**，每 32 KB 多 5 字节（`04.mp3` 2,651,115 → 2,651,520），
`bgm stored 0/10` 断言失败。这是 .NET Framework 的实现细节，不是参数用错。
所以最终改用 Java `ZipOutputStream`（`ZipPack.java`），能精确控制 method/size/crc。

### 3.2 其它环境事实

- harness 里的 `pwsh` 工具其实是 **Windows PowerShell 5.1**（系统禁跑 `.ps1`，必须先 `Set-ExecutionPolicy -Scope Process Bypass`）；
- `tools\build_apk.ps1` 必须是 **UTF-8 with BOM**，否则 PS 5.1 按 GBK 解析中文注释会报 12 个语法错
  （本会话里 `write`/`edit` 工具写出的文件都无 BOM，所以每次改完都用捆绑 python 重写成 `utf-8-sig`，
  再 `[Parser]::ParseFile` 验 0 错）；
- 脚本顶部 `[Console]::OutputEncoding = UTF8`，否则中文 Windows 用 GBK 解码 aapt2 的 UTF-8 输出，
  `application-label:'三國群英傳2'` 会变成乱码、断言假失败；
- `javac` 会打一条无害的 note：`MainActivity.java uses or overrides a deprecated API`（`onBackPressed()`，
  API 33 起废弃；minSdk 24 仍可用，且 `enableOnBackInvokedCallback="false"` 已显式关掉新的返回回调）。

---

## 4. APK 体检（原始输出）

### 4.1 `apksigner verify --verbose --print-certs`

```
Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): true
Number of signers: 1
Signer #1 certificate DN: CN=Sanguo Debug
Signer #1 certificate SHA-256 digest: 7614dc150cf32a96845e311241a2b13e144cc590b8dc5f2f416c888842514014
Signer #1 key algorithm: RSA
Signer #1 key size (bits): 2048
```

### 4.2 `aapt2 dump badging`（节选）

```
package: name='com.sanguo.webview' versionCode='1' versionName='1.0' compileSdkVersion='34'
sdkVersion:'24'
targetSdkVersion:'34'
uses-permission: name='android.permission.INTERNET'
application-label:'三國群英傳2'
application-icon-160:'res/mipmap-xxxhdpi-v4/ic_launcher.png'
application-icon-640:'res/mipmap-xxxhdpi-v4/ic_launcher.png'
application: label='三國群英傳2' icon='res/mipmap-xxxhdpi-v4/ic_launcher.png'
launchable-activity: name='com.sanguo.webview.MainActivity'
uses-feature: name='android.hardware.screen.portrait'
supports-screens: 'small' 'normal' 'large' 'xlarge'
```

`uses-feature: android.hardware.screen.portrait` 是 manifest 里 `screenOrientation="portrait"` 推导出来的，
说明竖屏声明真的进了包。

### 4.3 条目清单（关键条目 + 压缩方式）

| 条目 | Length | CompressedLength | 方式 |
|---|---:|---:|---|
| `classes.dex` | 21,236 | 11,603 | deflate |
| `AndroidManifest.xml` | 2,628 | 1,076 | deflate |
| `resources.arsc` | 956 | 956 | **stored**（Android 11+ 强制） |
| `assets/www/campaign.html` | 302,404 | 302,404 | stored |
| `assets/www/index.html` | 32,591 | 32,591 | stored |
| `assets/www/main.js` | 89,440 | 89,440 | stored |
| `assets/www/audio.js` | 35,619 | 35,619 | stored |
| `assets/www/release.js` | 1,723 | 1,723 | stored |
| `assets/www/data/meta.json` | 1,723 | 1,723 | stored |
| `assets/www/dist/core/battle.js` | 131,845 | 131,845 | stored |

汇总（脚本自动断言）：**1,678 条目**；hero 立绘 400 个（中文名 / UTF-8 条目名）；bgm 10 个；sfx 99 个；
`bgm stored : 10/10`（`CompressedLength == Length`）；`resources.arsc: stored`。

---

## 5. 未压缩母带的证据

### 5.1 磁盘上的音频（`game\web\assets\audio`，原样复制到 `assets\www\assets\audio`）

| 文件 | 字节 |
|---|---:|
| 03.mp3 | 980,950 |
| **04.mp3** | **2,651,115（= 2,589 KB，单曲最大）** |
| 05.mp3 | 2,141,204 |
| 06.mp3 | 2,025,848 |
| 10.mp3 | 975,516 |
| 11.mp3 | 975,934 |
| 12.mp3 | 1,147,506 |
| 13.mp3 | 1,062,034 |
| 14.mp3 | 1,020,865 |
| 17.mp3 | 1,046,569 |
| **bgm 合计** | **14,027,541 B = 14.03 MB = 13.38 MiB** |
| sfx 99 个 | 2,823,730 B |
| **音效 + 音乐** | **16,851,271 B = 16.85 MB（≈ 用户说的「16 MB 那套」）** |

### 5.2 三重证据说明「没压过」

1. **复制阶段**：`Copy-Item` 只搬字节，脚本不碰音频（`build_apk.ps1` 步骤 1 注释与打印均标注「未压缩原样复制」）。
2. **打包阶段**：ZipPack 对 `assets/www/**` 逐条 `STORED`；APK 里 `bgm` 10 条 **`CompressedLength == Length` 10/10**
   （构建脚本步骤 9 断言，见 §4.3）。也就是说 mp3 在 APK 里连 deflate 都没过一遍。
3. **内容阶段**：`verify_assets.mjs` 第 11 条把 `apk\assets\www` 与 `game\web` + `game\data` + `game\dist`
   逐个算 sha256，**1,671 个文件全等** —— 打包进去的就是开发目录里那份文件。

另外 `assets\audio\index.json` 里 bgm 每条的 `bytes` 与磁盘完全一致（04.mp3 = 2,651,115），
`srcBytes` 是更早的源文件，kbps 64/128 —— 说明**磁盘上这套 14.03 MB 就是 web 版实际播放的那一份**，
不是「web 用压缩版、APK 换母带」的两套文件。

### 5.3 体积账（为什么是 50.20 MB 而不是 60+ MB）

```
assets\www 未压缩合计          49,757,490 B  (49.76 MB)
+ classes.dex 等 zip 条目头      ~445,076 B
= 未对齐包                     50,062,275 B
+ zipalign 4 字节对齐填充         ~2,407 B
= aligned.apk                  50,064,682 B
+ v2/v3 签名块（含证书/签名）    137,884 B
= sanguo-debug.apk             50,202,566 B = 50.20 MB
```

即：**APK 比素材只大了 0.44 MB**（清单 + res + dex + 签名块），这正是「音频与贴图没被压」的直接后果。
二进制 MiB 口径是 47.88 MiB —— 有人用 `资源管理器` 看会显示 47.8 MB，用 `50 MB` 口径看是 50.20 MB，
两种口径都写在这里，避免对不上账。

---

## 6. 发布卫生：release 门控（逐行 diff）

用户的原话是「apk 包不会出现调试的界面和内容吧？」。web 版同时是开发预览台，所以必须加一个**最小侵入的发布开关**，
把所有开发设施在壳里关掉。改动只在 `game\web\*.html|*.js`，**`game/src/**` 一行没动**。

### 6.1 新增 `game\web\release.js`（34 行，页面第一个 script）

```js
// 判定顺序（任一成立即发布形态）：
//   ① ?rel=1 —— 本次会话第一次带就记进 sessionStorage
//   ② sessionStorage 的 sg.rel=1 —— campaign → city → deploy → battle 全程保持
//   ③ UA 含 SanguoShell —— APK 壳在 UA 尾巴打的标记
if (/[?&]rel=0(?:&|$)/.test(search)) { store.removeItem('sg.rel'); }
else if (rel) { store.setItem('sg.rel','1'); }
else { if (store.getItem('sg.rel') === '1') rel = true; }
if (!rel) { if (/SanguoShell/.test(ua)) rel = true; }
global.__RELEASE__ = rel;
```

不写 localStorage：那会跟存档一起被「清除资料」带走，也不该跨会话残留。

### 6.2 逐处 diff

| # | 文件:行 | 改前 | 改后 |
|---|---|---|---|
| 1 | `game\web\devflags.js:27-28` | `var DEV = /[?&]dev=1/.test(search);` | `var DEV = !global.__RELEASE__ && /[?&]dev=1/.test(search);` |
| 2 | `game\web\index.html:226` | （无） | 新增 `body.rel header, body.rel #hdrBtn { display: none; }` |
| 3 | `game\web\index.html:227-231` | （无） | 新增 `body.rel-boot #stage { visibility: hidden; }`（见 §6.3 引导卡） |
| 4 | `game\web\index.html:329` | `<script src="./devflags.js">` 打头 | 先 `<script src="./release.js">` 再 devflags |
| 5 | `game\web\index.html:335-347` | 正则匹配「? 或 & 之后跟 from 或 a 再加等号」时加 `solo` 类；否则若 `SGDev.DEV && sim` … | 分支最前面加 `if (window.__RELEASE__) { add('solo','rel'); 无出征参数→location.replace('./campaign.html?rel=1')；有→add('rel-boot') }`，其余原逻辑进 `else if` |
| 6 | `game\web\index.html:454-458` | `if (window.__sanguo && window.__sanguo.booted) return;` | `if (booted) return; var s = window.__sanguo; if (s && s.booted) return;`（发布形态没有 `__sanguo`，改用 `__sgBootOk` 置的 `booted`） |
| 7 | `game\web\index.html:532-538` | `const s = window.__sanguo.state; … state.mode / state.skills.length` | 先读 `const hud = window.SG_HUD && window.SG_HUD()`，`data-mode`/`data-slots` 优先用 hud，回落到 `__sanguo` |
| 8 | `game\web\index.html:551` | （无） | `?cmdmenu=` 截图钩子加 `if (window.__RELEASE__) return;` |
| 9 | `game\web\index.html:597-641` | （无） | 新增「发布形态自动开战」IIFE（见 §6.3） |
| 10 | `game\web\main.js:1859-1863` | （无） | 新增只读快照 `window.SG_HUD = () => ({ mode: state.mode, slots: state.skills ? state.skills.length : 0 })` |
| 11 | `game\web\main.js:1865-1867` | `window.__sanguo = { state, startBattle, … }` 无条件挂 | 外面包一层 `if (!window.__RELEASE__) { … }` |
| 12 | `game\web\main.js:1891` | `window.__sanguo.booted = true;` | `if (window.__sanguo) window.__sanguo.booted = true;` |
| 13 | `game\web\campaign.html:898` | `if (typeof window !== 'undefined' && /[?&]dev=1(?:&\|$)/.test(location.search))` | 中间插入 `!window.__RELEASE__ &&`（`__scenLv` / `__scenLevels` 探针） |
| 14 | `game\web\campaign.html:495` | （无） | `<script src="./release.js"></script>` 插在 `audio.js` 前 |
| 15 | `game\web\city.html:407` | `const DEV = /[?&]dev=1(?:&\|$)/.test(location.search);` | `const DEV = !window.__RELEASE__ && /…/.test(...)` |
| 16 | `game\web\city.html:389` | （无） | `<script src="./release.js"></script>` |
| 17 | `game\web\deploy.html:227` | （无） | `<script src="./release.js"></script>` |
| 18 | `game\web\items.html:207` | （无） | `<script src="./release.js"></script>` |

合计：1 个新文件（34 行）+ 5 个文件里 17 处改动，约 60 行；**没有新增任何游戏 API**，
`SG_HUD` 只返回两个只读字段（`mode`、技能格数），不给 `startBattle` / `armyCommand` 这类能驱动游戏的口子。

### 6.3 两处不是「删」，而是「换一种做法」的改动

**① 战斗页的「開戰」引导卡**（画在 canvas 上，改不了 view 层）：

进战斗页时第一屏本来是那张卡：「三國群英傳 2 / 豎屏重製 · Canvas2D 預覽 / 邏輯核心 15/15 測試通過 ·
戰鬥規則零改動 / 點「開戰」進入 100 人實時兵戰 / 配置在頁面上方切換（我方兵種 / 陣形 / 種子）」。
它由 `game\dist\view\battleView.js:1725 drawReady()` 绘制，源码在 `game\src\view\**`（任务禁止改）。

发布形态的处理：

- `body.rel-boot #stage { visibility: hidden }` 先把画布藏起来（不会闪到那张卡）；
- `index.html` 里一个 IIFE 每 100 ms 读 `SG_HUD()`，`mode === 'ready'` 时按 `START_BUTTON` 在 750×1334 设计稿里的
  中心（375, 684）换算成画布比例（0.5 / 0.5127），往 `#stage` 派发一次 `pointerdown` ——
  走的是 `main.js:1309 onPointerDown()` 原本的命中框（`hit.type === 'start'` → `startBattle()`），
  **没有新增任何游戏 API**；`mode !== 'ready'` 后移除 `rel-boot` 放出画布；
- 6 秒兜底：万一数据没加载完/出错，把画布放出来让玩家自己点，错误提示仍由 `#error` 兜底框负责。

旧 WebView（Chrome < 55）没有 `PointerEvent` 构造器，所以有 `try { new PointerEvent } catch { new MouseEvent }` 回落
（`main.js` 只读 `clientX/clientY/button`）。

**② 不带出征参数的战斗页**：

`index.html` 在发布形态下、`location.search` 里没有 `a=` / `from=` / `city=` / `soldiers=` / `bstr=` 任何一项时，
`location.replace('./campaign.html?rel=1')` —— 因为不带参数的战斗页就是「开发期预览态」（100 v 100 演示战），
App 的入口永远是大地图，玩家不该落到这一页。

### 6.4 发布形态下被关掉的东西（清单）

| 开发设施 | 发布形态 |
|---|---|
| 顶部除错列 `<header>`（兵种/阵形/种子/開戰） | `display:none`（`body.rel`），且 `solo` 排版让画布吃满 |
| 右上角齿轮 `#hdrBtn` | `display:none` |
| `window.__sanguo`（`startBattle`/`doCast`/`armyCommand`…） | 根本不挂（`typeof === 'undefined'`） |
| `window.__scenLv` / `__scenLevels`（campaign） | 不挂 |
| `?dev=1` 及 `?sim` / `?freeze` / `?probe` / `?marchdemo` / `?cmdmenu` / `?auto` 等调试参数 | `SGDev.DEV === false` ⇒ `devflags` 全部返回 null/false；campaign 的 `gateQuery()` 会把这些键整批删掉（`DEV_QUERY_KEYS` 白名单在 `campaign.html:560-589`） |
| `?cmdmenu` 截图钩子 | release 下第一行就 `return` |
| 诊断面板（`diagEl.open = SGDEV.DEV`） | 默认收起（`main.js:1689`） |
| 启动兜底框里的技术细节 `#error-dev` | `det.hidden = !devOn`（`index.html:401`） |

保留的：战斗 HUD（`#battleui` 叠层）、技能格、"點技能格即施放" 这类操作提示、键盘快捷键
（触摸设备用不到，但留着不会弹任何调试提示）。

---

## 7. 运行验证（不能只靠「能编译」）

### 7.1 `apk\verify_assets.mjs`（12 条，node 无依赖）

```
$ node apk\verify_assets.mjs
APK assets 体检：F:\sanguo\apk\assets\www
  规模        : 1,671 个文件 / 49,757,490 B = 49.76 MB = 47.45 MiB

  PASS  入口页齐全 — campaign.html 302404 B / index.html 32591 B / city.html 62574 B / deploy.html 49273 B / items.html 33299 B
  PASS  脚本齐全 — main.js 89440 B / audio.js 35619 B / devflags.js 2491 B / release.js 1723 B / face_map.js 10981 B / saves.js 80938 B
  PASS  release.js 声明了 __RELEASE__ — window.__RELEASE__ 门控脚本在包里
  PASS  HTML 的 script/link/img 引用都能落到文件 — 5 个页面 / 27 条引用
  PASS  dist 模块之间的相对 import 都能解析 — 32 个模块 / 47 条 import
  PASS  页面 import 的 ../dist/* 都能落到打包进来的 dist/ — 5 个页面 / 11 条 ../dist 或 ../data 引用
  PASS  data/ 的 JSON 都能解析 — 16 个 JSON / 2,353,679 B
  PASS  bgm 是 10 首 mp3 且总字节 >= 13 MB — 10 首 / 14,027,541 B / 最大 04.mp3 2,651,115 B
  PASS  sfx 有 99 个文件 — 2,823,730 B
  PASS  audio/index.json 与磁盘一致 — bgm 10 条 / 14,027,541 B，terrain 12 条、sceneTracks 7 条都对得上
  PASS  与 game\web + game\data + game\dist 逐字节一致（原样复制，没被压过） — 1,671 个文件 sha256 全等
  PASS  没有 > 100 MB 的异常文件 / 空文件 — 最大 2,651,115 B

ALL PASS (12/12)
```

其中第 6 条有个实现细节值得记下来：页面在站点根时 `../dist/x` 的浏览器语义是 `/dist/x`（越过根的 `..` 直接丢弃），
用 `path.posix.normalize` 会把它算成坏引用 —— 验证脚本按浏览器规矩解析，才不会误报。

### 7.2 同一份 assets 在 http 源下能跑（Edge + CDP）

APK 壳里的源是 `http://127.0.0.1:<随机端口>/`，站点根 = `assets/www`。桌面侧用
`apk\test\serve_www.mjs` 起**一模一样**的源（默认 5199，本次用 5299 避开别的服务），
`apk\test\cdp_shots.mjs` 驱动 Edge（无头、750×1334、移动视口、触摸模拟）逐页验收 + 截图：

```
$ node apk\test\serve_www.mjs 5299
$ node apk\test\cdp_shots.mjs http://127.0.0.1:5299 F:\sanguo\work\apk

Edge Edg/158.0.4370.33
✅ 44/44 PASS
```

四页的检查项与结果：

| 页面 | URL | 关键断言 |
|---|---|---|
| 大地图（APK 入口） | `/campaign.html?rel=1` | `__RELEASE__=true`、`__sanguo=undefined`、`SGDev.DEV=false`、无交办字样、地图 canvas 37.3% 非黑 |
| 内政 | `/city.html?rel=1&city=襄平` | 同上 + 内政版式渲染（346 字） |
| 出征 | `/deploy.html?rel=1&city=襄平&from=襄平&bsoldiers=10` | 同上 + 「出征編成」版式、不再出现「請從大地圖進入」 |
| 战斗 | `/index.html?rel=1&from=campaign&city=襄平&soldiers=10&bsoldiers=10` | `header display=none`、`#hdrBtn display=none`、`#start` 不可见、**`mode=fighting`（自动开打，没停在引导卡）**、`rel-boot` 已移除、`SG_HUD={"mode":"fighting","slots":4}` |
| 裸战斗页 | `/index.html?rel=1` | 自动重定向到 `/campaign.html?rel=1` |
| 带 `?dev=1&sim=1` 的战斗页 | — | 探针仍不挂：`{sanguo:"undefined", dev:false, rel:true, scenLv:"undefined"}` |

截图（`F:\sanguo\work\apk\`）：

- `01-campaign.png`（370,767 B）— 大地图（首次开局走游戏自己的「選劇本 → 選君主」流程）
- `02-city.png`（806,055 B）— 内政页
- `03-deploy.png`（589,726 B）— 出征编成页
- `04-battle.png`（1,014,346 B）— 战斗进行中（无工具条、无引导卡）
- `05-battle-naked.png`（1,031,224 B）— 裸战斗页被退回大地图后的画面

![大地图](F:/sanguo/work/apk/01-campaign.png)
![内政](F:/sanguo/work/apk/02-city.png)
![出征](F:/sanguo/work/apk/03-deploy.png)
![战斗](F:/sanguo/work/apk/04-battle.png)

> 说明：截图是桌面 Edge 的移动视口，不是真机；没有 `adb` 设备，所以这一层只能测到「同一份 assets + 同一套 release 门控」。
> WebView 的渲染/音频行为与 Edge 同源（都是 Chromium），但真机上的触摸、音频会话、返回键仍需实机过一遍。

### 7.3 桌面 JVM 单测（补一层「壳里的逻辑」证据）

`AssetServer` 依赖 `android.assets.AssetManager`，在桌面跑不了；所以把纯逻辑（路径归一化/防穿越、MIME 表、
Range 解析）抽到无 android import 的 `HttpUtil`，用桌面 JVM 跑：

```
$ javac -encoding UTF-8 -d build\test apk\test\java\com\sanguo\webview\HttpUtilTest.java apk\java\com\sanguo\webview\HttpUtil.java
$ java -cp build\test com.sanguo.webview.HttpUtilTest
PASS 63/63 (HttpUtil)
```

63 条断言覆盖：`../../etc/passwd` 之类 7 条穿越、15 条 MIME、13 条 Range（含 `bytes=-500`、越界 416、多段回落 200）、
4 条状态码文案。构建脚本的步骤 4b 每次构建都会跑一遍，失败就中断。

---

## 8. 怎么装

```powershell
# 有 adb 且已开 USB 调试：
adb install -r F:\sanguo\dist\android\sanguo-debug.apk
# 启动：
adb shell am start -n com.sanguo.webview/.MainActivity
# 看日志（本地 http 服务的请求都打 AssetServer tag）：
adb logcat -s AssetServer
```

没有 adb：

1. 把 `F:\sanguo\dist\android\sanguo-debug.apk` 拷到手机（数据线 / 微信文件传输 / 网盘都行）；
2. 手机上点开这个 apk；
3. 系统会提示「未知来源」/「禁止安装未知应用」——去 **设置 → 应用 → 该来源（文件管理器或浏览器）→ 允许安装未知应用**，再回来点安装；
4. 装好桌面出现「三國群英傳2」图标，点开就是大地图。

最低系统：**Android 7.0（API 24）**；targetSdk 34，Android 14 上也正常。
debug 签名的证书是 `CN=Sanguo Debug`（口令 123456），只用于自测分发；上架/正式分发要换正式 keystore。

---

## 9. 已知限制

| 限制 | 说明 | 缓解 / 备注 |
|---|---|---|
| **WebView 性能** | 游戏是 Canvas2D + 每帧重绘，低端机（尤其 Android 7/8 的老 WebView）帧率会掉，100 人同屏时更明显 | 壳里开了 `LAYER_TYPE_HARDWARE`；真机若卡，先升级系统 WebView（Play 商店 / 应用商店可单独更新） |
| **首次启动白屏** | 要加载 49.8 MB assets 里的 `data/*.json`、`dist/*.js` 与首屏图，冷启动到大地图约 1–3 s（真机更慢） | 窗口背景与 WebView 背景都设成黑色（`styles.xml` + `setBackgroundColor(Color.BLACK)`），白屏变黑屏、不刺眼；本地 http 无网络延迟 |
| **返回键** | 站内有多页（campaign ↔ city ↔ deploy ↔ battle），`canGoBack()` 为真时返回上一页，否则退出 App | 从战斗页结算后点画面会 `location.href = './campaign.html'`，不会把战斗页留在栈里太久 |
| **横竖屏** | 清单写死 `screenOrientation="portrait"` + `configChanges="orientation\|keyboardHidden\|screenSize"`，转屏不重建 Activity，画面不会重排成横版 | 设计稿是 750×1334 竖屏，横屏没有版式，所以锁竖屏是正确取舍 |
| **存档** | 进度在 WebView 的 `localStorage`（`setDomStorageEnabled(true)`），**跟着 App 数据走**：系统「清除数据」/卸载重装 = 存档没了 | 游戏自己有「存檔」按钮（大地图右上角），但存的是同一份 localStorage；要跨设备迁移得另做导出功能（本次没做） |
| **音频** | 已用未压缩 mp3，`setMediaPlaybackRequiresUserGesture(false)` 免手势播放；`onPause` 会 `SG.audio.stop()` 并 `pauseTimers()` | 首次进战斗仍可能有极短的解码延迟（mp3 头部），属正常 |
| **签名** | debug keystore（`CN=Sanguo Debug`，口令 123456），v1 未启用（v2/v3 已签） | Android 7+ 都认 v2；要上架请换正式 keystore 并 `apksigner sign` 重签 |
| **`assets` 用 stored** | 为了「音频不压缩」，`assets/www/**` 全部 STORED，APK 比 deflate 版大约 20–25% | 这是任务要求（母带）；PNG/JPG 本来压缩收益就小，mp3 压不动 |
| **没在真机上跑过** | 本机 `adb devices` 为空，所有验证都在桌面 Edge（Chromium 同源）+ APK 静态体检完成 | 拿到机器后按 §8 装一次，重点看：返回键、音频切后台、低端机帧率 |

---

## 10. 复现（从零到 APK）

```powershell
Set-Location F:\sanguo
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

# 1) 构建（复制 assets → aapt2 → javac → d8 → ZipPack → zipalign → 签名 → 体检）
& F:\sanguo\tools\build_apk.ps1

# 2) assets 体检（12 条）
node apk\verify_assets.mjs

# 3) 桌面验证「同一份 assets 在 http 源下能跑 + 发布形态没调试 UI」
node apk\test\serve_www.mjs 5299          # 另开一个窗口，Ctrl+C 结束
node apk\test\cdp_shots.mjs http://127.0.0.1:5299 F:\sanguo\work\apk

# 4) 手动体检
F:\devtools\android\sdk\build-tools\34.0.0\apksigner.bat verify --verbose --print-certs F:\sanguo\dist\android\sanguo-debug.apk
F:\devtools\android\sdk\build-tools\34.0.0\aapt2.exe dump badging F:\sanguo\dist\android\sanguo-debug.apk
```

构建脚本可重复执行：`apk\build\` 与 `apk\assets\www` 每次清空重建，keystore 存在则复用（**不要删** `apk\keystore\debug.jks`，
删了签名指纹会变，已装的包无法覆盖升级）。

---

## 11. 本次改动清单（只列写入范围）

| 路径 | 性质 |
|---|---|
| `apk\AndroidManifest.xml`、`apk\res\**`、`apk\java\**`、`apk\tools\ZipPack.java`、`apk\test\**`、`apk\verify_assets.mjs` | 新增 |
| `apk\keystore\debug.jks` | 构建脚本生成（复用） |
| `apk\build\**`、`apk\assets\www\**` | 构建产物（每次重建） |
| `tools\build_apk.ps1` | 新增（UTF-8 BOM） |
| `game\web\release.js` + `devflags.js` / `index.html` / `main.js` / `campaign.html` / `city.html` / `deploy.html` / `items.html` | release 门控（§6，lead 授权的唯一 `game/**` 改动；`game\src\**` 未动） |
| `dist\android\sanguo-debug.apk` | 产物 |
| `work\apk\*.png`、`work\apk\shots-report.json` | 验证截图与 CDP 报告 |
| `project\205_APK_WebView打包.md` | 本文件 |

未动：`game\src\**`、`tools\build_wechat.ps1`、`tools\pack_audio_local.ps1`、`project\44*|31*|37a*`。
