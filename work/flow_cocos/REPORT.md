# Cocos 战斗开局几何探针报告（work/flow_cocos）

日期：2026-11-26 04:2x ｜ 只读探针，未改 `game/**`，未构建，未 git。
页面：`http://127.0.0.1:5299/cocos-build/web-mobile/index.html`（构建产物 mtime 2026-11-26 03:56，camera/project 与源码一致）
浏览器：Edge 158 / PORT 9345 / PROFILE `work\.edgeprof_cocosflow` / 画布 876×1368、design 750×1334、`cc.view` scale 1.0255、dpr 1

## 一句话结论

**Cocos 开局两主将根本不近：相距 45 行（真实世界 3214 px），镜头 camX=48.4，一屏只有 12.6 行，敌将离镜头 35.4 行、我方主将也离镜头 9.6 行——几何上两个都在屏外、敌兵 101 人一个都不画。**
用户「能看到彼此武将」是真的，但不是位置问题：`GeneralArt.clampShift()` 把两个主将**强行贴到战场带上/下沿**（敌将脚底 y=274、我将在 y=990），于是两个离屏 35 行/9.6 行的武将永远同框，读起来像「对面站着」。再叠上「双方主将固定同一车道 gy=6」（屏幕同一列 sx=348.2），视觉上就成了隔着空场面对面对峙。

## 数值表（web 实测 vs Cocos 实测）

| 项 | web（父 agent 实测） | Cocos（本次实测） |
|---|---|---|
| 场景 / 入口 | `web/index.html` | `Battle` 场景（`cc.director.loadScene('Battle')`，autoStart） |
| `world.tick`（暂停快照） | 0 | 23（1 s = 109，3 s = 254） |
| `camX` | **48.4** | **48.4**（= aMin 51 − 2.6，`battle.ts:3133`） |
| 我方主将（A） | x=**58**, y=6 | x=**58**, y=6 |
| 敌方主将（B） | x=**13**, y=6 | x=**13**, y=6 |
| 主将行距 | **45 行** | **45 行** |
| 双方单位 x 范围 | （未测） | A 51..61（101 人）；B 10..24（101 人） |
| 一屏行数 | 13.327（透视：远 7.434 / 近 5.894） | **12.6**（常数投影，`battle.ts:3107`） |
| 镜头可见行范围 | ≈[41.0, 54.3] | **[42.1, 54.7]**（camX±6.3） |
| 屏内敌兵数 | 0 | **0 / 101**（原始 sy < −60，全被 `battle.ts:1294` 剔除） |
| 屏内我兵数 | 部分 | **50 / 101** |
| 敌将原始屏幕 y | 屏外（离镜头 35 行） | **−1970.6**（画布 1334，屏外 2 屏多） |
| 我将原始屏幕 y | 屏外 | **1243.7**（战场带下沿 1000 之外，仍被剔除） |
| 敌将**实际**画在哪 | 不画（被剔除） | **贴边：脚底 y=274**（战场带上沿） |
| 我将**实际**画在哪 | 不画（被剔除） | **贴边：脚底 y=990**（战场带下沿） |
| 两将屏幕列 sx | — | **都是 348.214**（车道 6 中心，同一列） |
| 右侧小地图 | 有（`game/src/view/battleView.ts:1921-1922` 画单位点） | **无**（`view/layout.ts:104` 的 `MINIMAP` 常量全仓没人引用） |
| 开局「喊话 + 镜头切说话方」 | 无 | **无**（见下「原作行为」） |

投影公式（Cocos，常数投影）：`sx = y*53.5714 + 26.786`，`sy = 550 + (x − camX)*71.4286`；`sy ∈ [100,1000]` 为战场带内。
两将世界距离 45 行 ≈ **3214 px**；贴边后屏幕上两将脚底只差 **990 − 274 = 716 px（≈10 行）** —— 这就是「很远」和「看得见」同时成立的来源。

## 截图（3 张 + 1 张对照）

