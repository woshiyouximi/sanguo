# 169 Cocos 启动故障（web-mobile 起不来 / totalFrames 恒 0 / 1209）

结论先说：**产物没坏，代码没坏。** 报障时观察到的状态（`cc` 是 object、canvas 在、无 console 报错、`getTotalFrames()===0`、`getScene()===null`、`loadScene` 报 1209 + "not in the build settings"）是 **Cocos 3.8.8 启动过程中「还没走到 launch scene」那个窗口期的精确指纹**——正常启动也有 1.4–2.1 秒处于这个状态；而这个窗口期只有在**页面被真正渲染**（tab 在前台、窗口未被遮挡）时才会结束。探测脚本在 init 完成前 / 在后台 tab 里探测，就会 100% 复现这组症状，且**在任何构建上都一样**。

- 用一个全新的 headless/headed 浏览器（attach 在 navigate 之前、等 `getScene()` 出现而不是死等固定毫秒）打开同一份产物：**2143 ms 进 Boot**，`frames 3 → 61 / 1000ms`，Campaign 12.07 ms、Battle 8.28 ms 载入，Battle 场景 249 节点 / 102 个 Sprite，HUD 与 A–H 六按钮齐全。
- 反过来，把 tab 在 1.2 s 时切到后台：**frames 恒 0、scene 恒 null 持续 7.5 秒以上**；`Page.bringToFront` 之后 1.9 秒自动进 Boot，无需刷新。
- 失败的两次构建（14:42:48 r171、14:50:30 r172）与成功的 14:03:50 构建，**构建参数逐字相同、日志体积同级、产物 config 与旧产物逐字节相同**——没有任何构建侧差异。

所以：**这不是"某次重建把包做坏了"，是"探测方式 + 浏览器不渲染页面"共同造成的假阴性**，另外还有一次真实的 1209（探测时机早于 `game.init` resolve）。修法见 §5。

## 1. 症状（复述，全部可复现）

| 观察项 | 报障值 | 我的复现值 |
|---|---|---|
| 页面加载 | 成功 | `index.html` 200，`cache-control: no-store` |
| `window.cc` | object | object |
| canvas | 存在 | 876×1368（与 lead 截图同尺寸） |
| console 报错 | 无 | 无（`rej=0, err=0`） |
| `cc.director.getTotalFrames()` | 0（恒） | 0（复现）；正常启动 3→61 增长 |
| `cc.director.getScene()` | null（恒） | null（复现）；正常启动 = `Boot` |
| `loadScene('Battle')` | `Error 1209 ... Arguments: Battle` | 逐字复现 |
| `preloadScene('Battle')` | `Can not preload the scene "Battle" because it is not in the build settings.` | 逐字复现 |
| 画面 | 黑屏 / 极暗 Cocos 水滴 | `F:\sanguo\work\r172v\v172_boot.png` = 纯黑 + 中央极暗水滴 |

`v172_boot.png`（876×1368，仅 15266 B）是关键证据：画面**不是全黑**而是有一个**低不透明度的 Cocos 启动 logo**。`style.f76d1.css`（1283 B）里没有任何 `url(` / 背景图，`index.html` 里也**没有 `#splash` DOM**（实测 `splashDom:false`）——所以那个 logo 只能是**引擎的 SplashScreen 渲染出来的，且只画了开头几帧（淡入中途）就停住了**。这直接指向"帧循环停摆"，不是"脚本抛错"。

## 2. 根因（含产物里的具体位置）

`F:\sanguo\game\cocos-build\web-mobile\cocos-js\cc.20d95.js`（1566598 B）中 `game._updateCallback`，字符偏移 **752663**：

```js
if (this._inited)
  if (EM.instance && !EM.instance.isFinished) EM.instance.update(this._calculateDT(!1));  // SplashScreen
  else if (this._shouldLoadLaunchScene) {                                                   // 启动场景
      EM.releaseInstance(); this._shouldLoadLaunchScene = !1;
      var i = AM("launch", "launchScene");
      i ? BB.loadScene(i, () => { J(1103, i); t._initTime = performance.now(); BB.startAnimation(); t.onStart?.() }) : (...)
  }
  else BB.tick(this._calculateDT(!1))                                                       // director.tick
```

