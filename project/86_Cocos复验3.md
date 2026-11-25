# 86 · Cocos 产物第三次运行时复验

- 复验对象：`game\cocos-build\web-mobile`（**实际被服务的产物是 05:54:49 那次重建**）+ `dist\wechat-preview`（05:53:17-19）
- 产物指纹（复验时实测）：`index.html` 2187B 05:54:49、`application.03a4b.js` 3308B 05:54:49、`cocos-js\cc.20d95.js` 1566598B 05:53:11（引擎包未随 05:54 重建变化）、`assets\*\config.*.json` 05:54:44-49；`game\cocos\settings\v2\packages\engine.json` 05:54:26（`"audio": {"_value": true}` 在 121-123 行，`"audio"` 在 includeModules 内 196 行）
- 说明：任务描述里的 05:53:16 是更早一版；我开始复验前该目录已被再重建为 05:54:49，因此**本轮验的是带 audio 模块的最新一版**。`dist\wechat-preview` 未被同批重建（仍是 05:53:19），但其 `cocos-js\cc.71e79.js` 已含 `AudioSource`×8
- 复验时间：2026-11-25 05:55:16 – 05:56:35（本地，UTC+8）
- 页面：`http://127.0.0.1:5173/cocos-build/web-mobile/index.html`（5173 已在跑，站点根 `game/`）
- 工具：复用 `F:\sanguo\work\cocos_verify\cdp.mjs`（有头 Edge 158.0.4370.33 + CDP `Page.captureScreenshot`，非 headless `--screenshot`）
- 剧本：`F:\sanguo\work\cocos_verify3\steps_chain3.mjs`（17621B）、`steps_probe3.mjs`、`steps_probe3b.mjs`
- 原始输出：`work\cocos_verify3\run3.out.txt`(27836B)、`probe3.out.txt`(12494B)、`console_full3.json`(784B)

## 0. 结论

**Battle 场景完整渲染成立。** 背景带、双方主将三层（马 / 身 / 武器）、士兵精灵、HUD（双方人数、计时、双血条、主将信息两行、底部提示）、结算全部出现，整轮 **console error 0 条、exception 0 条、warning 0 条、网络失败 0 条**，60 帧测得 avg 16.68ms。

前两轮的坑 2（audio 模块被裁 → `AudioSource` undefined → `addComponent(undefined)` 抛 3804 → `BattleRoot.buildUi()` 中断）**已消除**：本次 `System.import('cc')` 里 `AudioSource` / `AudioClip` 均为函数，`AudioHost` 建出 10 个 AudioSource 节点且 `stats.missing = 0`、`played = 82`。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 背景带（城墙/楼/山 + 地面纹理 + 暗角） | ✅ | `bgReady:true`，`BattleBg` 5 子节点，`05_battle.png` 目视 |
| 主将三层（马/身/武器） | ✅ | `GenAHorse/Body/Weapon`、`GenBHorse/Body/Weapon` 6 节点全 active + 有 spriteFrame；`08_general3_A/B.png` 目视马+骑将+长剑 |
| 士兵 | ✅ | 精灵池 104 个池节点 / 103 active（t+4.5s），128 active（t+7.5s），`world.units 162` |
| HUD | ✅ | 5 个 Label：`我軍  98/100`、`59/60  敵軍 守備隊`、`4.4s`、主将两行、底部状态行；`BattleHudBar` artHudState=`ready` |
| 结算 | ✅ | `world.over=true`、`settlement{winner:"A",kills:60,spellKills:0,dur:16}`、`戰鬥結束` + `0/60 敵軍 守備隊 被俘`、`06_settlement.png` |
| 技能格 | ⚠️ 不存在 | `BattleRoot.ts` / `game\web\**` 里没有技能格控件（"技能"只命中技能音与军师技）→ 本项无从验收 |
| 帧耗时 | ✅ | 59 间隔 avg 16.68 / median 17.1 / p95 18.3 ms，`cc.game.frameRate=60` |
| console | ✅ | errors 0 / warnings 0 / exceptions 0 / logEntries 0 / netFails 0 / HTTP≥400 0 |

## 1. 六屏截图（876×1368，`F:\sanguo\work\cocos_verify3\`）

