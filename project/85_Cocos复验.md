# 85 · Cocos 产物运行时复验（Battle / 内政 / 物品 / 出征 / 帧耗时 / 微信包）

- 复验者：子代理 `x6-cocos-verify2`（父 `lead`）
- 时间：2026-11-25 05:39–06:05（Asia/Shanghai）
- 站点（常驻）：`http://127.0.0.1:5173/cocos-build/web-mobile/index.html`（根 = `F:\sanguo\game`，pid 78004）
- 浏览器：Edge `Edg/158.0.4370.33`，Node v24.21.0，CDP 全链路（`Page.captureScreenshot`，零依赖）
- 工具：**原样复用**上一轮 `F:\sanguo\work\cocos_verify\cdp.mjs`（launch / run / close）+ `wechat_check.mjs`，未改一行
- 本轮新增件全部落在 `F:\sanguo\work\cocos_verify2\`（脚本、产物副本、截图、console 落盘）

---

## 0. 一句话结论

1. **Battle 没有修好。** `Mask` 那一处确实修好了（本轮 A/B 直接证实：崩溃点从 `BattleBg` 移到下一处），但 `BattleRoot.buildUi()` 紧接着在 `new AudioHost(...)` → `node.addComponent(AudioSource)` 处抛 **第二次 `Error 3804`**：`AudioSource` 在构建出的引擎里**根本不存在**。代价是 `buildUi` 在画完背景带就中断 —— 战场现在**有背景带 + 地面**（不再是黑屏），但**没有双方主将三层小人、没有士兵、没有 HUD**。
2. **内政页（CityPanel）可以打开**，朝堂带（PALAIS）正常显示：人口/金/兵/預備兵/防務/太守 + 軍師/內政效率/武將/疲勞/士氣/月令 + 九宫命令键 + 紀錄区，全部正常。
3. **物品页（ItemsPanel）可以打开**，關羽卡 + 12 名武将头像 + 全部/兵器/坐騎/兵書/實物/兵符/陣法 分页 + 加成面板 + 上下頁/全部解鎖/返回，全部正常。
4. **出征编成屏（Deploy）可以打开**：主将选择、兵种栅格（未學置灰）、陣形、軍師技、兵力滑杆、出征按钮，正常。
5. **微信包静态检查 26/30 通过**，4 项失败；其中 `Z2 子包 15.80 MB` 按本轮口径（微信单个普通分包不限大小，只看主包 ≤4 MB、总 ≤20 MB）**不是红灯**：主包 2.00 MB ✓、总 17.80 MB ✓。
6. **战场 60 帧平均帧耗时 16.66 ms（≈60.0 fps）** —— 但这是"背景带 + 地面"这一残缺战场的数字，不是完整战场的数字（见 §6 局限）。

---

## 1. 必须先讲的前提：`web-mobile` 根本没有重新构建

任务书说 05:37 重新构建了 `game\cocos-build\web-mobile\` 与 `dist\wechat-upload\` 两套产物。**实测只有微信小游戏那套是新的：**

| 产物 | 路径 | 最新 mtime | 证据 |
|---|---|---|---|
| web-mobile（任务书说已刷新） | `F:\sanguo\game\cocos-build\web-mobile\` | **2026-11-25 04:49:38**（3127 文件 / 45,690,454 B） | `assets\main\index.2e8e7.js` 内 `MaskComponent` 出现 **0** 次、`Mask` 1 次；`CityPanel` 0 次、`ItemsPanel` 0 次、`GeneralArt` 0 次 |
| wechatgame（真正的 05:37 新产物） | `F:\sanguo\game\cocos-build\wechatgame\` | **2026-11-25 05:37:42**（3069 文件 / 35,501,875 B） | `assets\main\index.bd880.js`（338,260 B）内 `MaskComponent` 1 次、`CityPanel` 14 次、`ItemsPanel` 13 次、`GeneralArt` 7 次 |
| dist\wechat-upload | `F:\sanguo\dist\wechat-upload\` | 05:37 之后（2962 文件 / 18,661,691 B = 17.80 MB） | 与任务书"合计 17.80 MB"吻合 |

即：`tools\build_wechat.ps1` 那次带 `-SkipWeb`（或 web 分支失败），**web-mobile 仍是 04:49 的旧产物**，直接打开它只能复现"旧崩溃"，不能验证任何新代码。

### 因此本轮采用的复验方法（全部在 `work\cocos_verify2\` 内，不碰任何受保护目录）

在 `F:\sanguo\work\cocos_verify2\cocos-build\` 下用**产物副本 + 自建静态服务**做单变量对照；页面 URL 保留 `cocos-build` 字样以复用 `cdp.mjs` 的 page 过滤。自建服务：`node` 原生 http，`127.0.0.1:5188`，root = `F:\sanguo\work\cocos_verify2`（`cache-control: no-store`）。

| 副本 | 内容 | 用途 |
|---|---|---|
| `p0_stale` | 04:49 旧产物原样（`assets\main\index.2e8e7.js` 240,086 B，`d=t.Mask`） | 崩溃基线（等价于 74 号报告现场） |
| `p1_fixmask` | `p0` + **只改 1 处**：`d=t.Mask` → `d=t.MaskComponent`（8 字符） | A/B 单变量，证明 Mask 修复本身有效 |
| `p2_hybrid` | `p0` 的 runtime + **换成 05:37 新主包脚本**（`index.bd880.js` → 改名 `index.2e8e7.js`），res 仍是旧的 | 先跑通新代码（旧 res 缺新图，只作过渡） |
| `p3_newfull` | `p2` + **换成 05:37 新 res 包**（3042 文件 / 33,413,963 B）+ `settings.04038.json` 的 `assets.bundleVers.res` 改 `df1a7`→`7d75d` | **本轮主证据**：05:37 的新脚本 + 新美术 + web runtime |

为什么 `p3` 可以作为新产物的等价复现：两套产物的 `assets\main\config.*.json` **逐字节相同**（6 个 uuid、4 个场景、import 版本哈希 `2fd3b/83405/45f23/658da` 全一致），`assets\res` 结构也一致（`import/`+`native/`，同样是 .json/.webp/.png/.mp3）；差别只在脚本包与 res 的增删条目。换入后 Campaign 能正常读出新增的 `bg/policy/*` 等资源（旧 res 下会打印 `[ArtLayer] load(...) 失敗：Bundle res doesn't contain bg/policy/floor_03`，新 res 下该警告消失）。
**唯一不可消除的差异**：引擎二进制（web `cocos-js\cc.ac421.js` vs 微信 `cocos-js\cc.705f1.js`）。这一点对本轮结论无影响 —— 两个引擎**都**没有 `AudioSource`（见 §4.3），所以 3804 在真机包上同样会发生。

---

## 2. 截图索引（主证据 = `r3_p3_newfull`）

全部 876×1368 px（viewport 769×1368，`--force-device-scale-factor=1`，`--window-size=900,1500`），`Page.captureScreenshot` PNG。

| # | 路径 | 字节 | 内容判定 |
|---|---|---|---|
| 1 | `F:\sanguo\work\cocos_verify2\r3_p3_newfull\01_campaign.png` | **677,954** | 大地图：省份边界 + 海岸线 + 城名贴在地图上（代縣/南皮/平原/鄴/陳留/許昌/洛陽/長安/上庸/襄陽/江陵/長沙/予章/建業/吳/永安/江州/成都/雲南/零陵…），底部 徵兵/開發/推進一月 + 内政行；顶部 HUD 金 1200 / 城 6 / 戰績 3 勝 0 敗 / 物品按钮。⚠ 底图偏模糊，顶部有一条 ~50 个城名被压成一行并左右裁切（见 §7） |
| 2 | `F:\sanguo\work\cocos_verify2\r3_p3_newfull\02_city_panel.png` | **574,012** | **内政页正常**：朝堂带（红帷/殿柱/甲士/文官/案几）+ 左列 人口 79,500 / 金 1,200 / 兵 141/600 / 預備兵 141/141 / 防務 377 / 太守 —；右列 軍師 — / 內政效率 ×1.00 / 武將 0 / 疲勞 0/100 / 士氣 60/100 / 月令 可下；九宫 開發·部隊徵兵·搜索·移動武將·太守·軍師·物品·情報·出征·自治施行；紀錄区 |
| 3 | `F:\sanguo\work\cocos_verify2\r3_p3_newfull\03_items_panel.png` | **272,941** | **物品页正常**：物品/裝備 头（共 1 件·可裝備 0·背包 12 件·已裝備 0/4）+ 關羽卡（武力 99/智力 85/生命 85/速度 0，所在 代縣，忠誠 100）+ 兵器/坐騎/兵書/實物 四格空位 + 12 名武将头像条 + 分页 全部/兵器/坐騎/兵書/實物/兵符/陣法 + 實物 1 件列表 + 右 加成 面板 + 上頁/第 1/1 頁/下頁 + 全部解鎖/返回 |
| 4 | `F:\sanguo\work\cocos_verify2\r3_p3_newfull\04_deploy.png` | **644,464** | **出征编成屏正常**：目標 壺關·從 晉陽 出征·守軍 110 兵；關羽 武力 99/智力 85/節操 6/等級 20、必殺 2、軍師技 0、敵將 守備隊(武 38/智 26)、敵兵種 雁形·我 朴刀·方形、相剋 +82、無守將；主将 12 人；兵種栅格（朴刀可選，其餘 未學 置灰）；陣形（方形可選）；軍師技 不用；兵力 100/100 滑杆 + 50/80/100 兵；返回/出征 |
| 5 | `F:\sanguo\work\cocos_verify2\r3_p3_newfull\05_battle.png` | **973,297** | **Battle 半成品**：背景带（城墙/城楼/远山/树木）+ 地面砖块铺满，顶部有木纹装饰条 —— **背景带这一层修好了**；但**没有主将三层小人、没有士兵、没有任何 HUD/Label**，y≈1000 以下全黑。原因见 §4 |

对照/次要证据：

| 用途 | 路径 | 字节 | 说明 |
|---|---|---|---|
| 旧产物基线（04:49） | `F:\sanguo\work\cocos_verify2\r0b_p0_stale_battle\battle_only.png` | **65,936** | 与 74 号报告完全一致的"黑屏 + 顶部 HUD"，nodes 6 |
| Mask 补丁后（旧代码） | `F:\sanguo\work\cocos_verify2\r1_p1_fixmask\05_battle.png` | **973,684** | 与 05 同形态：只有背景带+地面 |
| 旧 res + 新脚本 | `F:\sanguo\work\cocos_verify2\r2_p2_hybrid\05_battle.png` | **975,046** | 同上；该轮 01_campaign 因旧 res 缺新图而退化（651,127 B） |
| 旧产物大地图（对照） | `F:\sanguo\work\cocos_verify2\r0_webmobile\01_campaign.png` | **857,868** | 04:49 版：清晰地图 + 约 50 个粉色城点、城名各贴点旁、无顶部城名条 |
| 旧产物内政/物品位置 | `F:\sanguo\work\cocos_verify2\r0_webmobile\02_city_panel.png` / `03_items_panel.png` | 857,868 / 857,868 | 与 01 字节几乎相同（857,868）→ **点城、点物品什么都没发生**（旧产物无 CityPanel/ItemsPanel） |

---

## 3. console 全文

### 3.1 主证据：`p3_newfull` 一次跑完整链路（`console_steps_chain.json`，1,574 B）

```
0 [timeEnd] LoadScene db://assets/scene/Boot.scene: 17.050048828125 ms
1 [timeEnd] LoadScene Campaign: 18.35791015625 ms
2 [timeEnd] LoadScene Deploy: 26.506103515625 ms
3 [timeEnd] LoadScene Battle: 23.027099609375 ms
4 [error] TypeError: Error 3804, please go to https://github.com/cocos/cocos-engine/blob/3.8.8/EngineErrorMap.md#3804 to see details.
    at e.addComponent (http://127.0.0.1:5188/cocos-build/p3_newfull/cocos-js/cc.ac421.js:1:382014)
    at new t (http://127.0.0.1:5188/cocos-build/p3_newfull/assets/main/index.2e8e7.js:7:2705)
    at s.buildUi (http://127.0.0.1:5188/cocos-build/p3_newfull/assets/main/index.2e8e7.js:13:6638)
    at s.onLoad (http://127.0.0.1:5188/cocos-build/p3_newfull/assets/main/index.2e8e7.js:13:2469)
    at eval (eval at FB (http://127.0.0.1:5188/cocos-build/p3_newfull/cocos-js/cc.ac421.js:1:678857), <anonymous>:3:65)
    at e._invoke (http://127.0.0.1:5188/cocos-build/p3_newfull/cocos-js/cc.ac421.js:1:678954)
    at i.invoke (http://127.0.0.1:5188/cocos-build/p3_newfull/cocos-js/cc.ac421.js:1:678013)
    at e.activateNode (http://127.0.0.1:5188/cocos-build/p3_newfull/cocos-js/cc.ac421.js:1:682221)
    at e._activate (http://127.0.0.1:5188/cocos-build/p3_newfull/cocos-js/cc.ac421.js:1:544667)
    at i.runSceneImmediate (http://127.0.0.1:5188/cocos-build/p3_newfull/cocos-js/cc.ac421.js:1:700064)
--- exceptions (0) ---
--- netFails (0) ---
```

- **console error 条数 = 1**（就是这条 3804）；`Runtime.exceptionThrown` 0 条；`Network.loadingFailed` 0 条；其余 4 条是 `timeEnd` 计时。
- ⚠ 注意：`p3_newfull\assets\main\index.2e8e7.js` 是 **`wechatgame\assets\main\index.bd880.js` 的字节副本**（338,260 B，改的只是文件名），所以 `7:2705 / 13:6638 / 13:2469` 这几处行:列在真实新产物里是同一位置。
- 三次 `LoadScene` 全部成功（Campaign / Deploy / Battle），说明场景装配、切场景、点击链路本身没问题，问题只出在 Battle 的 `onLoad`。

### 3.2 崩溃基线（`p0_stale`，04:49 旧产物，`console_steps_battle_only.json`）

```
0 [timeEnd] LoadScene db://assets/scene/Boot.scene: 17.092041015625 ms
1 [timeEnd] LoadScene Campaign: 18.50146484375 ms
2 [timeEnd] LoadScene Battle: 16.89306640625 ms
3 [error] TypeError: Error 3804, please go to https://github.com/cocos/cocos-engine/blob/3.8.8/EngineErrorMap.md#3804 to see details.
    at e.addComponent (.../p0_stale/cocos-js/cc.ac421.js:1:382014)
    at new t (.../p0_stale/assets/main/index.2e8e7.js:11:1693)
    at o.buildUi (.../p0_stale/assets/main/index.2e8e7.js:13:6934)
    at o.onLoad (.../p0_stale/assets/main/index.2e8e7.js:13:2428)
    ...（后 5 帧同 §3.1）
```
`11:1693` 落在我反编译出的 **`chunks:///_virtual/BattleBg.ts`** 模块里，即
`o.addComponent(d).type=d.Type.GRAPHICS_RECT`（`d = t.Mask`，`Mask` 为 `undefined`）→ **与 74 号报告的根因判断完全一致**。

### 3.3 Mask 补丁后（`p1_fixmask`，只改 8 字符）

```
... LoadScene Battle: 32.658203125 ms
4 [error] TypeError: Error 3804 ...
    at e.addComponent (cc.ac421.js:1:382014)
    at new t (assets/main/index.2e8e7.js:7:2365)     ← 换位置了：BattleBg → AudioHost
    at o.buildUi (index.2e8e7.js:13:6964)
    at o.onLoad (index.2e8e7.js:13:2428)
```
（该轮 console 共 9 条，其中 2 条是同一条 3804 —— 我在同一页面里连跑了两次链路，第一次的 Battle 装配也留了一条；`exceptions 0 / netFails 0`）

### 3.4 `p2_hybrid`（新脚本 + 旧 res）额外警告

```
2 [warning] [ArtLayer] load('bg/policy/floor_03', ImageAsset) 失敗：Bundle res doesn't contain bg/policy/floor_03
3 [warning] [ArtLayer] load('bg/policy/floor_03') 失敗，回退佔位：Bundle res doesn't contain bg/policy/floor_03
```
→ 旧 res 缺新美术（换入新 res 的 `p3` 里这两条消失）。这属于"产物没同步"的直接证据，不是代码 bug。

### 3.5 04:49 旧产物跑完整链路（`r0_webmobile`，证明旧产物确实没有面板）

```
0 [timeEnd] LoadScene db://assets/scene/Boot.scene: 17.18994140625 ms
1 [timeEnd] LoadScene Campaign: 17.666015625 ms
2 [timeEnd] LoadScene Deploy: 16.64794921875 ms
--- exceptions (0) ---   --- netFails (0) ---
```
**0 error** —— 因为点城/点物品/出征进入 Battle 都没发生（Battle 根本没进：`click go` 坐标错在上一轮 `steps_deploy.mjs` 的 y 翻转，见 §8）。状态探针：`hasCityPanel:false, hasItemsPanel:false`。

---

## 4. Battle 判定：**没修好**（Mask 那一处修好了，但下游还有第二处 3804）

### 4.1 双证据（截图 + console）

| 副本 | 代码 | 场景节点数 | Sprite | Graphics | Mask | Label | 截图字节 | 3804 抛点 |
|---|---|---|---|---|---|---|---|---|
| `p0_stale` | 04:49 旧（`d=t.Mask`） | **6** | 1 | 0 | 0 | 0 | **65,936**（黑屏+HUD） | `new t (11:1693)` = **BattleBg** |
| `p1_fixmask` | 旧 + 仅换 `MaskComponent` | **31** | 22 | 2 | **1** | 0 | **973,684**（背景带+地面） | `new t (7:2365)` = **AudioHost** |
| `p2_hybrid` | 05:37 新脚本 + 旧 res | **31** | 22 | 2 | **1** | 0 | **975,046** | `new t (7:2705)` = **AudioHost** |
| `p3_newfull` | 05:37 新脚本 + 新 res（主证据） | **31** | 22 | 2 | **1** | 0 | **973,297** | `new t (7:2705)` = **AudioHost** |

统计口径：`System.import('cc')` 取真实构造函数做 `instanceof`（3.8.8 web 产物里 `constructor.name` 被 minify 成 `'e'`，**不能用** —— 74 号报告的 `labels/sprites` 统计因此不可信，本轮已改为 `instanceof`）。

**读法：**
- `p0 → p1` 是单变量 A/B（只差 8 个字符）：节点 6→31、Sprite 1→22、Graphics 0→2、**Mask 0→1**、截图 65,936→973,684 B、抛点从 `BattleBg` 前移到 `AudioHost`。→ **`Mask`/`MaskComponent` 这一处确实修好了，74 号报告的诊断成立。**
- 但 `p1/p2/p3` 三条（旧代码打补丁 / 新脚本 / 新脚本+新 res）**全部**在同一位置再抛一次 3804，且都是 `AudioHost`。→ **这不是"某份产物没刷新"的偶然，而是 05:37 新代码里稳定存在的第二个崩溃点。**

### 4.2 崩溃机制（反编译新脚本包得到，可复核）

新主包 `chunks:///_virtual/BattleRoot.ts` 的 `onLoad → buildUi` 顺序（`index.bd880.js` 内原文）：

```js
buildUi = function () {
  this.buildArt(),
  this.bg = new L(this.node, 0),          // ← BattleBg：背景带/地面/遮罩（已修好，Mask 正常）
  this.audio = new B(this.node),          // ← AudioHost：这里抛 3804
  this.audio.install(),
  this.gBase  = this.makeGraphics("BattleBase"),   // 以下全部没执行
  this.gA     = this.makeGraphics("UnitsA"),
  this.gB     = this.makeGraphics("UnitsB"),
  this.gGeneral = this.makeGraphics("Generals"),
  this.gFx     = this.makeGraphics("Fx"),
  this.unitLayer = new c("UnitSprites"), ...
  this.generalArt = new X(this.nod…               // 双方主将三层小人
```

`chunks:///_virtual/AudioHost.ts` 的构造函数（抛点 `7:2705`）：

```js
setters:[ ..., function(t){ i=t.cclegacy, e=t.AudioClip, n=t.Node, o=t.AudioSource }, ... ]
...
var f = new n("Voice"+p); f.parent = this.root, this.voices.push({ node: f, source: f.addComponent(o) })  // ← o === undefined
```

即 `addComponent(undefined)` → Cocos `Error 3804`（"The component to add is invalid"）。
**连带后果**：`gBase/gA/gB/gGeneral/gFx` 五个 Graphics 层、`UnitSprites` 单位层、`GeneralArt` 主将层、HUD/Label 全部没建 —— 这正是 05 号截图"只有背景带、没有小人没有士兵"的原因；也解释了为什么 `labels = 0`（`HudBar` 是场景里预先存在的节点，不会自己长 Label）。

### 4.3 为什么 `AudioSource` 是 `undefined`：引擎构建时把音频模块裁掉了

| 证据 | 内容 |
|---|---|
| 浏览器内实测（web 引擎，`System.import('cc')`） | `{"AudioSource":"undefined","AudioClip":"undefined","Audio":"undefined","AudioSourceComponent":"undefined","Mask":"undefined","MaskComponent":"function","Label":"function","Sprite":"function","Graphics":"function","UITransform":"function","__keys":378,"audioKeys":[],"maskKeys":["BitMask","BITMASK_TAG","MaskComponent"]}` |
| web 引擎文件 `F:\sanguo\game\cocos-build\web-mobile\cocos-js\cc.ac421.js`（1,537,198 B） | 378 个导出里 `audioKeys = []`（一个 audio 相关导出都没有） |
| 微信引擎文件 `F:\sanguo\game\cocos-build\wechatgame\cocos-js\cc.705f1.js`（1,392,029 B） | 字符串 `AudioSource` 出现 **0** 次、`AudioClip` **0** 次（连类名注册都没有） |
| 微信包里有没有音频资源 | `wechat_check.mjs` A6：磁盘上 `/audio/` 命中 **0** 个文件；但 `audio-manifest.json` 声称 109 个文件/16,851,271 B；`res` config 声明了 1508 个 native 资产，缺 109 个且**全是 audio** |

→ 结论：**音频模块（engine module）与音频资源（res native）在构建时被整体排除了**，而 `AudioHost.ts` 硬依赖 `cc.AudioSource` / `cc.AudioClip`，运行期必然 3804。这与 "web-mobile 未重建" 无关 —— 微信真机包也是同一套（脚本里 `r=t.AudioSource`，引擎里没有）。

**修复方向（给修理工，不是我改）：** 任选其一并重新构建 web-mobile + wechat 两套
1. 项目设置 → 功能裁剪/引擎模块里把 **Audio** 打开（Cocos Creator 3.8「项目设置 → 功能裁剪」），或构建面板里不要勾"剔除未使用模块"；
2. 在任一场景/预制体里放一个 `AudioSource` 组件，让裁剪器认为该模块被使用；
3. 代码侧兜底：`AudioHost` 里 `const AS = (cc as any).AudioSource; if (!AS) { this.disabled = true; return; }`，并对 `AudioClip` 同样处理 —— 但**这只是不崩，声音仍然没有**，只能作为临时护栏。

### 4.4 如果只想先救 Battle 的可玩性

`buildUi` 里把 `this.audio = new B(this.node); this.audio.install()` 用 `try/catch` 包住（或按 4.3-3 守卫），让后面的 5 个 Graphics 层、`UnitSprites`、`GeneralArt` 继续建 —— 这样即使没有声音，主将三层小人与士兵也能出来。**但这属于改代码，我没有做**（死规矩）。

---

## 5. 微信包静态检查（`node F:\sanguo\work\cocos_verify\wechat_check.mjs`，原样复用）

`ROOT = F:\sanguo\dist\wechat-upload`，全程只读。原始输出落在 `F:\sanguo\work\cocos_verify2\wechat_check_out.txt`。

**26/30 通过。** 逐项：

| 组 | 结果 |
|---|---|
| M1 game.json 可解析 | ✓ `["deviceOrientation","networkTimeout","subpackages"]` |
| M2 portrait | ✓ |
| M3 声明 subpackages | ✓ count=1 names=res |
| **M4 子包 root 无首尾斜杠** | **✗** `res -> "subpackages/res/"` ← 微信要求 root 是纯目录名，尾斜杠有被判非法的风险 |
| M5/M6 子包目录 + entry | ✓ `subpackages/res`、`res/game.js` 40 B `// asset-only subpackage: no entry code` |
| S1–S7 | ✓ 全部（settings.a22e7.json 1982 B；launchScene=Boot 在 main.scenes；bundleVers 与磁盘一致 `internal:8f131 / main:bd880 / res:7d75d`；projectBundles 目录齐全；四个场景都在） |
| G1–G5 | ✓ 全部（game.js require 目标全在；无 BOM；application.c088e.js 一致；`cocos-js\cc.705f1.js` 1,392,029 B；adapters 齐全） |
| A internal/main/res import 全命中 | ✓（main 6/6，res 1532 声明 / 136 命中 / 0 缺） |
| **A res native 全命中** | **✗** declared=1508 / have=1397 / **missing=109**，`first=38:e44e2,54:88f67,89:409cd,…` |
| A 缺失项归类 | ✓ `missing=109 其中 audio 路径=109`（样例 `audio/sfx/m038snd01`、`audio/bgm/06`、`audio/sfx/m020snd02`、`audio/sfx/m005snd01`） |
| **A5 无 res/audio 悬挂引用** | **✗** `assets\main\index.bd880.js(2)`、`audio-manifest.json(219)`、`subpackages\res\config.7d75d.json(110)`、`import\a7\a78be7ed-….json(4)`、`import\b8\b81ff5a3-….json(1)` 共 6 个文件 |
| A6 磁盘 audio 文件 | ✓ **0 个命中**（即 109 个声明一个都没有） |
| A7 audio-manifest 可解析 | ✓ version=1 bundle=res source=`assets/bundles/res/audio` count=109 bytes=16,851,271 |
| Z1 总体量 | ✓ files=2962 bytes=18,661,691（**17.80 MB**）主包=**2.00 MB** 子包=**15.80 MB** |
| **Z2 子包体积** | **✗（按旧口径仅提示）** `subpackages/res = 15.80 MB / 超限 3.9×` |

**判定口径（按本轮任务书）：**
- `Z2` **不算红灯**：微信小游戏「单个普通分包不限大小」，官方限制是**主包 ≤4 MB、所有分包合计 ≤20 MB**。实测主包 **2.00 MB** ✓、总 **17.80 MB** ✓。该断言是脚本里写死的 4 MB 单包阈值，建议下轮把 Z2 改成"主包 ≤4 MB / 总 ≤20 MB"两个断言，否则每轮都会误报。
- `M4`（root 尾斜杠 `subpackages/res/`）**建议修**：改 `game.json` 里 `"root": "subpackages/res"`，零风险。
- `A / A5 / A6`（109 个 audio 全缺 + 悬挂引用）**是真问题**，而且和 §4.3 是同一个根因面（音频整体被排除）。要么把音频补进包，要么把 `audio-manifest.json`、`res` config 里的 audio 条目、以及 `AudioHost` 的依赖一起摘掉。

---

## 6. 战场 60 帧帧耗时

**方法**：在 `p3_newfull` 的真实点击链路进入 Battle 后（`loadScene` 完成、稳定 5 s），页面内用 `requestAnimationFrame` 连续采样 60 帧：

```js
new Promise((resolve) => {
  const t = []; let last = performance.now(); let n = 0;
  const tick = () => { const now = performance.now(); if (n > 0) t.push(now - last); last = now; n++;
    if (n <= 60) requestAnimationFrame(tick);
    else { /* 排序求 avg / median / p95 / min / max */ } };
  requestAnimationFrame(tick);
});
```
即：丢弃第 1 个间隔（含回调注册开销），对剩下 **59 个帧间隔**统计；`cc.game.frameRate = 60`（引擎侧目标帧率）。
选择 rAF 而不是 `Performance.getMetrics` 的原因：`getMetrics` 给的是进程级计数（`Frames`/`LayoutCount` 等）与累计耗时，**算不出单帧耗时分布**；rAF 间隔直接反映呈现节奏，且与玩家感知一致。

**结果（`p3_newfull`，Battle 场景）**

```json
{"frames":59,"avgMs":16.66,"medianMs":16.8,"p95Ms":18.4,"minMs":14.6,"maxMs":18.5,"fps":60,"frameRate":60}
```

另两份副本读数一致（说明不是偶发）：`p1_fixmask` `avg 16.70 / median 16.9 / p95 19.2 / fps 59.9`；`p2_hybrid` `avg 16.69 / median 17.7 / p95 18.6 / fps 59.9`。
对照：同一浏览器里 Campaign 场景（`r0`）也是 `avg 16.67 / fps 60`，即**这个 Edge/headless-GPU 组合在当前窗口尺寸下稳定跑在 60 fps 上限，16.7 ms 就是"被 vsync 卡住"的值，不是渲染开销**。

**局限（必须讲清）：** 这次 Battle 在 `buildUi` 就中断了，场上只有背景带 + 6×3 地面砖 + 暗角，**没有主将/士兵/HUD**。所以 16.66 ms **不能代表完整战场的开销**；要拿真实数字，得先修掉 §4 的 3804。

---

## 7. 大地图观察（顺带发现，需 owner 判断）

`p3_newfull\01_campaign.png`（新脚本 + 新 res）：

1. ✅ 省份边界 + 海岸线 + 城名贴图（原作 chinamap 风格），已**不是** 04:49 那套"50 个粉色圆点"的旧 CampaignRoot。
2. ⚠ **底图明显模糊**：整张 chinamap 被放大后呈软焦，左侧/右侧还有拼接缝与横向色带（截图 x<40、x>830 处可见暗条）。若原作 chinamap 位图本身分辨率偏低，这是素材问题；若是被放大（750 宽设计 resolution 下按原图尺寸绘制），需要换成高分辨率源图或改成 `Sprite.SizeMode.RAW` + 允许超出。
3. ⚠ **城点图元只看到 4 个**（成都/江州/雲南/零陵，橙红色城楼图标）+ 襄平处的选中圆环 + 1 个红点。旧产物是 ~50 个城点全绘制。"4 档城点"如果本意是按城池等级画不同图元，那现在绝大多数城没有任何图元，看起来像只画了某一档（或只画了某一类城）。
4. ⚠ **顶部有一条 ~50 个城名被压成一行、左右被裁切**的文字条（`西涼 下邳 建寧 天水 漢中 安定 弘農 …` 一直排到 `夷州`，与地图上的城名重复）。地图上的城名是对的，这条应该是多余的"城名列表"被画在了错误位置（或 y 全为 0），建议当作 UI 缺陷修。
5. 参考：04:49 旧产物 `r0_webmobile\01_campaign.png` 是清晰地图 + 每城一个粉点 + 城名贴点旁，无顶部文字条 —— 对比可直接看出新 CampaignRoot 的退化点。

（这 3 条属于"看到就说"，不是本轮的验收项；我没有改任何代码。）

---

## 8. 对上一轮（74 号）结论的修正

| 74 号说法 | 本轮实测 |
|---|---|
| `BattleBg.ts:26` 从 `'cc'` 导入 `Mask` 是 `undefined` → 3804 | **成立**。`p0` 抛点 `11:1693` 落在 BattleBg 模块；`System.import('cc').Mask === undefined`、`MaskComponent === function` |
| 修成 `MaskComponent as Mask` 即可解决 Battle 崩溃 | **不成立（不够）**。修掉之后 `buildUi` 前进了一步，在 `AudioHost` 处抛第二处 3804（`AudioSource` undefined） |
| Battle 崩溃栈里的 `labels/sprites` 统计（Label 0 / Sprite 0） | **统计方法不可靠**。3.8.8 web 产物 `constructor.name` 被 minify 成 `'e'`；本轮改用 `instanceof` 后 p0 实测 Sprite=1、p1/p3 Sprite=22 |
| `steps_deploy.mjs` 里 `toPage(dx,dy)=[vx+dx*s, vy+(dh-dy)*s]`（y 翻转） | **错**。Campaign 的 `actionRects`/`cityScreen` 与 Deploy 的 `buttons[]` 都是**左上原点、y 向下**；按翻转算会把「出征」点到 y=84（屏幕顶部），永远进不了 Battle。本轮改为不翻转后 `click go = [628,1284]`，一次点中 |
| 微信包 `Z2 子包 13.83MB 超限` 是红灯 | **口径已变**：单个普通分包不限大小，主包 2.00 MB / 总 17.80 MB 均达标 → 不是红灯（详见 §5） |

---

## 9. 没验到的 / 需要下一轮补的

1. **真实 `web-mobile` 新产物没有**（04:49 那个还是旧的）。本报告的 5 张主截图来自"新脚本 + 新 res + web runtime"的等价副本 `p3_newfull`，**不是** 5173 上那个页面。要拿"官方产物"的截图，必须先真正重建 web-mobile（`tools\build_wechat.ps1` 去掉 `-SkipWeb`，或单独跑 web 构建），然后 `node work\cocos_verify\cdp.mjs launch`（`PAGE_URL` 用默认 5173 那个）重跑 `steps_chain.mjs`。
2. **微信真机/开发者工具没跑**。小游戏包无法在浏览器里跑，`AudioSource` 缺失是从引擎二进制（`cc.705f1.js` 里 0 次）推断的 —— 证据强，但不是真机实测。
3. **Battle 完整形态没看到**：主将三层小人（`GeneralArt`）、士兵（`UnitSprites`）、HUD、战斗结算、多回合推进，全部因 §4 的 3804 中断而没机会渲染。**这只是"没验到"，不是"验过没问题"。**
4. **战争流程下游没走**：Battle 之后的结算 → 回 Campaign、城池易主、`戰績` 计数变化，都没跑到（进不去 Battle）。
5. **内政九宫命令只验了"面板能开、按钮在"**，没有逐个点 開發/部隊徵兵/搜索/移動武將/太守·軍師/情報/自治施行 验证业务效果（本轮只点了"物品"与"出征"两个入口）。物品页的"装备/卸下/全部解鎖"也没有实际点。
6. **分辨率适配只验了一种**：窗口 900×1500（viewport 769×1368，scale≈1.0255）。其他尺寸（小屏 375 宽、平板）没扫。
7. **帧耗时不是完整战场的数字**（见 §6 局限）；也没有采 drawcall / GPU 时间。
8. **`Z2` 的两条新口径断言没有写进 `wechat_check.mjs`** —— 我是按任务书口径人工判定的，脚本本身仍按 4 MB 单包报警（改了脚本就不算"原样复用"，所以没动）。

---

## 10. 复现命令（全部可重跑）

```powershell
# 0) 自建静态服务（root = work\cocos_verify2，端口 5188）
node -e "...http server on 127.0.0.1:5188..."      # 见 §10 备注

