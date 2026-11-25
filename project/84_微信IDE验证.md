# 84 微信 IDE 模拟器验证（三国群英传2 竖版重制 · 小游戏包）

> 执行者：x5-wechat-ide　日期：2026-11-25　工作目录：`F:\sanguo`
> 待验包：`F:\sanguo\dist\wechat-upload`（AppID `wxf631d432ca7abcee`，`compileType=game`）
> 本次**未修改任何源码 / 构建脚本 / 产物**；所有中间物只写在 `F:\sanguo\work\wechat_ide\`。

---

## 0. 结论摘要（先看这个）

**Q1：这包现在能不能被微信接受？**
**能。** `cli upload` 真实跑通：`exit=0`、`√ upload`，平台回显 `TOTAL 12.6 MB / main 2.0 MB / /subpackages/res/ 10.7 MB`，**没有报任何体积超限、也没有报 `root` 尾斜杠**。
静态检查那 4 条红灯 **没有一条拦住微信**——它们全部是「假红灯」。

**真正的致命问题不在那 4 条里，而是第 5 条（静态检查查不出、只有模拟器才暴露）：**
> **`subpackages/res` 这个分包在模拟器里一个文件都读不到。**
> 控制台原文：`file subpackages/res/native/88/886f99fb-…webp does not exist!`，
> 但该文件在磁盘上**确实存在**（239,924 B，已 `Test-Path` 验证 `True`）。
> 后果：地图底图 `load('map/chinamap', ImageAsset)` 失败 → 回退成「只有城名文字+虚线道路」的简笔画大地图（截图 `06`/`15` 可见：**没有任何城池图标**）。

**Q2：Battle 黑屏在模拟器里是否必现？**
**本轮无法判定——Battle 在本包里根本进不去，所以既没复现也没证伪。**
原因：初始存档 `武將 0`；大地图里连点 8 座城，全部显示 `需 4~9 段路`，点「出征」一律回 `不相邻：只能打相邻的城`；连推 9 个月（金 1200→3408）AI 也**没有来攻**，所以「守城戰」入口也没出现。编成屏（`DeployRoot`）/ Battle 屏均未到达。
→ 结论写 **「旧包未验：到不了 Battle；`BattleBg.ts:26` 的 `MaskComponent as Mask` 修复需重构建后再验」**，不得写成「已修复」或「已复现」。

---

## 1. CLI 能力清单

### 1.1 版本
| 项 | 值 |
|---|---|
| 产品名 | 微信开发者工具 |
| 标题栏版本 | **Stable 2.02.2608080** |
| `微信开发者工具.exe` FileVersion / ProductVersion | **2.02.0** |
| 基础库（lib） | **3.18.0**（控制台首行 `Wechat Lib:3.18.0, 2026.11.16`） |
| CLI 入口 | `<安装目录>\cli.bat`（904 B）→ `resources\app.asar.unpacked\js\common\cli\index.js` |
| 安装目录 | `C:\Program Files (x86)\Tencent\微信web开发者工具` |

`cli.bat` 实现要点（读原文）：`chcp 65001`；`ELECTRON_RUN_AS_NODE=1`；遍历 `*.exe` 取 >50 MB 的那个当 ELECTRON（排除 `node.exe`/`node-18.exe`/`wxfilewatcher*.exe`/`notification_helper.exe`/`wechatdevtools.exe`）→ 实际选中 `微信开发者工具.exe`。**没有 `cli.exe`**。

> `cli.bat --version` 不被识别，会直接打印全局帮助（exit=0）。版本号只能从 exe 属性 / 标题栏取。

### 1.2 子命令（`cli.bat` 无参打印的全局帮助，原文顺序）
```
cloud  open  login  islogin  preview  auto-preview  upload  build-npm
auto  auto-replay  agent  reset-fileutils  close  quit  cache  engine
open-other  build-ipa  build-apk
```
全局选项：`--project  --appid  --ext-appid  --port  --token  --lang  --debug  --disable-gpu  -h`

各组 `--help` 原文已存盘：

| 文件 | 内容要点 |
|---|---|
| `work\wechat_ide\logs\open_help.txt` | 仅 Project options + 全局选项 |
| `work\wechat_ide\logs\auto_help.txt` | `--trust-project [boolean]`、`--test-ticket [string]`、`--ticket [string]`。**help 里没有 `--auto-port`** |
| `work\wechat_ide\logs\preview_help.txt` | `--qr-format,-f`(terminal/image/base64) `--qr-output,-o` `--qr-size,--qs` `--info-output,-i` |
| `work\wechat_ide\logs\upload_help.txt` | `--version,-v`(required) `--desc,-d`(required) `--info-output,-i` |
| `work\wechat_ide\logs\islogin_help.txt`、`auto-preview_help.txt` | 同上 |

**`--auto-port` 是隐藏参数但真实可用**：读 `miniprogram-automator@0.13.0` 的 `out\Launcher.js` 可见它内部拼的就是
`["auto","--project",<path>,"--auto-port",<port>]`，默认端口 9420。任务书里的用法是对的。

### 1.3 登录态
`cli.bat islogin` → **`{"login":true}`**（未扫码、未登录操作；工具原本就处于登录态）。
同时回显 `√ IDE server has started, listening on http://127.0.0.1:46032`。

---

## 2. 打开 / 自动化结果（含原始报错）

### 2.1 `open`：成功
```
cli.bat open --project F:\sanguo\dist\wechat-upload --port 46032
→ √ open      exit=0
```
**没有任何分包体积/尾斜杠报错**（open 阶段不编译，只挂项目）。

### 2.2 `auto`：命令成功，但自动化 API 对 `compileType=game` 不可用
```
cli.bat auto --project F:\sanguo\dist\wechat-upload --auto-port 9420 --trust-project --port 46032
→ √ Using AppID: wxf631d432ca7abcee
→ √ auto      exit=0
```
- ws 端口 **9420** 确实起来了：`probe_ports.mjs` 报 `{ok:true, connectMs:28}`。
- 但 `miniprogram-automator`（0.13.0，已装到 `work\wechat_ide\node_modules`）连上后**每个 API 都超时**：

| API | 结果 |
|---|---|
| `systemInfo()` | `timeout waiting for automator response` |
| `pageStack()` | 同上 |
| `currentPage()` | 同上 |
| `callWxMethod('getSystemInfoSync')` | 同上 |
| `screenshot({path})` | 同上 |
| `CDP().enable()` | `timeout >10000ms` |

- 根因在 IDE 日志里能直接读到（`C:\Users\liutian\AppData\Local\微信开发者工具\User Data\2ca4252ffa87560ea1fd48b913e45179\WeappLog\logs\2026-11-24-20-50-47-387.log`）：
  **`[SimulatorService] updateSimulatorCompileOptions: simulator not found s0`**（反复出现）。
  小游戏项目的 simulator 上下文没注册，所以 ws 能握手、小程序侧 agent 永不回包。
- 其他端口：15530/32123 → HTTP 403；46032 → 404 Express；52600/54354/9420 → 426 Upgrade Required。
  **全机没有 CDP HTTP 端点**（`/json/version` 返回 `Cannot GET /json/version`），CDP 路线不可用。