| 文件 | 时刻 | 说明 |
|---|---|---|
| `battle_0_paused.png` | 进场景后 `cc.director.pause()`（tick 23） | 敌将 張角（红马）贴在战场带上沿、墙前；關羽（蓝马）贴在我方阵尾下沿；中间 700+ px 空场 |
| `battle_1s.png` | resume 后 1 s（tick 109） | 同上，两队都没开始走 |
| `battle_3s.png` | resume 后 3 s（tick 254） | 敌将开始向我方挪（x 13→14.19），镜头仍 48.4 |
| `battle_pinned_generals.png` | 贴边探针时截 | 同上，用于核对 `lastFoot` |

截图里**没有**右侧小地图；Cocos 战斗 HUD 右列是「保護主將 / 部隊指令 / 武將技 / 武將出擊 / 主將後退 / 全軍撤退」。

## 判断（回答任务的 ①②③）

**① 开局屏幕里有没有敌方主将？**
几何上：**没有**。camX=48.4，可见 x∈[42.1, 54.7]；敌将 x=13 在镜头后 35.4 行；连我方主将 x=58 都在镜头前 9.6 行（超出下沿 3.7 行）。
视觉上：**有**。`GeneralArt` 的贴边把敌将脚底钉在 y=274（战场带上沿，墙根前），把我将钉在 y=990（战场带下沿）。所以「能看到彼此武将」是贴边的结果，不是真在同屏。

**② 两个主将的屏幕 y（车道）是否相近？**
车道完全相同：都是 `gy = 6`（`core/battle.ts:1036` 写死 `const gy = 6;`），屏幕列都是 `sx = 348.214`，正对镜头中轴。视觉上就是一列面对面。

**③ 谁把它们摆这么近？**
没有人把它们摆近——**它们本来就相距 45 行**。让它们同时出现在一屏里的是渲染层的贴边钳制：

- `game/cocos/assets/scripts/GeneralArt.ts:232-240`：注释自己写着「顯示層貼邊：主將站在己方陣列最後 2 格，而鏡頭一屏只覆蓋 12.6 格縱深，開局兩軍隔 30+ 格時主將被投到畫布外（實測 A py=1542 / B py=-1816，畫布高 1334），之前就是這樣『節點齊活、畫面上一個人都沒有』」；随后 `const shift = this.clampShift(...)`。
- `GeneralArt.ts:249-275` `clampShift()`：把 body/horse/weapon 三层并集 bbox 整体平移进 `[FIELD_TOP+4, FIELD_BOTTOM−4]` / `[4, DESIGN_W−4]`，**只平移不缩放**。
- 实测偏移：我将 `dy = −253.714`（原始 1243.7 → 990）、敌将 `dy = +2244.571`（原始 −1970.6 → 274）。
- 主将落位本身：`core/battle.ts:1020-1046`，`slot = data.formations.slots[rt.formation]`、`shift = floor((200 − soldiers)/25)`、`gx = A ? GRID_W − (anchorX + shift) : anchorX + shift`、`gy = 6`；默认 launch（`BattleRoot.ts:361-386`）A = 方形（`data/formations.json` slots[0] anchorX=9，soldiers=100 ⇒ shift=4）⇒ 71−(9+4)=**58**；B = 雁形（slots[3] anchorX=9）⇒ 9+4=**13**。**与 web 完全同源，数值逐位一致。**
- 镜头侧还有一个助推：`core/battle.ts:3119-3139` `camera()`，两军相距 `> 2*half`（12.6 行）时取 `cam = aMin − 2.6`（把我方前锋放在屏高 ~65%），于是**我方主将自己也被推出画外**，逼得贴边逻辑把两边主将都钉在画框上下沿。

## 与 web 的差异（同一组数字）

- **布局/镜头完全一致**：camX 48.4、A(58,6)、B(13,6)、45 行间距，两套前端同一份 `core`（部署 `battle.ts:1020-1046` + `camera()` `battle.ts:3119-3139`）。
- **差异全在渲染层**：
  - web 用透视投影（`game/src/view/projection.ts`，13.327 行/屏、两端不等），Cocos 用常数投影（`battle.ts:3107`，12.6 行/屏、对称）。所以可见行范围略有出入（web ≈[41.0,54.3] vs Cocos [42.1,54.7]），但都不含 58 和 13。
  - web **没有**贴边：主将照 `project()` 落位，超出 `FIELD_TOP−80 / FIELD_BOTTOM+80` 就被剔除 ⇒ 开局两个主将一个都不画（用户此前在 web 看到的就是「屏上一个武将都没有」）。Cocos 加了 `clampShift` ⇒ 两个主将永远同框。**这就是「web 看不到、Cocos 看得到」的唯一原因。**
  - web 有右侧小地图（`battleView.ts:1921-1922` 按 `u.x/u.y` 打点，两将相隔 45/70 的纵深一眼可见），Cocos 这版**没有小地图**（`MINIMAP` 常量未使用）。→ 用户说的「右侧缩略图能看出很远」在当前 Cocos 构建里对不上物，**可能他看的是 web 版，或 APK 是更老的构建（含小地图）**，需 lead 确认。