| # | 文件 | 字节 | 内容 |
| --- | --- | --- | --- |
| 0 | `00_boot.png` | 35823 | Cocos 启动 logo（Boot 场景 16.99ms 内加载完即切 Campaign，未及单独出图） |
| 1 | `01_campaign.png` | 713486 | 大地图：我方城 3、金币 1200、物品/徵兵/開發/推進一月、城点与路径 |
| 2 | `02_city_panel.png` | 576886 | 襄平内政页：人口/金/兵/防務/士气/月令 + 八命令格 |
| 3 | `03_items_panel.png` | 266566 | 物品·裝備页：關羽、兵器/坐騎/兵書/寶物四栏、分类页签、加成表 |
| 4 | `04_deploy.png` | 598462 | 出征編成：目標易京、公孫瓚、長槍/錐形/100 兵、出征按钮 |
| 5 | `05_battle.png` | 1128069 | **Battle**：背景带 + 双方各百人队列 + 顶栏 + 双血条 + 主将信息 + 雪 |
| 6 | `06_settlement.png` | 1085883 | 结算：`戰鬥結束`、`0/60 敵軍 守備隊 被俘`、胜利行、两名骑马主将 |

补充放大（非必交，用于看清三层）：

| 文件 | 字节 | 尺寸 | 内容 |
| --- | --- | --- | --- |
| `07_general_A_zoom.png` | 192410 | 450×450 | 己方主将局部（马+身+武器） |
| `07_general_B_zoom.png` | 245172 | 450×450 | 敌方主将局部 |
| `08_general3_A.png` | 373185 | 660×660 | 公孫瓚 三层清晰：马 / 骑将身体 / 长剑 |
| `08_general3_B.png` | 463681 | 660×660 | 守備隊 三层清晰（红披风）+ 周围士兵 |

## 2. Battle 完整渲染证据

### 2.1 t+4.5s 场景探针（`run3.out.txt:12`）

```
{"tag":"t+4.5s","scene":"Battle","frames":1118,"frameRate":60,"scale":1.025487256371814,
 "rootFound":true,"bgReady":true,"generalHasArt":true,
 "unitSprites":{"total":104,"active":103},
 "counts":{"nodes":146,"sprites":114,"graphics":9,"labels":5,"audioSources":10},
 "audioNodes":["Voice0".."Voice7","Bgm","Ambience"],
 "hasAudioSourceCtor":true,"hasAudioClipCtor":true,
 "audioStats":{"requested":7,"played":4,"throttled":0,"missing":0,"bgm":"06","remote":0,"base":""},
 "hudBar":1,"weatherNode":1,"tintNode":1,
 "world":{"tick":133,"over":false,"weather":2,"terrain":0,
          "A":{"name":"公孫瓚","alive":98,"start":100,"hp":117},"B":{"name":"守備隊","alive":59,"start":60,"hp":103},
          "units":162,"alive":159,"generals":[{"side":"A","x":52,"y":7},{"side":"B","x":25,"y":7}]}}
```

- 五个 Graphics 层全在：`BattleBase` / `UnitsA` / `UnitsB` / `Generals` / `Fx`（`exists:true, active:true`）。
- `BattleBg` 子节点：`FloorClip, BandBg, BandMg, BandFg, Vignette`，`bgReady:true`，`terrain:0`，`weather:2`（雪）。
- HUD 五个 Label 文本（逐字取回）：
  - `我軍  98/100`
  - `59/60  敵軍 守備隊`
  - `4.4s`
  - `我 公孫瓚  Lv.20   武力 86   智力 70   HP 117/117   MP 72   · 出征   連勝 0（最高 0）\n敵 守備隊  Lv.5   武力 38   智力 26   HP 103/103`
  - `雪 · 固定 30Hz 邏輯 · 點擊畫面（結束後）重開`
- t+7.5s 复测：`tick 233`、`alive 130`、精灵池 `134/128`、`audioStats{requested:110,played:82,throttled:25,missing:0}` → 世界在推进、音效在播、无缺资源。

### 2.2 主将三层（`probe3.out.txt:1`，结算态）