# 1) 打开副本页面
$env:PORT='9241'; $env:PROFILE='F:\sanguo\work\.edgeprof_cocos_v2'
$env:OUTDIR='F:\sanguo\work\cocos_verify2\r3_p3_newfull'
$env:PAGE_URL='http://127.0.0.1:5188/cocos-build/p3_newfull/index.html'
node F:\sanguo\work\cocos_verify\cdp.mjs launch

# 2) 跑五图链路（Campaign → 城 → 物品 → 敌城→出征 → Deploy → Battle → 60 帧）
node F:\sanguo\work\cocos_verify\cdp.mjs run F:\sanguo\work\cocos_verify2\steps_chain.mjs

# 3) A/B 单点（直接 loadScene('Battle')）
node F:\sanguo\work\cocos_verify\cdp.mjs run F:\sanguo\work\cocos_verify2\steps_battle_only.mjs

# 4) cc 模块导出探针
node F:\sanguo\work\cocos_verify\cdp.mjs run F:\sanguo\work\cocos_verify2\steps_cc_probe.mjs

# 5) 收尾
node F:\sanguo\work\cocos_verify\cdp.mjs close

# 6) 微信包静态检查（只读）
node F:\sanguo\work\cocos_verify\wechat_check.mjs
```

本轮新建文件（全部在 `F:\sanguo\work\cocos_verify2\`）：
`steps_chain.mjs`（五图链路 + instanceof 统计 + 60 帧）、`steps_battle_only.mjs`（A/B 单点）、`steps_battle_probe.mjs`（Deploy 按钮探针）、`steps_cc_probe.mjs`（cc 导出枚举）、`wechat_check_out.txt`（静态检查原始输出）、`cocos-build\p0_stale|p1_fixmask|p2_hybrid|p3_newfull`（产物副本）、`r0_webmobile|r0b_p0_stale_battle|r1_p1_fixmask|r2_p2_hybrid|r3_p3_newfull`（截图 + `console_*.json` + `session.json`）。

> 备注：静态服务用 `node -e` 起，核心 6 行：`http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]); if(u.endsWith('/'))u+='/index.html'; const f=path.resolve(path.join(root,u)); if(!f.startsWith(root)){res.writeHead(403).end();return;} fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404).end('404 '+u);return;} res.writeHead(200,{'content-type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream','cache-control':'no-store'}).end(d); }); }).listen(5188,'127.0.0.1')`。踩过的坑：`root` 若写成 `F:/...` 正斜杠、而 `f` 由 `path.join` 产出反斜杠，`startsWith` 会恒假 → 全部 403。