配套事实（同一文件）：
- 偏移 **745817** 字段初始化：`e._shouldLoadLaunchScene = !0`（初值 true）。
- `getTotalFrames()` 的计数**只在 `BB.tick()`（director.tick）里累加**，而 `BB.tick()` 只在上面第三个分支执行；SplashScreen 阶段根本不进 `tick()`。
- 启动场景不是 `game.init` 直接载入的，而是**在帧回调里**才载入（`AM("launch","launchScene")` → `BB.loadScene`）。
- `_loadProjectBundles()`（把 main bundle 挂进 `assetManager.bundles`）在 `game.init` 的 promise 链里，**晚于 `_loadCCEScripts` 之前的若干 await，早于 `EM.createInstance().init()`**；`_inited = true` 在链最末尾。

于是有三条互相独立、可以各自单独触发的因果：

1. **帧循环停摆 → 永远停在 SplashScreen**（这是报障画面的那一条）
   `_shouldLoadLaunchScene` 一直是 true ⇒ 永远走第一个分支 ⇒ `director.tick()` 永不执行 ⇒ **`getTotalFrames()` 恒 0**；启动场景永不加载 ⇒ **`getScene()` 恒 null**；而 `cc` 早在 `init` 里就挂上了、canvas 也在 ⇒ 症状完全吻合。**而 `rAF` 在页面不被渲染时会被 Chromium 停掉**：后台 tab、窗口被其他窗口完全遮挡、窗口最小化，都会让 `_updateCallback` 不再被调用。画面停在"淡入到一半的 splash"正是这个状态的可视化。
2. **探测早于 `game.init` resolve → 1209**
   `loadScene` 的实现是 `var r = iT.bundles.find(e => !!e.getSceneInfo(t)); return r ? (...) : (rt(1209, t), !1)`；`preloadScene` 的 else 分支就是我复现到的那句 `Can not preload the scene "..." because it is not in the build settings.`。**两个报错都不读 settings 里的 scenes 列表**，它们只是"当前没找到持有该场景的 bundle"的统一话术。main bundle 还没被 `_loadProjectBundles` 挂上时，这句话就必然出现。
3. **两者叠加** = lead 看到的现场。

## 3. 决定性实验（四组，全部我自己的探针，脚本在 `F:\sanguo\work\`）

### 3.1 有头 Edge，完全模仿 lead 的 harness（`k7_headed.mjs`）→ 完全正常
`--window-size=900,1500`、全新 profile、attach 后 navigate、`innerWH=[876,1368]`（**与 lead 截图 876×1368 完全一致**）：

```
visibility:"visible"  innerWH:[876,1368]  k7.raf=826  rafIn800ms=49
framesBefore=712 -> framesAfter=761  inited:true  shouldLoadLaunchScene:false
paused:false  frameRate:60  engineInited:true  scene:"Boot"  canvas 876x1368  splashDom:false
k7.rej=[]  k7.err=[]
console: timeEnd LoadScene db://assets/scene/Boot.scene: 17.2568359375 ms
```

### 3.2 启动时间线（`k7_timeline.mjs`，每 250 ms 采样）→ 证明"frames=0 / scene=null"是正常相位
```
 263ms  inited=false shouldLoad=true  frames=0 scene=null  raf=3
 526ms  inited=true  shouldLoad=true  frames=0 scene=null       <- splash 期，完全健康
1048ms  inited=true  shouldLoad=true  frames=0 scene=null       raf=51
1571ms  inited=true  shouldLoad=true  frames=0 scene=null       raf=66
1834ms  inited=true  shouldLoad=true  frames=0 scene=null       raf=82
2095ms  inited=true  shouldLoad=false frames=3 scene=Boot       <- launch scene 到位
2358ms  frames=16    ... 9466ms frames=442  scene=Boot
```
**526–1900 ms 这段（约 1.4 s）`frames=0 && scene=null` 是健康产物也会有的**，任何人在这段里采样都会得到"坏包"的结论。

### 3.3 切后台 → 精确复现，回前台 → 自愈（`k7_freeze.mjs`）
```
1228ms  hidden:false  inited:true shouldLoad:true frames:0 scene:null   （正常 splash）
 打开第二个 tab（页面 hidden）
2783ms  hidden:true vis:"hidden" inited:true shouldLoad:true frames:0 scene:null
5794ms  同上
8798ms  同上
9605ms  同上        <- 7.5 秒以上一拍都没走
Page.bringToFront
10841ms hidden:false inited:true shouldLoad:false frames=19  scene:"Boot"
12851ms frames=140
16853ms frames=376 scene:"Battle"   （loadScene('Battle') 正常完成）
```
不刷新、不改任何东西，**只要页面重新被渲染就自愈**。这就是"14:03 能跑、14:42 之后跑不了"的全部差别——差别不在包，在窗口有没有在前台。

