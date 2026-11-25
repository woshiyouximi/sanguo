# 184 · Cocos 内核与 HUD 同步（v3）

> 本轮目标：把 web 侧这一轮的内核改动（battle/atkLock/时间上限/army_cmd/levels/unlock/smartscript…）
> 机械同步到 Cocos，并按 `project/180_战斗HUD对齐.md` 把战斗 HUD 改成原作版式（中文时间牌 / 双主将卡 / 招降标题）。
> 只改 Cocos 侧：`game/src/**` 全程只读。

---

## 一、结论

| 项 | 结果 |
| --- | --- |
| 内核同步 `node work\cocos_sync\sync_core3.mjs` | **exit 0**，21 个文件全部落盘；`--dry-run` 复跑「写入 0 个」（幂等） |
| Cocos 类型检查 `tsc -p tsconfig.check.json --noEmit` | **exit 0** |
| 内核断言 `node verify_core3.cjs`（编 Cocos 副本跑） | **断言 165/165 pass**，exit 0 |
| Web 类型检查 `cd game; tsc --noEmit` | **exit 0**（同步没有弄坏 web 源） |
| 出包 `build_wechat.ps1 -Mode preview`（未加 `-SkipWeb`） | **exit 0**，web-mobile 重新构建于 16:40:24 |
| HUD 三项（时间牌 / 双主将卡 / 招降标题） | 三项均已改完；前两项有实机截图，招降标题**无截图**（见 §八） |

---

## 二、内核同步清单

同步方向：`game/src/core/**` → `game/cocos/assets/scripts/core/**`（唯一方向，cocos 侧不反向影响 web）。
行号取**最终目标文件**，字节数取 manifest 的 `dst_after_bytes`。

| 文件 | web B / 行 | cocos B / 行 | 补丁 |
| --- | --- | --- | --- |
| army_cmd.ts | 35559 / 797 | 35550 / 797 | — |
| audio_bus.ts | 33780 / 773 | 33777 / 773 | — |
| battle.ts | 152000 / 3309 | 151958 / 3309 | — |
| **battle_ai.ts** | 7880 / 197 | 7877 / 197 | —（cocos 本轮新增） |
| capture.ts | 21683 / 556 | 21733 / 558 | K12;K13 |
| deploy_queue.ts | 13010 / 313 | 13010 / 313 | —（cocos 新增） |
| garrison.ts | 23189 / 562 | 23183 / 562 | — |
| levels.ts | 9581 / 188 | 9578 / 188 | —（cocos 新增） |
| march.ts | 6687 / 176 | 6712 / 177 | K14 |
| roster.ts | 30290 / 733 | 30711 / 740 | K8;K9;K10;K11 |
| skill_kind.ts | 9036 / 136 | 9036 / 136 | —（cocos 新增） |
| **smartscript/runtime.ts** | 103039 / 2164 | 104575 / 2177 | K1;K2;K3;K7a;K7b;K7c;K7d;K7e;K20 |
| smartscript/so.ts | 7472 / 251 | 7472 / 251 | — |
| smartscript/syscalls.ts | 35576 / 719 | 35573 / 719 | — |
| smartscript/vm.ts | 37330 / 947 | 37327 / 947 | — |
| strategy.ts | 48228 / 1154 | 48213 / 1154 | — |
| syso_host.ts | 78934 / 1829 | 78931 / 1829 | — |
| unlock.ts | 23119 / 512 | 23468 / 518 | K4;K15–K17(退役);K18;K19 |
| weather.ts | 4258 / 85 | 4258 / 85 | — |
| wises.ts | 34238 / 669 | 35422 / 686 | K5;K6 |
| wises_effects.ts | 17465 / 266 | 17459 / 266 | — |

合计 **21 个文件**（web 侧 21 个全在，cocos 多出 0 个）；`levels.ts.meta` 已存在，uuid 保持
`7f3a2c58-9d41-4b6e-8c0a-2e5b7d9f1a34`（不覆盖）。