```
GeneralArt (depth0, active, 750×1334)
├ GenAHorse  154×123 @(3,-215)    active spriteEnabled=true frame=(unnamed)
├ GenABody    73×98  @(4,-169)    active spriteEnabled=true frame=(unnamed)
├ GenAWeapon  39×64  @(24,-105)   active spriteEnabled=true frame=(unnamed)
├ GenBHorse  137×123 @(-11,65)    active spriteEnabled=true frame=(unnamed)
├ GenBBody    71×102 @(-3,111)    active spriteEnabled=true frame=(unnamed)
└ GenBWeapon  39×64  @(21,176)    active spriteEnabled=true frame=(unnamed)
```

6 个图层节点全部 `active=true`、`Sprite.spriteFrame != null`、`spriteEnabled=true`；层序 马→身→武器（武器压身、身压马），锚点在底部，与 `game\cocos\assets\scripts\GeneralArt.ts:133` 的 `prefix = side === 'A' ? 'GenA' : 'GenB'` 一致。`08_general3_A/B.png` 为定向裁剪放大（`Page.captureScreenshot` + clip + scale 3），可肉眼确认马、骑将身体、长剑三层各自成像。

> 说明：首轮探针按 `A_Horse/AHorse` 猜名，`artLayers.found` 全 false；那是**探针猜错名字**，不是缺图层。改用真实名 `GenAHorse` 后全部命中，并以截图互证。

### 2.3 结算（`probe3.out.txt:1`）

```
"settlement":{"winner":"A","kills":60,"spellKills":0,"dur":16}
labels: 我軍  73/100 / 0/60  敵軍 守備隊  被俘 / 戰鬥結束
        勝利 · 擊殺 60（法術 0） · 用時 16s · 連勝 1（最高 1） · 點擊返回大地圖
```

开战后 ~10s（`battle tick 486`）`world.over` 置真，HUD 计时位改显 `戰鬥結束`，敌方标签追加 `被俘`，底部出现完整结算行 —— 结算路径不是静态文字，是真实世界状态驱动。

## 3. 帧耗时（60 帧 rAF 间隔，丢首帧，实测 59 个间隔）

```
{"frames":59,"avgMs":16.68,"medianMs":17.1,"p95Ms":18.3,"minMs":14.6,"maxMs":18.4,"fps":59.9,"frameRate":60}
```

`cc.game.frameRate = 60`；`cc.director.getTotalFrames()` 在后续探针为 4560。Battle 稳态基本锁 60fps（p95 18.3ms 仍在一帧预算内）。仅单次采样、单一战场（terrain 0 / 雪 / 守備隊），未做长时抖动与不同地形/天气矩阵。

## 4. console 全文（`work\cocos_verify3\console_full3.json`，自 `Page.navigate` 起抓，含 `Runtime.consoleAPICalled` / `Runtime.exceptionThrown` / `Log.entryAdded` / `Network.loadingFailed` / HTTP≥400）

```json
{
 "navigatedAt": "2026-11-24T21:55:16.881Z",
 "page": "http://127.0.0.1:5173/cocos-build/web-mobile/index.html",
 "console": [
  {"type":"timeEnd","text":"LoadScene db://assets/scene/Boot.scene: 16.992919921875 ms"},
  {"type":"timeEnd","text":"LoadScene Campaign: 17.912109375 ms"},
  {"type":"timeEnd","text":"LoadScene Deploy: 31.97998046875 ms"},
  {"type":"timeEnd","text":"LoadScene Battle: 22.633056640625 ms"}
 ],
 "exceptions": [], "logEntries": [], "netFails": [], "httpBad": [],
 "counts": {"consoleCalls":4,"errors":0,"warnings":0,"exceptions":0,"logEntries":0,"netFails":[],"httpBad":[]}
}
```

**console error 条数：0**（例外 0、警告 0、网络失败 0、HTTP≥400 0）。四次 `timeEnd` 是引擎 `LoadScene` 的正常计时输出。另两次独立 `run`（探针）同样 4 条 timeEnd / 0 错误，落盘 `console_steps_probe3.json`、`console_steps_probe3b.json`。

## 5. `System.import('cc')` 导出

```
hasAudioSourceCtor: true
hasAudioClipCtor:   true
```

`cc.20d95.js`（1566598B）中 `AudioSource` 出现 8 次、`dist\wechat-preview\cocos-js\cc.71e79.js`（1412064B）同样 8 次 —— audio 模块确已编入。