### 3.4 早探测 → 逐字复现 1209（`k7_early.mjs`，navigate 后 +250 ms）
```
probe at +250ms: {"hasCC":true,"inited":false,"engineInited":false,"frames":0,"scene":null}
loadScene: {"ret":"false"}
preloadScene: {"ret":"called"}
```
console 原文（与 lead 的 r171 dump 逐字相同）：
```
Error 1209, please go to https://github.com/cocos/cocos-engine/blob/3.8.8/EngineErrorMap.md#1209 to see details. Arguments: Battle
preloadScene: Can not preload the scene "Battle" because it is not in the build settings.
```

## 4. 排除过的假设（含被证伪的）

| # | 假设 | 结论 | 证据 |
|---|---|---|---|
| 1 | 浏览器/HTTP 缓存了旧产物 | **证伪** | `F:\sanguo\game\web\serve.mjs`(5173) 所有响应都带 `cache-control: no-store`；旧 hash `index.7784d.js`、`settings.be3d8.json` 实测 404；带 `?cb=<epoch>` 与不带，结果一致 |
| 2 | 持久 profile / localStorage / IndexedDB 脏数据 | **证伪** | robocopy `F:\sanguo\work\.edgeprof_cocos2`（lead 自己那份，1291 文件）→ `_k7_copyprof`，同一 URL（不带 cb）：`frames 714→763`、`scene:"Boot"`、`rej=[]`、`err=[]`，健康 |
| 3 | 14:42 之后的产物被打坏了 | **证伪** | 该产物在渲染中的页面里 2143 ms 进 Boot、三个场景全部可载、102 个 Sprite 出画面；三次构建参数逐字相同（`debug:false;md5Cache:true;buildPath=F:/sanguo/game/cocos-build;startScene=0b007000-...`），日志体积 86698/86828/86614 B |
| 4 | 构建丢场景 → 1209（报错文案的诱导） | **证伪** | `assets\main\config.3e33e.json` 与旧产物 `config.a837e.json` **SHA256 完全一致**（`0A81764A6FC21F9B419FD025B6242FAC26EE73341984AA356111580EB872597F`，929 B），Boot/Battle/Campaign/Deploy 四个场景映射与 paths 齐全；1209 只是"main bundle 还没挂上"的话术 |
| 5 | `settings.b832b.json` 与旧产物不同 → 启动配置坏了 | **证伪** | 两份均 21291 B，**唯一差异**在字节 983：`bundleVers.main = "3e33e"` vs `"a837e"`（就是 md5 后缀）。`launch.launchScene`、`preloadBundles`、`projectBundles`、`scripting.scriptPackages` 全同 |
| 6 | `index.html` 被改坏 | **证伪** | 与旧产物逐字相同，仅第 60 行 `System.import('./index.798ca.js')` 的 hash 不同 |
| 7 | k1 的 `CityModel.ts` / j3 的 `Draw.lightGrid` / k3 的 `generals.json` 引入顶层副作用、把包撑挂 | **证伪**（就本故障而言） | 页面里 `unhandledrejection=0`、`window.onerror=0`、`Runtime.exceptionThrown` 一条没有；启动 2143 ms 走到 Boot；若是脚本在 import 期抛错，`_inited` 不可能为 true、Boot 不可能出来 |
| 8 | 模块被 SystemJS 吞掉的 reject | **证伪** | 先 `Runtime.enable` 再 navigate，`__k7.rej`/`__k7.err` 全程 0；`index.798ca.js` 自身是 `topLevelImport('cc').then(init).then(start).catch(console.error)`，真 reject 会落 console |
| 9 | 构建脚本的 `Error: Exit process with code:null, signal:SIGTERM in task build-script` | **证伪** | 14:03 那次**成功**的构建里同样有这条（Cocos CLI 收尾杀进程的噪音） |
| 10 | `cc.director._sceneInfos` 为空 ⇒ 场景表丢了 | **证伪** | 它是废弃 getter，读 `iT.main.config.scenes`；assetManager 未就绪时返回 `[]` 是正常的，不能作为证据（改用 `assetManager.main` / `config.scenes` 判定） |
| 11 | "只要重建一次就会好" / "重建了还是坏" | **证伪** | 重建后产物健康（本次实测），但同一份健康产物用后台 tab 探测依然 `frames=0/scene=null` 恒久——**坏的不是包，是观测条件** |
| 12 | 探针读 `cc.assetManager.bundles` 报 ERR ⇒ 引擎异常 | 探针自身 bug | 实测它是 `[object Object]`，没有 `.keys/.map/.length`；写错的是我的探针，不是引擎 |

