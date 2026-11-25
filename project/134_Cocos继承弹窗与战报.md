# 134 · Cocos 继承弹窗与战报（君主陣亡 → 選繼承人 / 戰報分組與翻頁）

> **任务来源**：本轮派单（f3-cocos-monarch-ui）。三件事：
> ① 玩家君主阵亡 → 弹「选继承人」，玩家点选后落库；AI 势力仍自动继承（不许被弹窗拦住）。
> ② AI 逐条战报要能翻页/看更多 + 要有「本月」分组标题。
> ③ 写 `work\cocos_monarch_ui\succession_assert.mjs`（≥12 条）+ 本报告。
>
> **行为基准**：web `game\web\campaign.html` —— `kingFell()`（`:3247-3286`，走 `MM.kingDeath()` 直接落地，**没有**死亡弹窗）、
> `pushLog`/`renderLog`（`:2225`/`:2905`，`slice(-8).reverse()`，**没有**分组与翻页）、
> `openThroneSheet()`（`:1791`，手动让位，**不是**死亡触发）。
> 所以「死亡触发弹窗」「月份分组」「翻页」这三件都是 Cocos 侧 **`[新设计]`**，不是复刻 web。
>
> **状态：已补齐。**
> `tsc -p tsconfig.check.json --noEmit` **EXIT=0**；
> `work\cocos_monarch_ui\succession_assert.mjs` **79 条 / 0 失败 / EXIT=0**；
> 既有 5 个断言脚本 **全过**（条数见 §4.2）；
> 9344 会话里实测：灌 11 条跨月战报 → 标题 `戰 報 · 共 11 條 · 1/2 頁 ▾` → 真鼠标点 `▶` → 翻到 `2/2 頁`（截图见 §5）。

---

## 0. 先核实：任务单里「`openSuccession` 没人调用」是旧口径

开工先读源码：**v17-cocos-monarch（`work\cocos_monarch85\`）已经把这套接线做完了**。

- `CampaignRoot.ts:2912` 的 `checkMonarchDeath()` 已经会 `openSuccession(...)`；
- 纯逻辑区 `// #region 戰報 / 君主繼承 / 城點取色（純邏輯）`（`CampaignRoot.ts:427-1059`）里已有
  `successionOfficers/successionCandidates/successionStart/successionView/successionLand`；
- `MonarchPanel.ts:538` 的 `openSuccession(view, onPick)`、`:560` 的 `rebuildSuccession()`（候选 5/页 + 翻页行）、
  `:603` 的 `pickSuccession(name)`、`sheetKind === 'succession'` 分流都在。

所以本轮是 **「验证 + 补缺」**，不是从零接线。补掉的三处缺口：

| # | 缺口（改前） | 为什么要补 |
|---|---|---|
| G1 | 0 城时 `checkMonarchDeath()` 仍弹继承窗，紧接着 `start()` 里的 `EndingPanel.showIfEnded()` 又把满屏结局盖上来 | 两个窗抢屏，继承窗点不到 → 现在 0 城直接判灭亡，让结局面板独占（`CampaignRoot.ts:3174-3184`） |
| G2 | 战报固定 `battleLogTail(buf, 8)`，永远只有最近 8 条；`loadBattleLog` 落盘时 `slice(-8)` 截断 | 「AI 逐条战报看更多」做不到，早期月份直接被丢 |
| G3 | 战报没有任何月份分组，「本月」与上月混排，只靠每行左侧时间列 | 派单明确要求「本月」分组标题 |