## 原作行为（用户提的「开局喊话 + 镜头切到说话方」）

Cocos 侧**没有实现运镜**：
- `core/syso_host.ts:442-444` 的 `StartBattle`、`:1296-1331` 的 `startBattle()`（两段叫阵 MSG300-409 + `MoveCamera(...,30/60)`）只有 `this.moveCamera(...)` → `events.push`，`why` 明说「缺 `msg` 与 `unitAt`，镜头与台词只进 events」。
- 视图侧无人消费相机事件：`BattleRoot.update()` 每帧 `const target = camera(this.world); this.camX += (target − this.camX) * min(1, dt*5)`（`BattleRoot.ts:280-283`）无条件覆盖 `camX`，`boot()` 也直接 `this.camX = camera(world)`（`BattleRoot.ts:410`）。
- 所以「开局双方喊话、镜头切说话方、喊完回己方主将」这条原作演出在 Cocos 里等于缺失，玩家一进战斗就直面「两将贴边 + 中间空场」。

## 现场数据（可复核）

- `battle_geom.json`：三次快照（paused / +1 s / +3 s）的 camX、tick、over、autoStart、launch(=null)、全单位 `{side,x,y,prevX,prevY,cd,kind,alive,isGeneral,sx,sy,onScreen}`、每侧 x min/max、generals、visible、generalGap、hudLabels。
- `general_pin.json`：`cc.view` 分辨率/缩放、战场层节点（BattleBg/Generals/UnitSprites 均 scale 1）、`GeneralArt.lastFoot` 与 `clampShift` 位移、每侧过剔除的小兵数。
- 关键实测：paused `tick=23 over=false camX=48.4`；A `x=58 y=6 rawSy=1243.714 pinnedY=990 dy=−253.714`；B `x=13 y=6 rawSy=−1970.571 pinnedY=274 dy=+2244.571`；`soldierCull A 50/101, B 0/101`；`camX` 在 3 s 内不变（两军尚在 27 行外，`aMin−bMax=27 > 12.6`）。

## 建议（给 lead，未改代码）

1. 贴边是「画面上一个人都没有」的补丁，副作用是让 45 行的敌将看起来就在墙根。可考虑：只贴**己方**主将、敌方主将只在真实位置画 + 小地图/箭头指示；或贴边时加「距离标尺/雾化」明确“他其实在 35 行外”。
2. 想要「开局喊话」就直接把 `StartBattle` 的 `MoveCamera` 事件接到 `BattleRoot.camX` 的短时覆盖上（现在被 `update` 的 `camera(world)` 每帧冲掉）。

## 复现

```powershell
cd F:\sanguo\game ; node web/serve.mjs 5299    # 已在跑
$env:PORT='9345'; $env:PROFILE='F:\sanguo\work\.edgeprof_cocosflow'
$env:PAGE_URL='http://127.0.0.1:5299/cocos-build/web-mobile/index.html'
$env:MATCH='5299'; $env:OUTDIR='F:\sanguo\work\flow_cocos'
node work\cocos_verify\cdpweb.mjs launch
node work\cocos_verify\cdpweb.mjs run work\flow_cocos\steps_battle_geom.mjs
node work\cocos_verify\cdpweb.mjs run work\flow_cocos\steps_general_pin.mjs
node work\cocos_verify\cdpweb.mjs close
node work\cocos_verify\reap.mjs --kill --match=edgeprof_cocosflow
```

## 清理

`cdpweb.mjs close` + `reap.mjs --kill --match=edgeprof_cocosflow` 已执行，`遗留验证浏览器进程: 0`。