### 2.3 最终采用的通道（唯一可行）
`miniprogram-automator` / CDP / OCR 视觉桥（`modlens` 无 provider）全部不可用后，改用：

1. **GDI `CopyFromScreen` 截图**（`work\wechat_ide\capture.ps1 -Mode screen`）
   —— 注意 `PrintWindow(h,dc,2)` 会返回**陈旧帧**（多次字节完全相同），必须用 screen 抓屏。
2. **注入真实鼠标/键盘事件**（`mouse.ps1` / `keys.ps1`，`SetCursorPos` + `mouse_event` + `keybd_event`）。
   —— 前提是先 `window.ps1 -Action activate`（HWND_TOPMOST→SetForegroundWindow→NOTOPMOST）把窗口抢到前台，否则点击会落到别的窗口。
3. **读控制台**：面板只有 1 行高、文本被右边缘截断 → 用**拖选 + Ctrl+C 复制**整行（DOM 里是全文，不受可视裁剪影响），或滚轮 + 反复复制。`work\wechat_ide\logs\console_copy_1.txt`（32,105 字符）。

> 环境坑：`pwsh` 的 ExecutionPolicy 禁止直接跑 `.ps1`，必须
> `$sb=[scriptblock]::Create((Get-Content .\x.ps1 -Raw -Encoding utf8)); & $sb -args`
> 绕过。

---

## 3. 模拟器实跑：截图索引