**没有改动的文件**：`MonarchPanel.ts`（0 行）、`AiRunner.ts`（0 行）、web 侧（0 行）、`work\cocos_monarch85\`（别人的目录，不动）。

---

## 1. 改动一览

| 文件 | 性质 | 归属 | 说明 |
|---|---|---|---|
| `game\cocos\assets\scripts\CampaignRoot.ts` | 改（3020 → 3246 行，+226 行） | 我 | 继承分派纯函数 + 战报分组/翻页（纯逻辑 + UI + 触摸） |
| `work\cocos_monarch_ui\succession_assert.mjs` | **新建** | 我 | 79 条断言（纯 node，编真源码 region + 真 `MonarchModel.ts`） |
| `work\cocos_monarch_ui\steps_*.mjs` | **新建**（7 个） | 我 | CDP 只读探针 / 注入 helpers / 战报 UI 验证 / 截图 |
| `work\cocos_monarch_ui\*.png`、`*.json` | **新建** | 我 | 运行时段证据：3 张战报截图 + `assert_layout_rerun.json` + console dump |
| `project\134_Cocos继承弹窗与战报.md` | **新建** | 我 | 本报告 |

`CampaignRoot.ts` 新增代码分布（行号是当前文件，LF，3246 行）：

- 纯逻辑：`:640-727`（缓存/行/页/月份标题/分页/命中区）、`:738-777`（`MonarchDeathPlan` + `planMonarchDeath`）
- 类字段/角色：`:1161-1165`（`logPage/logPages/logPrev/logNext`）、`:1423-1424`（两个翻页钮的 `'num'` 文字角色）
- 触摸：`:2523-2525`
- 战报构建/刷新/绘制：`:2892-2897`、`:2905-2906`、`:2919-2922`、`:2929-2933`、`:2945-2952`、`:2977-3019`、`:3033-3042`、`:3050-3064`
- 继承：`:3167-3207`（`checkMonarchDeath`）、`:3210-3236`（`commitSuccession`）

---

## 2. 接线：玩家君主阵亡 → 选继承人

### 2.1 分派是纯函数（可断言）

`CampaignRoot.ts:764`：

```ts
export function planMonarchDeath(
  dead: string, remaining: number, pending: boolean, extinct: boolean,
): MonarchDeathPlan
```

判定顺序（`:764-777`）：`pending` → `none/pending`；`extinct` → `none/extinct`；
`remaining === 0` → **`ending`/`no-city`**；无 `dead` → `none/alive`；否则 **`prompt`/`king-dead`**。

`kind: 'none'|'ending'|'prompt'`，`reason: 'pending'|'extinct'|'alive'|'no-city'|'king-dead'`。
抽成纯函数的理由：`checkMonarchDeath` 里全是副作用（开窗、写 localStorage、清座位），不抽出来只能靠运行时截图去证
「0 城不该弹窗」；抽出来之后 8 条断言就把四条分支钉死了（§4.1 ②）。

### 2.2 `checkMonarchDeath()`（`CampaignRoot.ts:3167-3207`）

```
3168  if (this.successionState || this.monarchExtinct) return;    // v17 就有的守卫（probe 钉死）
3171  const dead = this.detectMonarchDeath();                      // 座位丢失 → 死者名
3173  const plan = planMonarchDeath(dead, save.owned.length, ...);  // 纯函数分派
3174  if (plan.kind === 'ending') { ... 置滅亡旗標 + 清座位 + hintText，return }    // G1
3185  if (plan.kind !== 'prompt') return;
3186-3201  successionOfficers(...) → successionStart({ ... dead: plan.dead, remaining: plan.remaining })
3202-3204  this.successionState = state; view = successionView(state); hintText
3205  this.ensureMonarchPanel().openSuccession(view, (name: string) => this.commitSuccession(name));
3206  this.refresh();
```

G1 的做法（`:3174-3184`）：把 `monarchExtinct = true` + `storeMonarchExtinct(true)` + 清座位 + `hintText` 写完再 `return`，
**不再开继承窗**。证据链：`EndingModel.isMonarchLost()`（`EndingModel.ts:198`）判 `monarchExtinct || monarchDead || kingDead`；
`start()` 的顺序是 `checkMonarchDeath()`（`:1294`）→ `SurrenderPanel.showIfNeeded()`（`:1297`）→ `EndingPanel.showIfEnded(...)`（`:1304`）。
改前 0 城：继承窗先开 → 结局面板后开且盖在上面 → 继承窗永远点不到。
`[推测]` 这是真实玩家会撞到的双窗（未在旧构建上截图复现，是从调用顺序推的）。

### 2.3 玩家点选 → 落库（`commitSuccession`，`CampaignRoot.ts:3210-3236`）

```
3211-3212  state = this.successionState; if (!state) return;
3213-3214  view = this.syncMonarchState(); out = successionLand(view, state, name);
3215-3220  successionState = null; writeMonarchExtras(view); monarchExtinct = out.extinct;
           storeMonarchExtinct(...); 清座位