## 6. `game.json` 的 subpackages 尾斜杠现状

| 产物 | game.json 字节 | subpackages | 尾斜杠 |
| --- | --- | --- | --- |
| `dist\wechat-preview\game.json` | 186 | **无该键** | 不适用（已无此项） |
| `dist\wechat-remote\game.json` | — | 无该键 | 不适用 |
| `dist\wechat-upload\game.json` | — | `[{"name":"res","root":"subpackages/res/"}]` | **仍在（未修）** |
| `game\cocos-build\wechatgame\game.json` | — | 无该键 | 不适用 |
| `game\cocos-build-local\wechatgame\game.json` | — | 无该键 | 不适用 |

结论：preview / remote 两个口味已没有 subpackages（问题在它们身上不再成立）；**`dist\wechat-upload` 仍带尾斜杠**，若 upload 口味要上微信需单独处理。`tools\` 下 grep 不到 subpackages，生成方不在 tools 里。

## 7. 附带发现与没验到的

**附带发现（不影响渲染，未深查）**

- 出征编成屏写 `目標易京 · 守軍 110 兵`，同一场 Battle 的 B 侧 `start = 60`（HUD `0/60 敵軍`）。数字不一致，未定位是显示口径还是实际投入兵力。
- 本项目的 Battle HUD 没有"技能格"这一控件（`BattleRoot.ts` grep 技能/skill 无命中；`game\web\**` 的"技能"只命中技能音与军师技）—— 该验收项在本工程不存在，无法给"有/无"之外的结论。

**没做到的**

- 未在微信小游戏真机 / 微信开发者工具里跑（只跑了 web-mobile 浏览器产物）；`dist\wechat-preview` 仅核了 `game.json` 与 `cc.js` 内容，未运行。
- 帧耗时只单次 60 帧采样、单一战场（terrain 0、雪、守備隊），无长时稳定性/多天气/多地形/低端机矩阵。
- 未覆盖其余战斗形态：攻城/守城城墙、法術击杀（本场 `spellKills:0`）、主将阵亡、"點擊返回大地圖"回跳大地图后的二次战斗。
- 未验竖屏/横屏切换与不同 devicePixelRatio（本次固定 `--force-device-scale-factor=1`、900×1500 窗口）。

## 8. 复现

```powershell
cd F:\sanguo
$env:PROFILE='F:\sanguo\work\.edgeprof_cocos3'; $env:OUTDIR='F:\sanguo\work\cocos_verify3'; $env:PORT='9223'
node work\cocos_verify\cdp.mjs launch
node work\cocos_verify\cdp.mjs run work\cocos_verify3\steps_chain3.mjs
node work\cocos_verify\cdp.mjs run work\cocos_verify3\steps_probe3.mjs
node work\cocos_verify\cdp.mjs run work\cocos_verify3\steps_probe3b.mjs
node work\cocos_verify\cdp.mjs close
```

## 9. 环境清理

- `cdp.mjs close` 返回 `closed`；随后按 `--user-data-dir="F:\sanguo\work\.edgeprof_cocos3"` 精确匹配杀残留：清理后 **无 msedge 带该 profile、无 node 带 cocos_verify、9223 端口 Test-NetConnection 为 False**。
- 未改动 `game\cocos\**`、`game\src\**`、`game\web\**`、`tools\**`、`dist\**`、`project\37a|31|44`；本轮只写 `work\cocos_verify3\**` 与本文件。
- 需知会：复验期间发现 `game\cocos\settings\v2\packages\engine.json`(05:54:26)、`profiles\v2\editor\packages.json`(05:54:32)、`library\.assets`(05:54:33)、`temp\tsconfig.cocos.json`(05:54:34) 被外部进程写过，紧接着 `game\cocos-build\web-mobile` 于 05:54:49 全量重出（`index.html`/`application.*.js`/`assets\**\config.*.json` 同时刷新，`cocos-js\cc.20d95.js` 仍为 05:53:11 未变）。**这不是我的写操作**（我只读产物、只写 work\ 与 project\86），应是构建/编辑器在 05:53 之后又跑了一轮；我 05:55:16 的复验跑的正是这版 05:54:49 产物，所以结论对最新产物有效。