### 一个真实但不属于本故障的次生发现（未改，只记录）
在 **tab 处于后台时**发起 `cc.director.loadScene('Battle')`，回前台后 console 里会出现一条：
```
error: [BattleRoot] TypeError: Cannot read properties of null (reading 'bind')
       at ... assets/main/index.3e33e.js:25:7423
```
同一操作在**前台**（3.1/3.2 与最终验收里）重复多次都不复现（`LoadScene Battle: 8.278076171875 ms`，无任何异常）。即"页面不可渲染时切场景"这一非正常路径下的健壮性瑕疵，与本次启动故障无关；按"最小面"纪律未动。

## 5. 修法

**没有改任何一行产品源码**——证据链显示产物与脚本都健康，改代码只会制造风险。实际做的三件事：

1. **重新出包**（任务要求，也顺带排除"磁盘产物被半截写坏"）：`F:\sanguo\tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview`，单一构建未并发。产物时间戳 15:01:54–15:01:57，`index.html` 2187 B / `index.798ca.js` 824 B / `application.21a2f.js` 3308 B / `assets/main/index.3e33e.js` 776990 B / `config.3e33e.json` 929 B，与上一版同尺寸同 hash（说明源码确实没变）。
2. **修好"诊断路径"**（真正的缺陷在这里）：`F:\sanguo\work\cocos_verify\cdp.mjs` 是 `先 /json/new?<url> 再 attach`，所以**页面早期 console 永远抓不到**（这就是"无报错"的来源）；`run` 又只 attach 已经加载完的页面配固定 sleep。改用我新写的 `F:\sanguo\work\k7_verify.mjs`：
   - `Page.navigate` **之前**就 enable `Runtime/Log/Page/Network`；
   - `Page.addScriptToEvaluateOnNewDocument` 注入 `window.__k7 = {raf, rej, err}`（rAF 计数 + `unhandledrejection` + `error` 监听），这样"到底是没渲染还是抛错了"一眼可分；
   - **不再死等毫秒**，轮询 `cc.director.getScene()`（最多 40 s），只在真正 boot 完成后再断言；
   - 之后自动跑 Boot → Campaign → Battle，并遍历场景树统计 nodes/sprites/buttons/labels 后截图。
3. **写死一条运维规则**：验证 web-mobile 时必须让 Edge 窗口**在前台且未被遮挡**（或 `Page.bringToFront` / 用 headless）。否则 1.4–2.1 s 的正常启动窗口会被无限拉长成"永久黑屏"。

复现命令（谁都能一遍看到根因）：
```
# 1) 健康：等 scene 出现再断言
node F:\sanguo\work\k7_verify.mjs "http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=<epoch>" F:\sanguo\work\cocos_boot
# 2) 复现故障指纹：boot 中途把 tab 切后台，frames 会永远停在 0
node F:\sanguo\work\k7_freeze.mjs
# 3) 复现 1209：navigate 后 250ms 就 loadScene
node F:\sanguo\work\k7_early.mjs
```

## 6. 验收（全部真实输出）

### 6.1 构建
```
powershell -NoProfile -ExecutionPolicy Bypass -File F:\sanguo\tools\build_wechat.ps1 -AppId wxf631d432ca7abcee -Mode preview
EXIT=0
== 构建 web-mobile
· 参数：platform=web-mobile;debug=false;md5Cache=true;buildPath=F:/sanguo/game/cocos-build;startScene=0b007000-1a2b-4c3d-8e4f-000000000001
✓ web-mobile 构建完成
RESULT: PASS
✅ 出包成功：F:\sanguo\dist\wechat-preview
```
（完整日志 `F:\sanguo\work\build_k7.log`；Cocos CLI 明细 `F:\sanguo\work\build-logs\web-mobile_20261125_150131.log`，86689 B）

### 6.2 启动：frames 在涨 + scene 是 Boot
```
URL=http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=1795590146467
browser: Edg/158.0.4370.33
[1] booted in 2143ms -> scene=Boot frames=3 inited=true shouldLoad=false
  raw: {"hasCC":true,"inited":true,"shouldLoad":false,"paused":false,"frames":3,"scene":"Boot","k7":{"raf":107,"rej":0,"err":0}}
[2] frames 3 -> 61 over 1000ms (delta=58); scene=Boot
```
截图：`F:\sanguo\work\cocos_boot\01_boot.png`（876×1368，201806 B）—— 标题页正常：`三國群英傳 2 · 暨版`、`群雄逐鹿`、`開始新局 / 讀取存檔 / 說明`。