> 读日志时注意：脚本的「本次写入 N 个」= `action !== same` 的文件数 **+ 报告文件是否变化**。
> 所以第二轮常看到「写入 1 个」而 manifest 里 21 行全是 `same` —— 那 1 个是 `sync3_report.txt`
> 自己（上一轮记的 `update` 这轮变成 `same`）。判幂等请用 `--dry-run`：**写入 0 个**才是真的没差异。

### 同步脚本这轮动的地方（`work/cocos_sync/sync_core3.mjs`）

1. **锚点缩进宽松匹配**：新增 `flexibleAnchor()` / `shiftIndent()`。`game/src/core/smartscript/runtime.ts`
   在 15:32 被一次错误的 PowerShell 重写按 GBK 读坏（源码字节不可逆丢失），随后从同一份产物
   `game/dist/core/smartscript/runtime.js` 逐行还原 —— 还原版是 **4 空格缩进 + 双引号 + 带 `.ts` 后缀**，
   旧锚点（2 空格）全线命中 0。现在「精确命中 1 次」优先，退到宽松匹配时**仍要求恰好 1 次**，否则 throw。
2. `stripImportExtensions()` 的单引号正则改为同时认双引号（否则还原版会把 `.ts` 后缀带进产物）。
3. **K7e 新增**：`const list = [...this.objects.values()].filter(...)`（还原后新增的一处 Map.values() 展开）。
4. **K15/K16/K17 退役**：unlock.ts 的三处 for-of 已被 web 真源自己改成「先落 `useForce`/`force`/`battleArray` 常量」的安全形式。
5. **K20 新增**：`globalThis.process?.getBuiltinModule` 改为显式形状断言 —— Cocos 的 `tsconfig.check.json` 是
   `types: []` + lib ES2022/DOM，不引 `@types/node`，strict 下报 `TS7017`（`typeof globalThis` 无索引签名）。

---

## 三、Babel 陷阱静态检查（脚本原文输出）

`work/cocos_sync/sync3_report.txt` §三，在**最终目标文本**上跑 TS AST：

```
for-of 头是 `||`/`??`/`&&`/三元式：0 处（K8–K14、K18–K19 落常量；K15–K17 已退役，web 真源自带安全形式）
Set/Map 迭代器 spread（.values()/.keys()/.entries()/new Set）：0 处（K4/K6/K7a–K7e）
import.meta：0 处（K1）
带 `.ts` 扩展名的相对导入：0 处（stripImportExtensions）
```

KEEP_PATCHES 逐条：K1–K14、K18–K20 全部「锚点命中=1 OK」，K15–K17「已退役 OK」且安全形式各命中 1 次。
（K1 是 `import.meta` —— Creator 产物是 `System.register` 函数体，`import.meta` 不是合法语法。）

---

## 四、三处校验（本轮实测）

```
cd F:\sanguo\game\cocos; npm.cmd exec -- tsc -p tsconfig.check.json --noEmit   → exit 0
cd F:\sanguo\work\cocos_sync; node verify_core3.cjs                            → 断言 165/165 pass，exit 0
cd F:\sanguo\game;        npm.cmd exec -- tsc --noEmit                          → exit 0（WEBTSC=0）
```

`verify_core3.cjs` 先 `tsc -p tsconfig.sim3.json` 把 **Cocos 副本**编到 `work/cocos_sync/_sim3` 再跑断言，
所以它验证的是同步后的 Cocos 内核，不是 web 源。

---

## 五、顶部时间牌（原作语义 → Cocos 实现）

### 语义（抄 `project/180_战斗HUD对齐.md` 的反汇编结论，不改口径）

- 原作 `[0x4AC35C]` 初值 `0x2E68 = 11880`，60fps 每帧 −1，到 0 置战斗结束位；
- 显示量纲 `0x443F2A() = (0x2E68 − [0x4AC35C]) / 0x78`，`0x78 = 120` 帧 = 2 秒
  ⇒ **显示 = ceil(cd/120)，起始 99，0.5 / 秒，整场 198 秒**；
- 我们 `TICK_HZ = 30` ⇒ 总 `BATTLE_TICK_LIMIT = 5940` tick，1 个数字 = 60 tick = 2 秒
  ⇒ **显示 = `ceil((5940 − tick) / 60)`**。

### 实现（`game/cocos/assets/scripts/BattleHud.ts`）