3221-3224  战报：battleLogPush(this.battleLog, battleLogLine(out.month, out.line, out.kind), BATTLE_LOG_KEEP);
           logPage = 0; storeBattleLog();
3225-3228  hintText（存續 / 滅亡两种文案）；refresh();
3231-3235  if (out.extinct) EndingPanel.showIfEnded(this.node, { ...view, monarchExtinct: true }, ...)
```

`successionLand()`（`:1013`）内部：`prompt` → `M.inheritForce(save, force, heir, { month })`；
`extinct` → `M.extinguish(save, force, { month, dead, officers })`。

**落库口径（容易误会）**：`MonarchModel.inheritForce`（`MonarchModel.ts:248`）只写
`forces[id].king = heir`、`alive = true`、删 `endedAt`；玩家侧只补 `s.monarch = heir`、`s.monarchSince = month`。
它 **不动 `save.king`、不动 `save.force`、不动 `save.owned`** —— 所以断言钉的是
「`M.monarchOf(save) === '張飛'`（`monarchOf` = `str(save.monarch) || str(save.king)`，`MonarchModel.ts:133`）
＋ `save.force === '劉備'`（势力名号不变）＋ `forces['劉備'].king === '張飛'`」，而不是去改 `save.king`（§4.1 ⑤）。

### 2.4 AI 势力不走弹窗（五条证据）

1. `AiRunner.ts` 全文 grep `openSuccession|MonarchPanel|successionStart|successionLand|planMonarchDeath` → **0 命中**；
   AI 侧只有战报文案（`AiRunner.ts:558`：`${bt.defender} 的君主陣亡於 ${to}${heir ? '，${heir} 继位' : ...}`）。
2. `CampaignRoot.ts` 全档 `openSuccession(` 只出现 **1 次**（`:3205`，在 `checkMonarchDeath` 内），不在 AI 路径上。
3. `this.checkMonarchDeath();` 只有 **2 个**调用点：`start()`（`:1294`）与 `advance()`（`:1915`），都在大地图自己身上。
4. `M.kingDeath(aiSave, '曹操', {...})` 实测返回 `{ dead: true, extinct: false, heir: '曹丕', reason: 'inherit' }` 并直接写
   `aiSave.forces['曹操'].king = '曹丕'`，玩家 `monarch/force/king` 一个没动（断言 ③f）。
5. 0 城/已灭/已开窗三种状态都会被 `planMonarchDeath` 挡成 `none`，AI 势力不会误触。

---

## 3. 战报：月份分组 + 翻页

### 3.1 新增纯函数

| 符号 | 位置 | 说明 |
|---|---|---|
| `BATTLE_LOG_KEEP = 40` | `CampaignRoot.ts:640` | **`[新设计]`** 环形缓存上限。`BATTLE_LOG_MAX`（8）**保持原值不动**，只把「落盘/缓存」从 8 改成 40（=5 页） |
| `interface BattleLogRow` | `:643` | `{ t, s, k, month }`：`month = true` 表示这是分组标题行 |
| `interface BattleLogPage` | `:653` | `{ rows, page, pages, from }` |
| `battleLogMonthTitle(stamp, newest)` | `:664` | `▼ 本月 · 3年4月` / `▼ 3年4月`；`stamp === ''` → `未記年月` |
| `battleLogPage(buf, page, per = 8, currentMonth = 0)` | `:681` | 分组 + 分页：**连续同 `t` 归一组**，组头占一列，按 `per` 断页，`page` 夹到 `[0, pages-1]`，最新组在前；只有 `currentMonth` 匹配的组才标「本月」 |
| `LOG_PAGE_PREV` / `LOG_PAGE_NEXT` | `:724` / `:725` | `{ x: 622 / 682, y: 846, w: 44, h: 22 }`（标题列右侧） |
| `logPageHit(x, y, collapsed)` | `:728` | `-1` / `0` / `1`；折叠时恒 `0` |
| `planMonarchDeath` | `:764` | 见 §2.1 |

**为什么缓存 40 而不是「不限」**：web 是 `save.log.length > 8 → slice(-8)`（`campaign.html:2225`），**只留 8 条**，早月直接丢；
Cocos 要「看更多」就必须留得更久。取 40 = 5 页的整数倍，又不会让 localStorage 无限长（每条约 40-60 字，40 条 ≈ 2-3 KB）。
`[新设计]`，不是 web 口径。

**为什么每页仍是 8 行**：`BATTLE_LOG_MAX = 8` 被 v17 的 `work\cocos_monarch85\probe.mjs` 逐字钉死
（`ok(R.BATTLE_LOG_MAX === 8)`、`push 12 条剩 8 条`、`buf[0].s === '第 5 條'`、`logHit` 的 `L.y+28`/`L.y+29` 边界），
它不在我的目录里、我也没权限改。所以「看更多」用**翻页**实现；面板尺寸 `LOG_VIEW = { x: 16, y: 842, w: 718, h: 298 }`
（`CampaignRoot.ts:471`）与 8 行版式一个像素没动。

### 3.2 UI 接线

| 位置 | 改动 |
|---|---|
| `CampaignRoot.ts:1161-1165` | 字段 `logPage / logPages / logPrev / logNext` |
| `:1423-1424` | `applyTextRole(this.logPrev, 'num', 13)` / `logNext` 同（字号角色，和皮肤系统一致；22px 高的钮用 13 号，20 会撑爆） |
| `:2523-2525` | `onTouch` 的 `logHitArea === 'header'` 分支里**先**问 `logPageHit(x, y, this.logCollapsed)`，命中即 `turnBattleLogPage(turn)` 并 return；否则才 `toggleBattleLog()` |
| `:2892-2897` | `buildLogLabels()` 末尾建 `◀`/`▶` 两个 Label（`makeLabel` 中心原点，w=44，13px，`COLORS.textFaint`，SHRINK，初始 `active = false`） |
| `:2905-2906` | `promoteLogLabels()` 把两个钮也提到最上（否则被后建的 Label 压住） |
| `:2919-2922` / `:2929-2933` | `pushBattleLog` / `recordAiBattleLog` 改用 `BATTLE_LOG_KEEP`，并 `logPage = 0`（新战报总跳回第一页） |
| `:2945-2952` | `loadBattleLog` 落盘改 `out.slice(Math.max(0, out.length - BATTLE_LOG_KEEP))` |
| `:2977-3019` | `refreshBattleLog()` 重写：`battleLogPage(...)` → 写回 `logPage/logPages`；分组行**隐藏时间列**、正文用 `row.s`、颜色 `logColor(row.k) \|\| COLORS.text`；标题三分支（`尚無戰事 ▾` / 折叠 `共 N 條 ▸` / `共 N 條 · p/pages 頁 ▾`）；翻页钮 `active = !collapsed && pages > 1`，页首页尾熄灯（`goldLight` → `textFaint`） |
| `:3033-3042` | `drawBattleLog()` 用同一份 `battleLogPage`；分组行画淡金底 `fillRect(x+8, top+3, w-16, ROW_H-6, COLORS.gold, 16)` + 下缘金线 `alpha 110` |
| `:3050` / `:3057-3064` | `toggleBattleLog()`（原样）/ `turnBattleLogPage(delta)`：越界不动（不绕回），换页要 `drawFrame()` 重画分组底色 |

**UI 上的取舍**：分组标题**只在每组的第一次出现处**占一行，同月后续行左侧时间列照旧显示年月
（`refreshBattleLog` 里 `time.node.active = Boolean(row) && !isMonth`）。这样翻到第 2 页、组头已经在上一页时，
玩家仍然知道每行是哪个月 —— `[新设计]`（web 每行本来就有时间列，这里保留）。

---

## 4. 断言

### 4.1 我写的：`work\cocos_monarch_ui\succession_assert.mjs`（79 条）

跑法：`cd F:\sanguo\work\cocos_monarch_ui; node succession_assert.mjs` →
`ALL PASS · 断言 79 条（PASS 79 / FAIL 0）`，EXIT=0。
实现：读 `CampaignRoot.ts`，按 `// #region 戰報 / 君主繼承 / 城點取色（純邏輯）` 逐字切到首个 `// #endregion`
（20888 字），前缀补 `import * as M from './MonarchModel';`，用 `F:\sanguo\game\node_modules\typescript` 的
`ts.transpileModule` 把 region 与 `MonarchModel.ts` 编到 `work\cocos_monarch_ui\.build\`（每次跑前清空），
再 `createRequire` 加载 —— **全程不 import `cc`、不起浏览器**。

| 组 | 条数 | 覆盖 |
|---|---|---|
| ① 候选排序 | 7 | `successionCandidates` 顺序与分数（`blood*10000 + loyal*100 + str + int`）、同族/旧主加权、候选带城名、`successionOfficers` 只摊平我方城、`force=''` 不过滤 |
| ② 死亡分派 | 8 | `planMonarchDeath` 四条分支 + `remaining` 归零（`0` 与 `-5`）+ `reason` 取值 |
| ③ AI 不触发 | 7 | `AiRunner.ts` 无相关符号 / `openSuccession` 全档 1 次 / `checkMonarchDeath` 调用点 2 个 / `M.kingDeath` 对 AI 势力自动继承（`heir='曹丕'`）且玩家三字段不动 |
| ④ 无候选 → 灭亡 | 8 | `phase='extinct'`、`view.title`「君主陣亡 · 勢力滅亡」、`還有 N 城無主`/`名下已無城池`、`successionLand` → `extinct`、`forces[..].alive=false`、`cities=[]`、`endedAt`、`monarch/force/king` 清空、战报 `kind='lost'` |
| ⑤ 落库 | 12 | `successionLand(save, state, '張飛')` → `heir`、`M.monarchOf==='張飛'`、`save.force==='劉備'`（名號不變）、`forces['劉備'].king`、`alive` 保持、`owned`/`cities.owner` 未动、敌军未动、战报文案「…：張飛 繼位（勢力存續 · 名號不變）」、空 `pick` 默认第 0 位 |
| ⑥ 分组/翻页 | 20 | 5 条三月 + 6 条四月 → 13 列 2 页；page0 首列 `▼ 本月 · 1年4月`、组头 `t===''`、组内最新在上；`currentMonth=5` 时去掉「本月」；page1 `from===8`；页号夹取 `-5→0`、`99→1`；空战报 `pages=1`/`rows=0`；10 条同月 → 1 组头 + 7 行 / 3 行无组头；年月交錯 A/B/C → 3 组；45 条只留 40（首 第 6、末 第 45）；`BATTLE_LOG_MAX` 仍 8；`logPageHit` 三点（`(644,857)=-1`、`(704,857)=1`、面板外/折叠 `=0`）；两个钮互不重叠且在标题列内 |
| ⑦ 接线与健壮 | 15 | 11 条源码字符串（翻页在 `toggleBattleLog` 之前、`logHit` 折叠口径仍在、`battleLogPage` 入参、标题 `p/pages 頁`、分组底色、`slice(...BATTLE_LOG_KEEP)`、`battleLogAppend(..., KEEP)`、`planMonarchDeath` 调用、`ending` 分支、`openSuccession` 回呼、`showIfEnded(... monarchExtinct: true)`）+ 折叠后 8 行全藏 + 0 城写灭亡旗标 + `successionLand({}, null)` 返回 `{ ok: false, reason: 'no-state' }` 不抛错 |
| region 自检 | 2 | 抽出的 region 不含 `cc`、不含相对 `import`；尾巴正好是 `#endregion`（没有截断） |

### 4.2 既有 5 个脚本（改完复跑，实际输出条数）

| # | 命令 | 结果 | 实际输出 |
|---|---|---|---|
| 1 | `node F:\sanguo\work\cocos_layout\assert_layout.mjs` | **EXIT=0，15/15 PASS** | 15 条逐条 PASS（`①a/b/c/d`、`②a/b/c/d`、`③a/b`、`④`、`⑤a/b/c/d`），明细落 `work\cocos_monarch_ui\assert_layout_rerun.json` |
| 2 | `node F:\sanguo\work\cocos_monarch84\layout_guard.mjs` | EXIT=0 | 3 行输出 / 1 条 ✓：region `CampaignRoot.ts:178–425`、`60 城 / 出界 0 / 重疊 0 對`、`✓ 版式純函數區契約完好` |
| 3 | `node F:\sanguo\work\cocos_monarch84\parity.mjs` | EXIT=0 | 31 行输出 / `✓ 0 不一致`（明细 `parity_result.json`） |
| 4 | `node F:\sanguo\work\cocos_monarch84\hud_layout.mjs` | EXIT=0 | 20 行输出 / 11 条 ✓ / `✓ 頁頭版式自檢全部通過（0 出界 / 0 相交）` |
| 5 | `node F:\sanguo\work\cocos_skin\skin_assert.mjs` | EXIT=0 | `九宫断言跑了 260 组（26 key × 10 档尺寸）` + `ALL PASS · 断言 7691 条` |

`assert_layout.mjs` 默认要 9333 端口上的浏览器，而 9333 那个旧会话是坏的
（`Get-NetTCPConnection` 显示 LISTEN、PID 64644 msedge，但 `/json/version` 连不上，`cdp.mjs run` 报
`cdp fail: browser not running on 9333`）。没动别人的会话，自建一套：
`work\cocos_layout\serve.mjs` 起 5174（PID 116544）→ `PORT=9344 PROFILE=work\.edgeprof_monarch_ui node cdp.mjs launch`
→ 用自己的 `steps_inject_layout_helpers.mjs` 注入 `assert_layout.mjs:56-79` 那段 HELPERS（脚本本身只把它写在自己的 dump 里，
`:157` 却先调 `window.__comp()`，所以必须先注入）→ `CDP_PORT=9344 node assert_layout.mjs`。
注入时实测 `c.__classname__ === 'CampaignRoot'`、`constructor.name === 'a'` —— 印证「组件查找必须用 `__classname__`」。

---

## 5. 运行时验证（不是只看代码）

同一个 9344 会话，新开 5173 的**新构建**（`F:\sanguo\game\cocos-build\web-mobile\assets\main\index.6f00d.js`，
10:27:13，690093 字节；grep 到 `本月 · `/`尚無戰事`/`頁 ▾` → 该构建已含本轮改动）：

1. 启动后停在标题页（Boot 场景，`BootRoot`）→ 直接调 `BootRoot.enterCampaign()` 进大地图（等价按「进入」）。
2. `c.pushBattleLog(lines)` 灌 11 条跨月战报（签名 `pushBattleLog(lines: readonly BattleLogLine[])`；一开始误用展开写法
   `pushBattleLog(...lines)`，`buffered` 一直 0，改正后 11 条）。
3. 读 UI：
   - `save.month = 1`（游戏内 1年1月），`title = 戰 報 · 共 11 條 · 1/2 頁 ▾`，`pages = 2`，`page = 0`；
   - `logPrev` 暗（`#65707c`）、`logNext` 亮（`#f0d79c`）；
   - page0 的 8 行：`▼ 3年4月` + 四月 5/4/3/2/1 + `▼ 3年3月` + `第6條`；
   - `turnBattleLogPage(1)` → `2/2 頁`，page1 只剩 5 行（`第5…第1條`），**第 6-8 行的 Label 全部 `active=false`**（不残留上一页的字）；
   - 末页再 `+1` 不动（`before=1, after=1`）；`-1` 回 page0；
   - **真鼠标点 `▶`**（CDP `Input.dispatchMouseEvent`，设计坐标 `(704,857)` → 页面 `(774.9,878.8)`，`scale=1.0255`）→ `page 0 → 1`，
     说明 `onTouch → logPageHit → turnBattleLogPage` 这条链在真实构建里是通的，不只是纯函数对；
   - `toggleBattleLog()` 折叠后：标题 `戰 報 · 共 11 條 ▸`、8 行全藏、两个翻页钮也收起。
4. 另灌「本月 + 上月」12 条（当前月 = 1年1月，上月 = 0年12月）拍两张图：

![战报第 1 页：▼ 本月 · 1年1月 分组头 + 本月战报，标题 1/2 頁，◀ 暗 ▶ 亮](../work/cocos_monarch_ui/ui_log_month_page1.png)

![战报第 2 页：只剩上月条目，◀ 亮 ▶ 暗，标题 2/2 頁，不足 8 行时不再画满实线](../work/cocos_monarch_ui/ui_log_month_page2.png)

截图里能直接看到：标题右侧的 `◀ ▶`、分组行的淡金底与下缘金线、组头行不写左侧时间列、正文行仍带 `1年1月`/`0年12月`、
页尾行数不足时账页线变淡（`rows.length > i ? 70 : 34`）。写完即还原（`battleLog`、`logPage`、`localStorage` 都恢复到灌之前）。

辅助脚本（都在我的目录）：`steps_inject_layout_helpers.mjs`、`steps_uicheck_battlelog.mjs`、`steps_probe_logrow.mjs`、
`steps_shot_battlelog.mjs`、`steps_probe_canvas.mjs`、`steps_probe_boot.mjs`、`steps_probe_layout_env.mjs`。

---

## 6. 没做到 / 已知差异（说清楚，不粉饰）

1. **`work\cocos_monarch85\probe.mjs` 有 2 条陈旧失败**（201 条里 199 PASS）：该脚本不在本次验收清单里、目录也不归我，我没有改它。
   两条都是「旧口径漂移」，改前就会红：
   - `✗ 戰報浮層在地圖區內（不壓底部城市卡 1240）`：`probe.mjs:249` 断 `L.y + L.h <= 1080`，而 `LOG_VIEW` 是 `{ y: 842, h: 298 }` → `1140`。
     证据：`work\cocos_artveil\backup\CampaignRoot.ts.orig`（9:21 的旧稿）里 `LOG_VIEW` 已经是这一组值（v18-cocos-layout 把战报搬到地图下方的既定设计）。
   - `✗ 接線：滅亡後不再播種君主`：`probe.mjs:475` 逐字钉 `if (!this.monarchExtinct) M.seedMonarch(view, this.cities);`，
     现源码多一个参数 `M.seedMonarch(view, this.cities, { king: runPlayerForce() || undefined })`（开局选君主优先，后续轮加的功能）。这是功能，不能为了探针删。
2. **战报缓存只留 40 条**（≈5 页），不是全量历史；更早的月份会被丢弃（`[新设计]`，理由见 §3.1 `BATTLE_LOG_KEEP`）。
3. **每页仍是 8 行**：`BATTLE_LOG_MAX = 8` 没动（v17 probe 钉死）。「看更多」= 翻页 + 缓存 40，不是「一屏显示更多」。
4. **没有微信真机/构建验证**：按派单不跑 `tools\build_wechat.ps1`；运行时验证只覆盖 web-mobile（Edge 158）大地图。
5. **`succession_assert.mjs` 没有阴性对照**（v17 probe 有两处「改坏必须变红」）。这轮时间花在运行时验证上，留作改进项。
6. **`MonarchPanel.ts` 一行没改**：候选 5/页、翻页行「下一頁 ▶（x/y）」、extinct 的 confirm 行都是 v17 既有实现，本轮只做验证。
7. **跨场景没回归**：只测了 `start()` / `advance()` 两个入口的字符串与纯函数行为 + 大地图运行时；
   「Deploy 场景破城 → 回大地图判阵亡」这条链仍只有 v17 的证据（`loadMonarchSeat` 座位机制，`CampaignRoot.ts:3075-3101`）。

### `[推测]` 标注

- `[推测]` G1 的「双窗」是从调用顺序（`checkMonarchDeath` 在 `EndingPanel.showIfEnded` 之前，`CampaignRoot.ts:1294` vs `:1304`）
  + `EndingModel.isMonarchLost`（`:198`）推出来的，没有在改前的构建上截到双窗同屏的图。
- `[推测]` 9344 会话一进大地图就弹着「抓到敵將」（`SurrenderPanel`）是存档里残留的待决俘将，不是本轮改动引起；截图前临时把它 `active=false`，拍完恢复。
- `[推测]` 「本月」判定依赖 `battleLogLine` 写入时的 `monthStamp(当月)`；若有人手改 localStorage 里的 `t`，分组仍按 `t` 分组、但「本月」不会亮（设计上的保守选择）。

---

## 7. 复现命令

```powershell
# 类型检查
cd F:\sanguo\game\cocos; node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   # EXIT=0

# 我的 79 条
cd F:\sanguo\work\cocos_monarch_ui; node succession_assert.mjs                                    # ALL PASS · 79 条

# 既有 4 个（纯 node）
cd F:\sanguo\work\cocos_monarch84; node layout_guard.mjs; node parity.mjs; node hud_layout.mjs
cd F:\sanguo\work\cocos_skin; node skin_assert.mjs                                                 # 7691 条

# assert_layout（需要先有会话来注入 HELPERS）
cd F:\sanguo\work\cocos_layout; $env:PORT='5174'; node serve.mjs                                  # 后台
cd F:\sanguo\work\cocos_verify
$env:PORT='9344'; $env:PROFILE='F:\sanguo\work\.edgeprof_monarch_ui'
$env:PAGE_URL='http://127.0.0.1:5174/cocos_layout/cocos-build/web-mobile/index.html?v=5'
$env:OUTDIR='F:\sanguo\work\cocos_monarch_ui'; node cdp.mjs launch
node cdp.mjs run F:\sanguo\work\cocos_monarch_ui\steps_inject_layout_helpers.mjs
cd F:\sanguo\work\cocos_layout; $env:CDP_PORT='9344'
$env:ASSERT_OUT='F:\sanguo\work\cocos_monarch_ui\assert_layout_rerun.json'; node assert_layout.mjs  # 15/15

# 战报运行时（5173 的新构建）
node cdp.mjs run F:\sanguo\work\cocos_monarch_ui\steps_uicheck_battlelog.mjs
node cdp.mjs run F:\sanguo\work\cocos_monarch_ui\steps_shot_battlelog.mjs
```