### 6.3 切场景：Campaign 与 Battle 都成功，不再 1209
```
[3] loadScene(Campaign): {"err":null,"scene":"Campaign"}     LoadScene Campaign: 12.067138671875 ms
[4] loadScene(Battle):   {"err":null,"scene":"Battle"}       LoadScene Battle: 8.278076171875 ms
[5] battle scene audit: {"scene":"Battle","nodes":249,"sprites":102,"buttons":0,
     "labels":["我軍  100/100","100/100  敵軍 張角","4.0s","雪 · 30Hz · 點技能格施放",
               "半月斬","單體","技22 · 氣22%","冰柱刺","技26 · 氣26%","將","Lv.6","關羽","在陣",
               "武 97 · 智 75","體 96","技 53","氣 60%",
               "A","保護主將","全軍護衛","S","部隊指令","陣形六令","D","武將技","點技能格",
               "F","武將出擊","主將上陣","G","主將後退","令：後退","H","全軍撤退","全軍離場",
               "突 擊","全軍突擊","撤 退","全軍離場","雙方接戰中 · 出征","敵 張角 Lv.5  武 70 · 智 88 · HP 85/85","1-8 / R"],
     "topChildren":["Canvas"]}
--- CONSOLE/EXC (4) ---
   timeEnd: LoadScene db://assets/scene/Boot.scene: 16.677978515625 ms
   timeEnd: LoadScene Campaign: 12.067138671875 ms
   timeEnd: LoadScene Battle: 8.278076171875 ms
   log: [BattleRoot] 兵種圖集為原作 FORCE 版：按陣營取背視/正視幀（M 藍軍 / N 紅軍）
```
- **1209 与 "not in the build settings" 一条都没有。** console 全程 4 条，无 error、无 exception、无网络失败。
- 大地图：`F:\sanguo\work\cocos_boot\02_campaign.png`（769181 B）——60 城、势力/物品、存档/名册、徵兵/開發/推進一月 都在。
- 战斗：`F:\sanguo\work\cocos_boot\03_battle.png`（1246436 B）——**双方列阵有兵**（左蓝 24 骑步、右红多队、主将 關羽 骑马在阵），**顶部 HUD**（我軍 100/100、4.0s 计时、敵軍 張角 100/100 血条），**右下六按钮 A/S/D/F/G/H** = 保護主將 / 部隊指令 / 武將技 / 武將出擊 / 主將後退 / 全軍撤退，左下技能格 1 半月斬 / 2 冰柱刺 + 突擊 / 撤退，底部戰報行。
- 说明：audit 里 `buttons:0` 是因为这六个按钮不是 `cc.Button`（引擎 Button 组件）而是自绘 sprite+label 的点击区，**用 label 文本与截图双重确认**，计数 0 不代表性缺失。

### 6.4 类型检查
```
cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
TSC_EXIT=0
```

### 6.5 web 侧单测（确认没连带）
```
cd F:\sanguo\game; node --test tests/*.test.ts
ℹ tests 1354   ℹ suites 68   ℹ pass 1354   ℹ fail 0   ℹ cancelled 0   ℹ skipped 0   ℹ todo 0
ℹ duration_ms 17386.1586
```

## 7. 有没有回退别人这轮的东西

**没有。零行源码改动。**
- k1 的 `game\cocos\assets\scripts\CityModel.ts`（GarrisonRow / gateTroopsOf / deployTargets / develop 关城闸门）、`DeployRoot.ts`（enemySoldiers / labelIntel / 副标题）——**未动**。
- j3 的 `CampaignRoot.ts`、`DeployRoot.ts` 里的 `Draw.lightGrid` 调用——**未动**。
- k3 的 `game\cocos\assets\bundles\res\data\generals.json`（712,813 B，5 个 `*_by_times`）——**未动**。
- `BattleHud.ts`（1036→1025）、两份 `unlock.ts`——**未动**。
- `game\src\**`、`game\web\**`、`project\**`、`game\data\**`——**未动**。
- 唯一新增的东西全在 `F:\sanguo\work\`（我的探针与截图）和构建产物目录（正常出包），加上本报告。

反过来说：因为根因不在代码，**不需要也不应该回退任何人的改动**；那 1354 条测试与 `tsc` 全绿也说明这轮业务改动本身是好的。

## 8. 给下一位的一句话

看到 `frames=0 + scene=null + 1209 + 无报错`，先按顺序确认三件事：**(a) 页面是不是真的在被渲染（前台、未遮挡、`visibilityState==='visible'`）；(b) 距 navigate 是否已过 ~2.1 s；(c) 你的 CDP 是不是在 navigate 之前就 attach 了。** 三条都满足还起不来，才是真的包坏了。