- `export function chineseNumber(n)` —— **逐字抄** web `battleView.ts:1698` 的 `CHINESE` 渲染器：
  夹 0..99；`tens === 0` 直接取个位；`head = tens === 1 ? '' : CN_DIGIT[tens]`；
  `ones === 0 ? head + '十' : head + '十' + CN_DIGIT[ones]`（10→十、60→六十、67→六十七、99→九十九）。
- `export function clockUnitsLeft(tick)` —— `99 − floor(max(0,tick)/60)`，夹 0..99（与 `ceil((5940−tick)/60)` 等价）。
- `paintClockPlaque()` —— 五层，颜色一个不改：深木外框 `#241610` + 金描边（`COLORS.gold` @0.85、2px）
  → 金板 `#b08a4e` → 米色内芯 `#f2e4bf`（inset 3） → 三条木纹 `#8a6f3e` @0.18 → 墨字 `#2a1c0c`（26px 加粗）。
- 牌位 `CLOCK_PLAQUE = { x: 298, y: 10, w: 154, h: 48 }`：web 是 214 宽，但竖版顶栏两条兵力条正好占
  16..296 / 454..734，214 会压条 —— 154 正好塞进中间那段空档。
- 数据只读内核 `world.tick`，视图不自己计时；结算后牌子继续显示「零」（牌在 10..58，结算遮罩从 100 起，不冲突）。

---

## 六、底部两块主将卡（原作 2×2 四裸数字）

`drawGeneralCard()`（web `battleView.ts:1818`）逐行移植，**镜像规则完全照抄**：

| 位置 | 左卡（我方） | 右卡（敌方，整块镜像） |
| --- | --- | --- |
| 卡框 | `CARD_A = {116,1012,250,100}` | `CARD_B = {366,1012,151,100}` |
| 名字 | 22px 左对齐 @116 | 18px 右对齐 @517（贴屏右侧） |
| 状态 | `在陣/被俘/撤退/陣亡`，右对齐 @340 | `敵將/陣亡`，左对齐 @370（朝画面中心） |
| 兵 / 技 | `兵 99/100` @116 · `技 53/53` @240 | `技 5/52` @370 · `兵 100/100` @517（镜像） |
| 四个裸数字 | 上排 `疲 0` @116 / `士 60` @240；下排 `智 75` @116 / `武 97` @240 | 上排 `士 60` @370 / `疲 0` @517；下排 `武 70` @370 / `智 88` @517 |
| 行動条 | `CARD_GAUGE = {116,1094,238,3}` 金条 + 右端一个 12px「行」 | 不画（web 同：只画我方） |

- `兵/技 当前/上限` 保留（原作卡上的 `金 46/96`、`樓 10/54` 即此二条）。
- 原来的 `行 40/40` 文本**压成卡内 3px 细条**：进度只读内核 `actionGaugeOf(generalUnitOf(world,'A'))`。
- 两卡之间补一条 1px 竖发丝线（x=366，1012..1104）：原作中栏是「主將 對 主將」立绘区，
  竖版压窄后不给线，两卡的内侧列会连成一片（`士 60 | 士 60` 读起来像四个字段）。
- 控制台里原来那三条资源条（HP/技/氣）拆掉，**體/氣 按 web 口径回到顶栏**：
  `BattleRoot.redraw()` 用 `HUD_QI_A/HUD_QI_B` 补两条 3px 氣条（`qi / QI_MAX`，`QI_MAX = 120000`）。
- **去重**：`BattleCmdUi.buildCmdUi()` 仍会产出 `gen.stats`（`武 x · 智 y · 行 a/b`）/`gen.hp`/`gen.mp` 三条文本，
  且 `cmdRoot` 建在 `hud` 之后（压在 HUD 上）。`BattleRoot.syncCmdUi()` 现在按 id 跳过这三条
  （`CARD_TAKEOVER_IDS`），否则 12px 旧行会正好压在新卡的四裸数字上。实机 dump 已确认这 3 个 Label 不再存在。

---

## 七、招降标题