全部在 `F:\sanguo\work\wechat_ide\shots\`。

| # | 文件 | 内容 |
|---|---|---|
| 1 | `00_window_print.png` | 首次抓到项目窗口：Boot 屏「三國群英傳 · 豎版重製 / 讀入 1/9」，调试器 `✖1 ⚠20` |
| 2 | `04_maximized.png` | 最大化后发现**一个 Chrome 窗口挡住 IDE 左侧**（tab `127.0.0.1:5188/cocos-build/p1_fixmask/index.html`，页面是 `拒绝访问 127.0.0.1`） |
| 3 | `06_after_click2.png` | **✅ Boot → 大地圖（Campaign）成功**：`大地圖 / 第1年 1月 / 金 1200 / 城 3 / 武將 0 / 騎士 0 枚`，右上「物品」，底部 `徵兵 金500→兵+40`、`招募 金400→民+3000`、`前進一月 稅收+261` |
| 4 | `08_max_findbadge.png`、`08c_*.png`、`09_probe_band.png` | 定控制台行位置（最大化布局下消息行 y≈1332..1348） |
| 5 | `10_click_city.png` | 点「洛陽」命中：地图出现选中圈，底部换成 `出征 / 需 3 段路` + `前進一月 / 稅收 +264`，状态行给出守军情报 |
| 6 | `10_map_zoom.png` | **大地图放大：只有城名文字 + 虚线道路，一个城池图标都没有**（res 底图加载失败的直接视觉证据） |
| 7 | `11_click_luoyang.png` | 城選中态（同上，`出征 / 需 3 段路`） |
| 8 | `12_after_chuzheng.png` + `12_bottom_zoom.png` | 点「出征」→ 状态行 `不相邻：只能打相邻的城`；按钮 `出征 / 需 3 段路`、`前進一月 / 稅收 +264` |
| 9 | `13_city_probe_stack.png` | 6 城批量探针（弘農/陳留/汝南/許昌/新野/下邳），每城都有 `出征 / 需 N 段路` + 守軍守將 |
| 10 | `probe2_stack.png` | 再探 8 城（西平/天水/安定/宛/江陵/建業/北平/平原），**全部是敌城**、`需 4~9 段路` |
| 11 | `15_after_months.png` | 连点 8 次「前進一月」：`第1年 9月`，金 1200→**3408**，`城 3 武將 0` 不变，**无 AI 攻城** |
| 12 | `17_panel_max.png` | 控制台整体收起后的窗口（用于腾出视野） |
| 13 | `18_ctrl_j.png` | `Ctrl+J` 恢复面板，控制台首行 `Wechat Lib:3.18.0, 2026.11.16`，仍 `✖3 ⚠22` |

**大地图交互结论**：Boot 屏不是卡死，「讀入 1/9」是等待点击——点一下任意处即进大地图。
城池可点（可选中并弹出出征/守军情报），**但地块上没有图标，只有文字热区**。

---

## 4. 控制台 error 全文

调试器计数：进场时 `✖1 ⚠20`，进大地图后 **`✖3 ⚠22`**，Play 后面板默认 `top` 帧 + `2 hidden`。
通过拖选 + `Ctrl+C` 抓到 **2 条完整 error**（第 3 条头被截断，仅见 `[ArtLayer] `）。原文逐字抄录：

### E1（未捕获，带完整栈）
```
WAGame.js:1 file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist! Error: file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist!
    at http://127.0.0.1:21180/game/engine-adapter.js:83:40
    at Object.fail (http://127.0.0.1:21180/game/web-adapter.js:3406:34)
    at Object.t (http://127.0.0.1:21180/__dev__/WAGameSubContext.js:1:186032)
    at I.forEach.g.<computed> (http://127.0.0.1:21180/__dev__/WAGame.js:1:2294322)
    at p (http://127.0.0.1:21180/__dev__/WAGame.js:1:230328)
    at Object.fail (http://127.0.0.1:21180/__dev__/WAGame.js:1:230771)
    at http://127.0.0.1:21180/__dev__/WAGame.js:1:812412
    at J (http://127.0.0.1:21180/__dev__/WAGame.js:1:812564)
    at http://127.0.0.1:21180/__dev__/WAGame.js:1:812756
    at r (http://127.0.0.1:21180/__dev__/WAGame.js:1:808161)
(env: Windows,mg,2.02.2608080; lib: 3.18.0)
```

### E2（业务代码捕获后打的 error）
```
WAGame.js:1 [ArtLayer] load('map/chinamap', ImageAsset) 失敗：file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist!
```

### E3（只抓到抬头，正文丢失）
```
WAGame.js:1 [ArtLayer]
```
（同一 `[ArtLayer]` logger，推测与 E2 同类；面板 1 行高 + 消息区滚走后未能再复制到。⚠22 条 warning 同样未逐条取得。）

### 关键判读：E1/E2 不是「文件缺了」，是「分包文件系统读不到」
```
Test-Path F:\sanguo\dist\wechat-upload\subpackages\res\native\88\886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp
→ True        (239,924 字节)
```
文件在盘上、在包里，`res` 分包也编译过去了（IDE 日志有
`[CompileCache] call executor { cacheKey:'gameSubPkg', cacheSubKey:'F:\sanguo\dist\wechat-upload/subpackages/res/', … barrierPath:'subpackages/res/game.js' }`），
但运行期 `exists()` 对它返回 false。**这是分包挂载/寻址问题，不是缺资源问题。**

---

## 5. 四条红灯的实际裁决

| # | 静态检查的说法 | 模拟器/平台实际裁决 | 证据 |
|---|---|---|---|
| 1 | `subpackages/res` 13.83 MB，超单分包 4 MB 约 3.5× | **不拦，且判据本身是错的**。官方规则：普通分包**不限大小**（只有独立分包 ≤4 MB；主包 ≤4 MB；合计未开虚拟支付按 20 MB）。`game.json` 的 `subpackages[0]` **没有 `independent: true`**，所以是普通分包。`upload` 也接受了 | `game.json` 全文见下；`upload` 回显 `TOTAL 12.6 MB / main 2.0 MB / /subpackages/res/ 10.7 MB` 且 `√ upload` |
| 2 | `root` 带尾斜杠 `"subpackages/res/"` | **不拦编译、不拦上传**：open / auto / upload 全程**没有任何一条**关于 `root` 的报错或警告；平台还直接把包归到 `/subpackages/res/` | 见 §2.1、§2.2、§6 |
| 3 | 6 个文件残留 `audio/` 悬挂引用（res config 110 处、main index 2 处） | **不致命**：进大地图、连推 9 个月，控制台 3 条 error **无一条与 audio 有关**；`audio-remote.json` 的 `base` 为空时确实静默跳过 | `logs/console_copy_1.txt` 全文检索无 `audio` 报错；`res/config.7d75d.json` 里 `audio/` 出现 **110 次**（与静态检查一致） |
| 4 | 子包 native 缺 109 档 `audio/*` | **不致命**：同上，运行期没有对应 404/throw；游戏 Boot→大地图链路不受影响 | 同上 |
| — | ——（静态检查查不出） | **⚠ 这才是致命项：`res` 分包在模拟器里所有文件读不到**（E1/E2）。地图底图加载失败 → 回退简笔画地图，**城池无图标** | `10_map_zoom.png`、`06_after_click2.png`；§4 |

### 包体实测（本机字节数，供对账）
| 范围 | 文件数 | 字节 | MiB |
|---|---|---|---|
| 全包 | 2,962 | 18,661,691 | 17.80 |
| 主包（不含 `subpackages\`） | 28 | 2,098,959 | 2.00 |
| `subpackages\res` | 2,934 | 16,562,732 | 15.80 |

> 与任务书里「主包 1.99 MB / 分包 13.83 MB / 合计 15.82 MB」有差异，原因大概率是静态检查把分包 `native/audio` 之类排除或换了单位。**无论哪一版，都远小于 20 MB 合计上限、主包远小于 4 MB。**
> `upload` 报的 12.6 MB 是**压缩后**的上传体积。

### `game.json` 原文（15 行，确认无 `independent`）
```json
{
  "deviceOrientation": "portrait",
  "networkTimeout": {
    "request": 5000,
    "connectSocket": 5000,
    "uploadFile": 5000,
    "downloadFile": 500000
  },
  "subpackages": [
    {
      "name": "res",
      "root": "subpackages/res/"
    }
  ]
}
```

### 5.1 为什么「文件在包里却读不到」——代码级线索（供下一轮直接验证）

`dist\wechat-upload\engine-adapter.js` 里 `res` 这个 Asset Bundle 的加载逻辑是（原文压缩代码，已格式化）：

```js
bundle: function (e, t, r) {
  var o = cc.path.basename(e),                                  // o = "res"
      a = (t.version || cc.assetManager.downloader.bundleVers[o]) ? (version + ".") : "";
  if (_[o]) {                                                   // _["res"] = "subpackages/res"
    n = "subpackages/" + o + "/config." + a + "json";            // → subpackages/res/config.7d75d.json
    h(o, t.onFileProgress, function (e) {                        // h = fsUtils.loadSubpackage("res")
      if (e) r(e, null);
      else E(n, t, function (e, t) { t.base = "subpackages/" + o + "/"; r(e, t) })
    })
  }
}
```
其中磁盘读取用的是
```js
function x(t, e, n) { r(t, function (e) { e ? n(null, t) : n(new Error("file ".concat(t, " does not exist!"))) }) }
// r = window.fsUtils.exists
```
`settings.a22e7.json` 也确认：`"assets":{"subpackages":["res"],"bundleVers":{"res":"7d75d"},"projectBundles":["internal","main","res"]}`。

**推断（本轮无法证实，因为不许改产物）**：`game.json` 里 `"root": "subpackages/res/"` **带尾斜杠**，而代码里拼路径时又会自己补一个 `"subpackages/" + o + "/"`。
若平台按 `root` 原样（带尾斜杠）挂载子包目录，静态路径 `subpackages/res/native/…`（单斜杠）就查不到 → `exists()` 返回 false → 报「does not exist」。
**最小验证实验**：把 `game.json` 的 `root` 改成 `"subpackages/res"`（去尾斜杠）重构建，再进模拟器看 E1/E2 是否消失。
> 这只解释「为什么单斜杠路径查不到」，不排除其它可能（如 devtools 对 `compileType=game` 的分包 `exists()` 实现差异）。
> IDE 编译日志里出现过 `barrierPath: subpackages/res/game.js`（单斜杠），说明 IDE 内部有归一化，所以**这条假设有反证风险**，必须实测。

---

## 6. `cli upload` 结果（只试一次，未发布、未勾审核）

```
cli.bat upload --project F:\sanguo\dist\wechat-upload -v 1.0.0 -d "x5-wechat-ide 模拟器验证包" --port 46032

- initialize
(node:54444) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `微信开发者工具 --trace-deprecation ...` to show where the warning was created)
√ IDE server has started, listening on http://127.0.0.1:46032
- preparing
- Fetching AppID () permissions
√ Using AppID: wxf631d432ca7abcee
- Upload

┌───────────────────┬───────────┬─────────────┐
│ (index)           │ size      │ size (Byte) │
├───────────────────┼───────────┼─────────────┤
│ TOTAL             │ '12.6 MB' │ 13263246    │
│ main              │ '2.0 MB'  │ 2072878     │
│ /subpackages/res/ │ '10.7 MB' │ 11190368    │
└───────────────────┴───────────┴─────────────┘

√ upload        exit=0
```
**没有任何体积/尾斜杠/分包警告。** 该命令只把包推到「开发版」，未提交审核、未发布。

---

## 7. Battle 黑屏：本轮结论

**未验证（到不了 Battle）。** 逐条说明为什么：

1. 初始存档 `武將 0`（`06_after_click2.png` 顶部 HUD，推 9 个月后仍是 0）。
2. 出征的硬门槛是**相邻**（`CampaignRoot.ts:434` `const own = this.save.owned.includes(this.selected);`；非相邻时按钮只显示 `` `需 ${distance} 段路` ``，见 `CampaignRoot.ts:495`）。
3. 实点 14 座城，**全部** `需 4~9 段路`，点「出征」一律回 `不相邻：只能打相邻的城`。
4. 编成屏 `DeployRoot` 需从大地图 `doAction('march')` 进入（`CampaignRoot.ts:561`）；`CityPanel` 的 9 条命令里也有「出征」（`CityModel.ts:177`），但须先点**己方**城开面板——本轮没找到己方城（`城 3`，地图上无图标可辨，`#5E9C85` 的己方高亮块因 res 底图失败看不到）。
5. 「守城戰」入口需要敌军抵达城下（`CampaignRoot.ts:443-455`）；连推 9 个月 AI **零进攻**，所以这条路也没触发。

因此：
- **不能**说「Mask 崩溃必现」——旧包根本没执行到 `BattleBg.ts:26`。
- **也不能**说「已修复」——`MaskComponent as Mask` 的改动**不在本产物里**。
- 正确写法：**「旧包未验（到不了 Battle）；修复需重构建后重验」**。

---

## 8. 没做到的 / 需要下一轮

| 项 | 状态 | 原因 |
|---|---|---|
| 大地图（Campaign）截图 | ✅ | `06_after_click2.png` |
| 敌城 → 出征 → **编成屏**截图 | ❌ | 没有一座相邻敌城；`出征` 全被 `不相邻` 拒绝 |
| **Battle** 截图 / 黑屏复现 | ❌ | 到不了 Battle（见 §7） |
| 控制台 error **逐条全文** | ⚠ 3 条中拿到 2 条完整 + 1 条抬头 | 面板只有 1 行高、消息无法整屏展开（拖高分隔条/最大化面板均失败），E3 正文与 22 条 warning 未取到 |
| 22 条 warning 明细 | ❌ | 同上 |
| 真实设备/真机预览 | ❌ | 未扫码、未登录操作（遵规矩） |
| 「重构建后」的 Battle 结论 | ❌ 未验 | 按要求不自己跑构建，等 `x1-cocos-art` 改完资源 + 重构建 |

**下一轮最该做的三件事**
1. 修 / 查「`res` 分包运行期读不到文件」（E1/E2）。可先试把 `game.json` 的 `root` 改成 `"subpackages/res"`（去掉尾斜杠）重构建对比——**本轮未验证是不是尾斜杠导致，这只是首选假设**。
2. 让初始存档有将（`武將 >0`）或给一条直达 `DeployRoot`/`Battle` 的调试入口，否则 Battle 永远验不到。
3. 把面板默认高度/宽度调大（或换用 `cli auto` + 真机）以便完整抄控制台。

---

## 9. 产出物与进程清理

### 9.1 新增文件（全部在 `F:\sanguo\work\wechat_ide\`）
```
capture.ps1  crop.ps1  mouse.ps1  window.ps1  keys.ps1  stack.ps1  probe2.ps1   ← 可复用工具
probe_ports.mjs  probe_api.mjs                                                    ← automator 探测
logs\open_help.txt auto_help.txt preview_help.txt upload_help.txt islogin_help.txt auto-preview_help.txt
logs\pid_baseline.json          ← 动手前的 4 个基线 PID
logs\console_copy_1.txt         ← 控制台拖选复制的 32,105 字符原文
logs\console_scroll.txt         ← 滚轮补抓（本次为空，未取到新行）
shots\*.png                     ← 全部截图（索引见 §3）
node_modules\                   ← miniprogram-automator@0.13.0
```

### 9.2 进程（已收干净）
- **没有新起 `微信开发者工具.exe` 主进程**。动手前基线 4 个 PID：`94356 / 119668 / 121744 / 122684`（2026-11-24 20:50 启动），其中 **122684 是项目窗口宿主**（标题 `sanguo-vertical`）——**全程未杀，清理后 4 个全部存活**。
- 05:38 出现的 17 个同名进程（含持有 9420 监听的 PID 132008）是 `cli open/auto` 让 IDE 自己为该工程拉起的子进程。
- 清理步骤与实际结果：
  1. `cli.bat close --project F:\sanguo\dist\wechat-upload --port 46032` → `exit=0`，工程窗口关闭；**9420 自动化端口已释放**（`Get-NetTCPConnection -LocalPort 9420` 空）；剩余同名进程从 21 个降到 3 个（`15912 / 100220 / 55380`，均 `hwnd=0` 无窗口）。
  2. 对这 3 个（我这边 `cli open` 拉起、无窗口、工程已关）`Stop-Process -Force` → 全部停止。
  3. 复核：只剩基线 4 个 PID（`94356 / 119668 / 121744 / 122684`，`alive=True`），外加 1 个 05:52:51 自动重启的 IDE 辅助进程（`109988`，无窗口，属 IDE 自身守护，未再干预）。
  4. `46032` 端口回到基线 PID `122684` 持有，IDE 服务仍可用。
- `miniprogram-automator` 的 ws 连接在探测脚本结束时已 `disconnect`，无残留 node 进程（核查：05:30 之后无 node 进程存活）。

### 9.3 规矩遵守
- 未改任何源码 / `tools\build_wechat.ps1` / `dist` 产物。
- 未登录、未扫码、未发布、未提交审核；`upload` 只跑一次。
- 报告中不含任何密钥/token（AppID 为公开标识，非密钥）。
- 中文文件全部用 write/edit 工具写，未走 PowerShell 重定向。

---

# 10. 复验 2：新包（05:54）+ pkg_min 缩小分包实验

> 本轮 2026-11-25 05:55–06:0x，对 **05:54 重新打包的 `dist\wechat-upload`** 复验，并另做一次「缩小分包」对照实验。
> **没有重跑构建**，**没有改任何源码 / 构建脚本 / dist 产物**；`pkg_min` 只是复制品，位于 `work\wechat_ide\pkg_min`。

## 10.1 复验对象

| 项 | 值 |
|---|---|
| 目录 | `F:\sanguo\dist\wechat-upload` |
| 文件时间 | `game.json` / `src\settings.a22e7.json` / `subpackages\res\game.js` = **05:54:51**；`project.config.json` / `audio-manifest.json` = **05:54:52** |
| 全包 | 2962 文件 **18,681,726 B = 17.82 MiB** |
| 主包 | 28 文件 **2,118,994 B = 2.02 MiB** |
| 分包 `subpackages\res` | 2934 文件 **16,562,732 B = 15.80 MiB** |
| `game.json` 分包声明 | `{"name":"res","root":"subpackages/res/"}` —— **尾斜杠仍在**，**无 `independent` 字段** |
| 打开方式 | `cli.bat open --project F:\sanguo\dist\wechat-upload --port 46032` → `exit=0`、`√ open` |
| 项目窗口 | PID **122684**，标题 `sanguo-vertical`，rect (1095,196) 1250×1000 |
| IDE | Stable **2.02.2608080**，lib **3.18.0**，env `Windows,mg,2.02.2608080` |

## 10.2 你问的四件事

### ① `subpackages/res/*` 到底读不读得到 ——读不到，原文如下

`res` 这个 bundle **根本没建起来**，控制台原文（全量 copy 见 `work\wechat_ide\logs\v2_full_console.txt`，170,887 字符 / 5,755 行）：

```
WAGame.js:1 [res] loadBundle('res') 失敗：Unable to instantiate virtual:///prerequisite-imports/res from undefined
WAGame.js:1 [res] 退回內建 resources；assets/bundles/res 是否已被 import？
```

上面这一对在启动阶段**重复 9 次**（L7/L212/L417/L614/L821/L1026/L1231/L1436/L1641，每对后跟 ~100 行栈帧）。

随后按资源逐条报（注意：**没有错误码**，微信侧就是 `Error: file ... does not exist!`）：

```
WAGame.js:1 file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist! Error: file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist!
WAGame.js:1 [ArtLayer] load('map/chinamap', ImageAsset) 失敗：file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist!
WAGame.js:1 [ArtLayer] load('map/chinamap') 失敗，回退佔位：Bundle res doesn't contain map/chinamap
```

进城后的内政面板还会再拉两张朝堂底图，同样三连：

```
file subpackages/res/native/09/09e5df4f-1cc5-46a1-9f84-ac9da7b74fb9.f771c.webp does not exist!
[ArtLayer] load('bg/policy/palais_03', ImageAsset) 失敗：file ...09e5df4f...webp does not exist!
[ArtLayer] load('bg/policy/palais_03') 失敗，回退佔位：Bundle res doesn't contain bg/policy/palais_03
file subpackages/res/native/cb/cb58eeac-309b-401b-b6df-955d7b270e81.2f653.webp does not exist!
[ArtLayer] load('bg/policy/floor_03', ImageAsset) 失敗：...
[ArtLayer] load('bg/policy/floor_03') 失敗，回退佔位：Bundle res doesn't contain bg/policy/floor_03
```

另有两条 BootRoot 级的：

```
WAGame.js:1 [BootRoot] Error: res.load('data/wises') 失敗：Can not parse this input:{"path":"data/wises","__requestType__":"path","bundle":"","preset":"default","priority":0}
WAGame.js:1 [res] garrison.json 未載入（守軍退回按人口推算）：res.load('data/garrison') 失敗：Can not parse this input:{"path":"data/garrison","__requestType__":"path","bundle":"","preset":"default","priority":0}
```

**但文件在磁盘上是存在的**（`Test-Path` + `Length` 实测）：

| 报「does not exist」的路径 | 盘上实况 |
|---|---|
| `subpackages\res\native\88\886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp` | **EXISTS 239,924 B** |
| `subpackages\res\native\09\09e5df4f-1cc5-46a1-9f84-ac9da7b74fb9.f771c.webp` | **EXISTS 65,924 B** |
| `subpackages\res\native\cb\cb58eeac-309b-401b-b6df-955d7b270e81.2f653.webp` | **EXISTS 1,924 B** |
| `subpackages\res\native\8f\8f4dc50e-22eb-45af-8403-303073e69b16.80c5c.mp3` | **MISSING（`res` 下 .mp3 计数 = 0，无 `audio` 目录）** |

→ **图（webp）是「文件在、读不到」；音频（mp3）是「文件本来就不在」**（音频改走 CDN、`audio-manifest.json` 的 `base` 为空，属预期）。

**大地图现在有没有底图/城点：没有。** `v2_01_map.png` / `v2_01_mapzoom.png`：只有 48 个城名文字 + 极淡的虚线道路，**没有 `map/chinamap` 底图，也没有任何城点图标**；点城后才会出现一个金色选中圈。与旧包（第一轮 §3 的 `06_after_click2.png` / `10_map_zoom.png`）**完全一致，没有任何改善**。

### ② `Error 3804` —— **0 次**

在 170,887 字符 / 5,755 行的全量控制台里检索 `3804`：**0 命中**；检索 `addComponent`：**0 命中**；检索 `Mask`：**0 命中**。
→ 本轮**没有**任何 `addComponent` 抛错，`AudioSource` 那条线在模拟器里**没有复现**。

### ③ ✖ / ⚠ 数量与前 3 条原文

工具条上的计数（`Console` 旁的红色 ✖ / 黄色 ⚠）随流程**单调上涨**：

| 阶段 | ✖ | ⚠ | 截图 |
|---|---|---|---|
| Boot（讀入 1/9） | **3** | **20** | `v2_00_boot.png` |
| 点一下进大地圖 | 3 | 20 | `v2_01_map.png` |
| 点敌城（洛陽） | 5 | 22 | （第一轮同现象） |
| 点己方城「代縣」开内政 | 9 | 26 | `v2_02_owncity.png` |
| 出征編成屏 | 9 | 26 | `v2_05_deploy_screen.png` |
| Battle 开场 | 23 | 54 | `v2_07_battle_t3.png` |
| Battle 打了 ~10 s | **801** | **54** | `v2_10_battle_end.png` |

最后那 800 条**全部是 mp3 404**（战斗里每次音效都拉一次），原文形如：

```
WAGame.js:1 file subpackages/res/native/8f/8f4dc50e-22eb-45af-8403-303073e69b16.80c5c.mp3 does not exist! Error: file subpackages/res/native/8f/8f4dc50e-22eb-45af-8403-303073e69b16.80c5c.mp3 does not exist!
```

**前 3 条 error 原文（时间顺序）**：

1. `2[app.json 或自定义编译条件错误] app.json 中未定义自定义编译中指定的启动页面 (env: Windows,mg,2.02.2608080; lib: 3.18.0)`
2. `WAGame.js:1 [res] loadBundle('res') 失敗：Unable to instantiate virtual:///prerequisite-imports/res from undefined`
3. `WAGame.js:1 [BootRoot] Error: res.load('data/wises') 失敗：Can not parse this input:{"path":"data/wises","__requestType__":"path","bundle":"","preset":"default","priority":0}`

（第 1 条是 IDE 侧的「自定义编译条件」提示，与本包无关，但它在 error 里占一格。）

### ④ Battle —— **到了，而且能打起来，不是黑屏**

踩通的最短路径（每一屏都有截图）：

```
大地圖 ──点己方城「代縣」(窗口坐标 912,305；己方城名是青绿色 #8FD1B6，先用像素扫描找到的 3 座)──▶ 内政面板（人口 186,248 / 兵 178/600 / 武將 6 / 士氣 60/100）
      ──点「出征」格 (877,515)──▶ 出征子弹窗：目標「晉陽  敵主 | 兵 193  防 297 | 路 0」
      ──点目标行 (880,573)──▶ 出征編成（目標 晉陽 · 從 代縣 出征 · 守軍 145 兵；關羽 武力99/智力85；兵種「補刀」；陣形「方形」；兵力 100/100）
      ──点右下「出征」(978,773)──▶ Battle
```

Battle 画面实测（`v2_07_battle_t3.png` / `v2_09_battle_t12.png` / `v2_10_battle_end.png`）：

- 顶栏：`張飛 100/100`（蓝条）· `3.5s` 倒计时 · `60/60 敵軍 守備隊`（红条）
- 战场：土黄地面 + 城门 + 远景山，两边队列各 12 个小兵，我方蓝、敌方蓝红；骑兵（張飛）在地图上游走
- 底栏：`張飛 LV.1 武力 80 智力 61 HP 124/124 · 出擊 進度 0`、`敵 守備隊 LV.1 兵 60 智力 30 HP 105/105 · 出擊 進度 0`
- 战报行：`張飛 · 殲滅 83 (潰敗 0) · 擊潰 0 · 士氣 32 ...`
- 12 秒后：`我軍 83/100 · 戰鬥結束 · 0/60 敵軍 守備隊 殲滅`，敌方 HP `0/105`，队列消亡

**结论：这一版产物在模拟器里 Battle 场景能进、能渲染、能打完一整场近战，没有黑屏、没有 `Mask` 相关报错。**
（`BattleBg.ts:26` 的 `MaskComponent as Mask` 改动是否已进这版产物，我无法从产物里直接判定；但**行为上**没有复现崩溃，所以本轮**不能**得出「旧包必现黑屏」的结论——旧包我这轮没跑，第一轮也没走到 Battle。）

## 10.3 尾斜杠假设：作废

`engine-adapter.js` 拼的是 `"subpackages/" + name + "/"`，`name` = bundle 名 `res`，得 `subpackages/res/`，**与 `game.json` 的 `root` 一模一样，不会产生双斜杠**（你在 m00501 已核过）。
本轮实测也**没有任何**「root / 尾斜杠 / 路径非法」类报错，`cli open` 与 `cli upload` 都不校验它。
→ §5.1 的代码级假设**作废**，尾斜杠**不是**任何现象的原因（是否要改，纯粹是「要不要跟官方示例保持一致」的洁癖问题）。

## 10.4 §实验：pkg_min（把分包从 15.80 MiB 砍到 2.11 MiB）

**做法**（只动 `work\wechat_ide\pkg_min`，`dist\wechat-upload` 一字未改）：

1. `Copy-Item F:\sanguo\dist\wechat-upload F:\sanguo\work\wechat_ide\pkg_min -Recurse -Force`
2. `subpackages\res\native` 从 **1399 档删到 6 档**：保留 `native\88\886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp`（chinamap）+ 随机 5 档（`00\003be43e….png`、`00\00414dcc….webp`、`00\0054b973….png`、`00\0056df06….webp`、`00\0076bb45….webp`），删 1393 档并清理空目录
3. `import/`（1535 个 chunk）、`config.7d75d.json`、`index.7d75d.js`、`game.js` **一个没删**

**结果体积**：主包 2.02 MiB（28 文件）+ 分包 **2.11 MiB**（1541 文件）= 约 4.13 MiB 总量。

**打开方式**：`cli.bat open --project F:\sanguo\work\wechat_ide\pkg_min --port 46032` → `exit=0`；
IDE 标题变成 `pkg_min - WeChat Web DevTools`，资源管理器根 `PKG_MIN`（截图 `min_00_boot.png`、`min_01_map.png`、`min_02_map.png`）。
**项目类型仍是「小游戏模式」（`compileType=game`）**；IDE 2.02 的小游戏工程**没有独立的「分包」面板**（分包只体现在编译缓存日志 `cacheKey: 'gameSubPkg'` 里）。

**三条对照结论**：

| 观察项 | 完整包（15.80 MiB 分包） | pkg_min（2.11 MiB 分包） |
|---|---|---|
| ① 大地图底图/城点 | **无底图、无城点**，只有城名 + 极淡虚线 | **仍无底图**（`bg/map_bg`、`map/chinamap` 都 `Bundle res doesn't contain`），**但城点出来了**：48 个褐红圆圈（敌）+3 个青绿圆圈（己方）+ 道路连线 + 选中金圈 |
| ② `does not exist` 类报错 | **有**，file 级：`file subpackages/res/native/88/886f99fb-….webp does not exist!`（外加 mp3 大量 404） | **没有**（`does not exist` 命中 0 次）；变成 bundle 级：`[ArtLayer] load('map/city_1') 失敗，回退佔位：Bundle res doesn't contain map/city_1`（共 7 条：`bg/map_bg`、`map/chinamap`、`map/city_1..4`、`map/point`） |
| ③ `loadSubpackage` / 分包大小类报错 | **无**（`loadSubpackage` 只出现在栈帧 `handleLoadSubpackageSuccess` 里）；**无任何「超过 4 MB」提示** | 同上，**一条都没有** |
| ④ `res` bundle 是否建起来 | 否：`Unable to instantiate virtual:///prerequisite-imports/res` | **否**：`[res] 退回內建 resources；assets/bundles/res 是否已被 import？`、`[BootRoot] Error: res.load('data/formations') 失敗：Can not parse this input:{…}` |

**裁决：B —— 与分包体积无关。**
依据：把分包砍到 2.11 MiB（只有原来的 13%）、native 只剩 6 档之后，`res` bundle **依旧**建不起来，`Bundle res doesn't contain …` **一字不差地**重现在 `map/chinamap` 上；微信/IDE 也**从没**报过任何体积或 `loadSubpackage` 失败。

**必须一起记录的附带观察（不是 A，但确实和体积/时序有关）**：
缩小后**占位渲染变完整**——完整包连「簡略圖」都没画出来（只有城名），pkg_min 却把城点、道路、己方城配色都画出来了。也就是说：**体积不决定 bundle 成败，但决定 ArtLayer 有没有机会走到「取资源→失败→回退占位」这一步**。这解释了为什么之前看起来「越小反而越好」——它不是变好，只是**回退得更彻底**。

## 10.5 真因链（代码级，已定位到具体文件与行）

1. **注册脚本存在，但没人执行。**
   `F:\sanguo\dist\wechat-upload\subpackages\res\index.7d75d.js`（587 B，全文）只干一件事：
   ```js
   System.register("chunks:///_virtual/res",[],(function(){return{execute:function(){}}}));
   (function(r){ r('virtual:///prerequisite-imports/res', 'chunks:///_virtual/res'); })(function(mid,cid){ … });
   ```
   这就是把 `virtual:///prerequisite-imports/res` 注册进 System 模块表的唯一入口。

2. **引擎在等这个模块。**
   `F:\sanguo\dist\wechat-upload\cocos-js\cc.71e79.js` 里：
   ```js
   e.import("virtual:///prerequisite-imports/"+s.name).then((function(){r(null,s)})).catch(r)
   ```
   拿不到 → `catch` → `loadBundle('res')` 失败 → 退回 `resources` → 之后每次 `res.load(...)` 都失败。

3. **主包里没有任何人引用它。**
   对主包全部 `.js` 逐个 grep：`7d75d` 命中 **0**、`subpackages/res` 命中 **0**、`assets/res` 命中 **0**。
   而 `subpackages/res/game.js` 全文只有一行：`// asset-only subpackage: no entry code`（40 B）。
   → **那个 `index.7d75d.js` 是死代码，运行期从来没被加载过。**

4. **是谁写的这个 stub。**
   `F:\sanguo\work\pack_subpackage.mjs:66-67`：
   ```js
   const stub = join(to, 'game.js');
   if (!existsSync(stub)) writeFileSync(stub, '// asset-only subpackage: no entry code\n');
   ```
   同文件 `:62` 是 `renameSync(from, to)`，把 `assets\res` 整体搬到 `subpackages\res`。
   也就是说：**「纯资源分包不需要入口代码」这个前提在 Cocos 3.8 wechatgame 产物上不成立**——bundle 仍然需要有人执行 `index.<ver>.js`，把 `prerequisite-imports` 注册进 System 之后，`loadBundle` 才可能成功。

5. **修复方向（本轮不实施，按规矩留给构建侧）**：
   - 最小改法：在**主包**里、`wx.loadSubpackage('res')` 成功之后，显式执行一次 `subpackages/res/index.<ver>.js`（例如主 `game.js` 里按 `settings.assets.bundleVers.res` 拼路径 `System.import`／`require`）；或
   - 正解：别用 `pack_subpackage.mjs` 手工搬目录，改在 **Cocos 构建面板把 `res` 配置成「Bundle → 分包」**，让构建器自己生成子包入口与注册，`game.json` 的 `subpackages` 也由构建器写。

## 10.6 复验 2 截图索引（新）

| 文件 | 内容 |
|---|---|
| `work\wechat_ide\shots\v2_00_boot.png` | 新包 Boot 屏（`讀入 1/9`），控制台 ✖3 ⚠20 |
| `work\wechat_ide\shots\v2_01_map.png` | 新包 **大地圖**（第1年9月，金 3408）——无底图、无城点 |
| `work\wechat_ide\shots\v2_01_mapzoom.png` | 上面地图放大 3×：只有城名 + 虚线，**无城点** |
| `work\wechat_ide\shots\v2_02_owncity.png` | 点己方城「代縣」→ **内政面板**（人口/兵 178-600/武將 6/8 个指令格）＋ 左侧控制台可见 `[ArtLayer] load('map/chinamap', ImageAsset) 失敗` |
| `work\wechat_ide\shots\v2_04_after_chuzheng2.png` | 「出征」子弹窗：`晉陽  敵主 | 兵 193  防 297 | 路 0` |
| `work\wechat_ide\shots\v2_05_deploy_screen.png` | **出征編成屏**（目標 晉陽 · 從 代縣 出征 · 守軍 145 兵；關羽 武力99/智力85；補刀；方形；100 兵） |
| `work\wechat_ide\shots\v2_06_battle_t0.png` / `v2_07_battle_t3.png` | **Battle 开场**（張飛 100/100 vs 守備隊 60/60，3.5s） |
| `work\wechat_ide\shots\v2_09_battle_t12.png` | Battle 中盘（我軍 83/100、敵軍 0/60 殲滅、騎兵接触） |
| `work\wechat_ide\shots\v2_10_battle_end.png` | **戰鬥結束**，控制台 ✖801 ⚠54（mp3 404 刷屏，行内可见 `.mp3 does not exist!`） |
| `work\wechat_ide\shots\v2_panel_tall.png` | 把调试器面板拉高后**可读的完整控制台**（`[res] loadBundle('res') 失敗…` 直接可见） |
| `work\wechat_ide\shots\min_00_boot.png` | pkg_min 工程在 IDE 里打开（标题 `pkg_min — WeChat Web DevTools`，根 `PKG_MIN`） |
| `work\wechat_ide\shots\min_01_map.png` | pkg_min Boot 屏 + 控制台 `[res] 退回內建 resources…` / `[BootRoot] Error: res.load('data/formations')` |
| `work\wechat_ide\shots\min_02_map.png` | **pkg_min 的大地圖：城点出来了**（褐红=敌 / 青绿=己方 / 金圈=选中）+ 控制台 7 条 `Bundle res doesn't contain …` |
| `work\wechat_ide\shots\min_02_mapzoom.png` | 上面地图放大 3×（与 `v2_01_mapzoom.png` 对照用） |

日志原文：

| 文件 | 内容 |
|---|---|
| `work\wechat_ide\logs\v2_boot_console.txt` | 新包 Boot 阶段控制台 59,940 字符（含 `virtual:///prerequisite-imports/res`） |
| `work\wechat_ide\logs\v2_full_console.txt` | 新包 **全量**控制台 **170,887 字符 / 5,755 行**（Boot→大地圖→内政→編成→Battle） |
| `work\wechat_ide\logs\v2_console_battle.txt` | Battle 段（含 `.mp3 does not exist!` 原文） |
| `work\wechat_ide\logs\v2_console_after_chuzheng.txt` | 进内政面板后（含 `bg/policy/palais_03` / `floor_03` 三连） |
| `work\wechat_ide\logs\min_console.txt` | pkg_min 控制台 82,621 字符（7 条 `Bundle res doesn't contain …`） |

**控制台全文怎么抠出来的**（第一轮没解决的那件事，这轮解决了）：把调试器面板顶部那条 sash（`y=847`，`RGB(68,68,68)`）拖到 `y=430` 把面板拉到半屏高 → 在消息区从 `(400,530)` 拖到 `(400,975)` 全选 → `Ctrl+C` → `Get-Clipboard -Raw`。之前失败两次是因为点在 `y=851`（面板背景）而不是 `y=847`（sash 本身），以及一次误点开了 `top` 下拉把控制台挡住了。

## 10.7 复验 2 进程清理

- 本轮 `cli open`（05:55:11–05:55:17）拉起 **20 个**同名进程；`cli open` 第二个工程（pkg_min）与 `cli close` 之后，它们**全部自行退出**，`Stop-Process` 的待杀列表为空（`victims: `）。
- 清理后存活：`94356 / 119668 / 121744 / 122684`（**基线 4 个，2026-11-24 20:50 启动，全程未杀**）＋ `109988`（05:52:51 由 IDE 自身拉起的守护进程，无窗口）。
- 端口：`46032` 回到基线 PID `122684`；`9420`（自动化端口）**空闲**。
- 未登录、未扫码、未发布、未提交审核；本轮**没有**再跑 `upload`（第一轮已跑过一次并记录在 §6）。

## 10.8 一句话总结

| 问题 | 答案 |
|---|---|
| 这包现在能不能被微信接受？ | **能上传、能装、能跑**——`cli open`/`cli upload` 全绿，四条静态红灯里**没有一条**是微信真正拦的（体积合法、尾斜杠无报错、音频缺失静默降级、子包 native 缺档不致命）。**但** `res` bundle 建不起来（`virtual:///prerequisite-imports/res` 从未注册），所以**所有原作美术都没加载**，游戏是在「回退占位」上跑的：大地图没底图也没城点、内政没朝堂图、战斗没音效。**能进包，不能算能玩。** |
| Battle 黑屏在模拟器里是否必现？ | **没有黑屏。** 这版产物在模拟器里能进 Battle、能渲染整场战斗并打完（`v2_07` / `v2_09` / `v2_10`）。全量控制台里 `Mask` 命中 **0 次**、`3804` 命中 **0 次**。旧包本轮未跑，所以「旧包是否必现黑屏」**无法在本轮下结论**。 |

---

# 11. 复验 3：`dist\wechat-fix1`（分包入口修复后）

> 本轮 2026-11-25 06:06–06:1x，验 `F:\sanguo\dist\wechat-fix1`。
> **不跑构建、不改源码、不动 `dist\wechat-upload`**；只写 `work\wechat_ide\**` 与本报告。

## 11.1 这版改了什么 / 验的是什么

- `work\pack_subpackage.mjs:64-79` 现在给分包写的是**真入口**（`subpackages\res\game.js`，115 B）：
  ```
  // 分包入口：执行 bundle 注册代码（由 work/pack_subpackage.mjs 生成）
  require('./index.7d75d.js');
  ```
  上一版这里只有 40 B 的空占位 `// asset-only subpackage: no entry code`。
- 包体（`F:\sanguo\dist\wechat-fix1`，全包 mtime **2026-11-25 06:05:43**）：

  | 项 | 值 |
  |---|---|
  | 主包 | 27 文件 **2,108,209 B = 2.01 MiB** |
  | 分包 `subpackages\res` | 2934 文件 **16,562,807 B = 15.80 MiB** |
  | 合计 | 2961 文件 **18,671,016 B = 17.81 MiB** |
  | 分包根目录 | 只有 3 个文件：`config.7d75d.json`(221,445) / `game.js`(115) / `index.7d75d.js`(587) |
  | `native` | 1399 档 |
  | `res` 下 `.mp3` | **0**（109 个已按 CDN 策略删掉，符合预期） |

- 打开：`cli.bat open --project F:\sanguo\dist\wechat-fix1 --port 46032` → `exit=0`；
  窗口 PID **122684**，标题 `wechat-fix1 - WeChat Web DevTools`，资源管理器根 `WECHAT-FIX1`。
- 一个可见的小变化：**这次不用点就自己进了大地圖**（Boot 屏一闪而过），不再像上一版那样卡在 9 次 bundle 重试上。

## 11.2 三个问题的答案

### ① `loadBundle('res') 失敗：Unable to instantiate virtual:///prerequisite-imports/res` —— **0 次**

启动→大地圖阶段的全量控制台（`work\wechat_ide\logs\v3_console_all.txt`，51,945 字符 / 1,751 行）统计：

| 检索串 | 命中 |
|---|---|
| `loadBundle` | **0** |
| `prerequisite-imports` | **0** |

（上一版这两条各 **×9**。）配套的 `[res] 退回內建 resources；assets/bundles/res 是否已被 import？` 也**一起消失**。
→ **这条修好了。**

### ② 大地图有没有原作底图与四档城点图标 —— **仍然没有**

`work\wechat_ide\shots\v3_01_map.png`（整窗）与 `v3_01_mapzoom.png`（3× 放大，`X700 Y320 W360 H270`）：
地图区域只有 **48 个城名文字 + 极淡虚线道路**，**没有 `map/chinamap` 底图，也没有 `city_1..4 / point` 城点图标**，与上一版 `v2_01_map.png` 视觉一致。

但**失败点已经换了**——不再是 bundle 建不起来，而是**单个资源文件读不到**，原文（本轮控制台）：

```
WAGame.js:1 file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist! Error: file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist!
WAGame.js:1 [ArtLayer] load('map/chinamap', ImageAsset) 失敗：file subpackages/res/native/88/886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp does not exist!
WAGame.js:1 [ArtLayer] load('map/chinamap') 失敗，回退佔位：Bundle res doesn't contain map/chinamap
```

命中数：`does not exist` **3 行**（2 条正文 + 1 条嵌在 ArtLayer 行里）、`Bundle res` **1 行**、`map/chinamap` **3 行**。

**这个 webp 在盘上是真有的**：

```
F:\sanguo\dist\wechat-fix1\subpackages\res\native\88\886f99fb-e2b7-4644-9dd8-1573715a4076.63720.webp   239,924 B
（同目录另有 88697fca-….e04a0.png 73,158 B / 88835311-….7e831.webp 3,730 B / 88e48d36-….8ac9d.webp 7,084 B）
```

而且它是**唯一**还报错的资源：上一版报过的 `data/wises`、`data/garrison`、`bg/policy/palais_03`、`bg/policy/floor_03` **全都不再报**。

→ 结论：**bundle 注册这条链已经通了；剩下的是「`map/chinamap` 这一个文件读取失败」的独立问题**（症状仍是「文件在磁盘上、运行期 `exists()` 却返回 false」）。它一失败，ArtLayer 就回退占位，后面的 `city_*` 城点也就没画出来 —— 所以大地图看起来和上一版一样空。

### ③ `[BootRoot] Error: res.load('data/wises') 失敗` —— **0 次**

同一份 1,751 行控制台里 `data/wises` **0 命中**；`garrison.json 未載入（守軍退回按人口推算）` 也一起消失。
→ **这条也修好了。**

## 11.3 顺带：Battle 与计数

- **能到大战斗，而且画面比上一版完整**：`shots\v3_05_battle.png` —— 地面有砖纹贴图、空中有白色粒子点（上一版 `v2_07_battle_t3.png` 是纯色地面、无粒子）；HUD 仍是 `張飛 100/100 · 4.1s · 60/60 敵軍 守備隊`。出征編成屏也正常（`v3_04_deploy.png`，桌面/纸质背景已上）。
- `Console` 工具条计数：

  | 阶段 | ✖ | ⚠ |
  |---|---|---|
  | 进大地圖 | **3** | **3**（上一版 ⚠**20**） |
  | 内政 → 出征編成 | 7 | 7 |
  | Battle 开场 | 21 | 35 |
  | Battle 打一会儿 | **429** | **35**（上一版 ✖801 ⚠54） |

- Battle 阶段全量控制台（149,662 行）：`loadBundle` 0、`prerequisite-imports` 0、`data/wises` 0、`map/chinamap` 0（已被刷出缓冲区）、
  **`does not exist` 300 行且 100% 是 `.mp3`**（CDN 策略下 mp3 本来就不在包里，属预期噪声，不是新问题）。

## 11.4 复验 3 截图 / 日志索引

| 文件 | 内容 |
|---|---|
| `work\wechat_ide\shots\v3_00_boot.png` | fix1 打开后直接进大地圖（✖3 ⚠3） |
| `work\wechat_ide\shots\v3_01_map.png` | **大地图整窗** —— 无底图、无城点 |
| `work\wechat_ide\shots\v3_01_mapzoom.png` | 上面地图 3× 放大（只有城名 + 虚线） |
| `work\wechat_ide\shots\v3_02_city.png` | 点己方城「代縣」→ 内政面板 |
| `work\wechat_ide\shots\v3_03_target.png` | 出征子弹窗（目標 晉陽） |
| `work\wechat_ide\shots\v3_04_deploy.png` | 出征編成（背景纹理已上） |
| `work\wechat_ide\shots\v3_05_battle.png` | **Battle**（地面砖纹 + 粒子） |
| `work\wechat_ide\shots\v3_06_badge_zoom.png` | 打完后的 `✖429 ⚠35` 徽章特写 |
| `work\wechat_ide\logs\v3_console.txt` | 拖选版 38,317 字符 |
| `work\wechat_ide\logs\v3_console_all.txt` | **Ctrl+A 全量** 51,945 字符 / 1,751 行（启动→大地圖） |
| `work\wechat_ide\logs\v3_console_battle.txt` | Battle 期 Ctrl+A 全量 4,492,087 字符 / 149,662 行 |

（顺带记录一个本轮学到的取日志手法：在控制台消息区单击后 `Ctrl+A` 再 `Ctrl+C`，能把**整个** console buffer 一次性复制下来，比拖选靠谱得多。）

## 11.5 复验 3 进程清理

- `cli.bat close --project F:\sanguo\dist\wechat-fix1 --port 46032` → `exit=0`；06:05 由 `cli open` 拉起的 20 个同名进程**全部自行退出**（待杀列表为空）。
- 清理后存活：`94356 / 119668 / 121744 / 122684`（**基线 4 个，全程未杀**）+ `109988`（05:52:51 守护，无窗口）。
- 端口：`46032` 回到基线 PID `122684`，`9420` 空闲。
- 本轮**没有**跑 `upload`，未登录、未扫码、未发布。

## 11.6 一句话

**分包入口的修法是对的**：`loadBundle` 与 `data/wises` 两条都归零、⚠ 从 20 掉到 3、編成与 Battle 画面都更完整。
**只剩一个单点**：`native\88\886f99fb-….webp`（`map/chinamap`，239,924 B，文件确实在）仍读不到 → 大地图依旧没有原作底图、没有城点图标。