`game/cocos/assets/scripts/SurrenderPanel.ts` 内新增本地常量 `PANEL_TITLE_TEXT = '武 將 招 降'`，
替换原来从 `./SurrenderModel` 引入的 `PANEL_TITLE = '抓 到 敵 將'`（两处使用：构造 `SurTitle`、`labelTitle!.string`）。

- web 侧已经是新串：`game/web/campaign.html:453` `<div class="ttl">武 將 招 降</div>`，Cocos 这边此前一直没跟上；
- 本轮**没有**改 `SurrenderModel.ts`（它不在允许清单里，且 `PANEL_TITLE` 是该模块对外导出的共用常量），
  所以在视图层本地覆盖。**遗留**：`SurrenderModel.PANEL_TITLE` 仍是旧串，下一轮允许改 model 时应把那行改成
  `武 將 招 降` 并把这里的本地常量删掉，两处归一。
- 也没有动 `game/web/**`。

---

## 八、实机截图

窗口 876×1368（设计 750×1334 等比），Edge 有头 + CDP，截屏前已 `Page.bringToFront` 并确认
`getTotalFrames()` 在涨（`206 → 279`，project/169 的坑）。

| 文件 | 内容 |
| --- | --- |
| `work/cocos_hud/01_battle.png` | 整帧战斗（顶栏金牌 + 底部双卡 + 六按钮） |
| `work/cocos_hud/02_clock.png` | 时间牌特写（「八十六」） |
| `work/cocos_hud/03_cards.png` | 两块主将卡特写 |
| `work/cocos_hud/04_clock_t0.png` | 进战斗 3 秒的时间牌（「九十八」） |

### 原作帧 vs Cocos 帧

| 项 | 原作 `work/video_ui_b/B_battle_0842.png` | Cocos（本轮） |
| --- | --- | --- |
| 时间牌 | 金框中文字牌，底部 HUD 上沿居中，写「六十㐅」 | 金框中文字牌，顶栏居中（竖版 HUD 在上），`九十八 → 八十六` |
| 牌面 | 深木外框 + 金边 + 米色芯 + 木纹 | 同四层 + 墨字 26px |
| 主将卡 | 左右各一块，2×2 裸数字：左「疲 0 / 士 84」「智 88 / 武 100」，右镜像 | 同构：左「疲 0 / 士 60」「智 75 / 武 97」，右镜像「士 60 / 疲 0」「武 70 / 智 88」 |
| 兵 / 技 | `金 46/96`、`樓 10/54` | `兵 99/100`、`技 53/53`（保留当前/上限） |
| 行 | 原作无（我们原有 `行 40/40` 文本） | 压成卡内 3px 金条 + 12px「行」 |

**牌子真的在掉字**：两次快照间隔 24 秒，`九十八`（tick≈120）→ `八十六`（tick≈840），
差 12 个单位 = 24 秒，与「0.5 单位/秒」吻合。

---

## 九、没做到 / 遗留

1. **招降面板没有截图**：进招降要打完一场并触发战后处置，本轮只做了代码改动 + `tsc` 通过，
   未实机进入该面板。若要视觉验收，需走「打完一仗 → 战后面板」的完整链路。
2. **主将卡没有立绘**：原作两张卡各带一张主将头像（赵云/黄忠）。竖版的控制台左侧只有一个「將」占位框
   （`PortraitGlyph`），右卡无立绘位。本轮只对齐了数字与字段，没有接 `face/*` 立绘。
3. **敌将 `tire` 在 web dev 链路被硬置 0**（`game/web/main.js:682`），所以 web 侧疲劳永远显示 0；
   Cocos 读的是 core 真值（`gen.tire ?? 0`），本局张角 `疲 0` 恰好也是 0，但这不代表链路已通。
4. **并发改动**：本轮同步期间 web 侧仍有 agent 在改 `smartscript/runtime.ts`（16:37:16 最后一次落盘，
   101350 → 103039 B）。最终状态以 16:41 的同步 + `--dry-run` 0 写入为准；最终出包的 web-mobile
   构建于 16:40:24，包含该版本 core。
5. 顶部 `我軍 99/100` 与卡内四列数字在 876px 宽的窗口里偏挤（设计宽度 750 下的正常密度），
   未做字号/间距的二次微调。
