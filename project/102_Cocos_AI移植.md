# 102 Cocos 大地图 AI 移植（ai_model.js → AiModel.ts / AiRunner.ts）

日期：2026-11-25 · 范围：`game\cocos\assets\scripts\AiModel.ts`、`AiRunner.ts`、`work\cocos_ai84\**`

## 0. 结论

| 项 | 结果 |
|---|---|
| Cocos 侧 AI | 已有：`AiModel.ts`（纯逻辑，113 个导出）+ `AiRunner.ts`（一月编排） |
| 等价对拍 | **5 剧本 × 12 月 × 60 城 × 116 路，比较条目 2258、比较字段 295425、不一致 0（0.000000%）** |
| 定点 API 检查 | 1317 个字段，0 不一致 |
| 确定性 | 同 seed 两边逐字段相同；web 自身跑两遍也完全相同 |
| `tsc -p tsconfig.check.json --noEmit` | **exit 0**（含 `AiModel.ts`/`AiRunner.ts`；§5 的补丁代码另由 `assign-test.ts` 按真实成员类型编译通过） |
| 宿主接线 | 只给补丁，未落地（`CampaignRoot.ts` 正被 v11 改，`GameState.ts` 不在我可改范围） |

移植口径：**逐函数 1:1 翻译**。web `ai_model.js` 的每个导出符号在 `AiModel.ts` 里同名导出，算法、常数、随机数调用次序、比较器全序、字段优先级一律照抄；只加类型注解，不改行为。随机源、DOM、localStorage、`cc` 一律不碰（`AiModel.ts` 与 `AiRunner.ts` 都不 import `cc`）。

## 1. 新增文件与行数

| 文件 | 行数 | 说明 |
|---|---|---|
| `game\cocos\assets\scripts\AiModel.ts` | 2657 | web `ai_model.js`（2384 行）的 TS 移植；113 个 `export`（含 24 个 interface/type） |
| `game\cocos\assets\scripts\AiRunner.ts` | 592 | 「一月」编排入口；`runMonth(state, cities, generals, ctx) => AiMonthOutcome`，另有 `runAiMonth` 别名 |
| `work\cocos_ai84\parity.mjs` | 831 | 等价对拍驱动（同时 import web 与 Cocos 编译产物） |
| `work\cocos_ai84\runner-smoke.mjs` | 195 | AiRunner 冒烟：模拟 `CampaignSave` 形状跑 5 剧本 × 12 月 |
| `work\cocos_ai84\build.mjs` | 48 | 用 tsc 把 AiModel/AiRunner 编到 `build/`，并把 `./AiModel` 说明符补成 `./AiModel.js` |
| `work\cocos_ai84\tsconfig.build.json` | 24 | 只编这两个文件（`module ES2022`、`strict`、无 `cc`） |
| `work\cocos_ai84\assign-test.ts` | 203 | 宿主补丁可赋值性验证：`CampaignSave`/`Garrison`/`CampaignCity[]` 直传 `runMonth` 不需 `as`；文件末尾用 `CampaignRootHarness` 把 §5.3 的 `runMapAi()` **逐字复刻**并按 CampaignRoot 真实成员类型编译 |
| `work\cocos_ai84\parity-report.json` | — | 对拍明细（逐 case 统计、不一致列表；本次为空数组） |

`AiModel.ts.meta` 未建：按约定由 Creator 首次导入时生成。

## 2. 移植对照：哪些“不得不不同”

`AiModel.ts` 里没有任何行为性偏差，只有类型层面与模块层面的改动：

| 改动 | 原因 | 影响 |
|---|---|---|
| `import { num, intOr } from './saves.js'` → 文件内自带 `num`/`intOr`/`str`/`clamp` | Cocos 不能依赖 `game/web/**` | 逐字照抄 `saves.js:50`、`saves.js:56` 的语义，无行为差 |
| 所有函数加参数/返回值类型；新增 24 个 interface | `strict: true` | 无（类型擦除） |
| `AiCity`/`AiSave`/`AiPath`/`AiOfficer` 去掉 `[key: string]: unknown` 索引签名 | 有索引签名时 `CampaignSave`/`CampaignPath` **无法**直接赋给 `AiSave`/`AiPath`（`TS2322 Index signature is missing`），宿主就得写 `as unknown as` | 无运行时影响；换来宿主零断言接线（`assign-test.ts` 已验证 exit 0） |
| `ACT_NAMES` 等用 `readonly string[]` 而非 `as const` 元组 | 否则 `.includes(string)` 在调用侧报 `TS2345` | 无 |
| `[推测]` `Object.freeze` 常量在微信小游戏运行时同样按普通对象处理 | 微信 JS 引擎与 V8 一致 | 无（本次对拍在 node 下，未上真机） |

真正与 web 的**行为差异为零**，由 §3 的 0 不一致背书。

## 3. 等价对拍（最重要的一节）

### 3.1 怎么做的

`work\cocos_ai84\parity.mjs` 同时 import 两个模块，跑**同一份驱动代码**：

```js
const WEB = await import(pathToFileURL('F:/sanguo/game/web/ai_model.js'));
const COC = await import(pathToFileURL('F:/sanguo/work/cocos_ai84/build/AiModel.js'));
// runCase(MOD, fixture, cfg) —— 两个模块走完全相同的调用序列
```

驱动只用两边的**导出 API**，不碰内部函数：

1. `prepareMonth` 造世界 → `planMonth({king,month}, world.cities, ctx)` 选行动 → `executeMonth(world, actions, {rng})` 执行；
2. 逐条 executed：打玩家的**不结算**（记 `incoming`，与 `campaign.html` 一致），打 AI 的 `resolveBattle` + `describeAction`/`describeCandidate`；
3. `describeReports`、`checkForceDeaths`、世界回写存档、`syncOwned`、`monthlyDrift`；
4. 每月单独 `seedRng(seed)`，**同一个 rng 同时喂给 plan 与 execute**（这样随机数调用次序错位也会被抓到），并统计每月 rng 调用次数；
5. 另有一条定点 API 检查（`unitChecks`）：常数表、12 个 `ACT_IMPL` 的直接产物、`planDomestic/planRecruit/planAttack/planJoin/planMoveGeneral/planForceMonth`、`captureKingIn/extinguishForce/nearestForce/successorOf`、`describePlan/describeAction/describeCandidate`、`prepareMonth` 的 owner 回退链。

`diff(a,b,where,acc)` 是递归深比较：**计数所有叶子字段**，任何 `!==`（NaN 容忍）都记一条 `{path, web, cocos}`。快照序列化器对每个对象固定字段表**并附带排序后的 key 列表**，所以“多一个字段/少一个字段”也会被抓到，不会因为只比已知字段而漏掉形状漂移。

数据来源 `game\data\scenarios.json`（5 剧本 × 60 城 × 116 路）+ `garrison.json`（归属/太守/武将）+ `generals.json`（忠誠漂移）。

### 3.2 规模与结果

```
剧本 5 / 月 60 / 城 60 / 路径 116
定点 API 检查：字段 1317，不一致 0
比较条目 2258；比较字段 295425；不一致 0（0.000000%）
确定性自检（web 跑两遍）：全部一致
  剧本1 玩家=何進 条目616 字段64572 野战100 待战42 灭亡1
  剧本2 玩家=劉表 条目773 字段79816 野战169 待战12 灭亡3
  剧本3 玩家=袁紹 条目288 字段47515 野战63  待战0  灭亡2
  剧本4 玩家=孫權 条目352 字段55679 野战61  待战14 灭亡1
  剧本5 玩家=孫權 条目228 字段46526 野战44  待战0  灭亡0
```

- **剧本数 5**（要求 5，✅）
- **月数 12/剧本 = 60 个月轮**（要求 12，✅）
- **比较条目 2258 条 / 比较字段 295425 个 / 不一致 0**（✅ 0 不一致）
- 条目 = 每月的「世界快照 + 行动表 + executed 明细 + reports + incoming + drift + save/forces 快照」；字段 = 这些条目展开后的全部叶子值（含势力/行动/目标/兵力/金钱/日志文本）。
- 逐字段覆盖：势力 id、action（act/kind/sub）、from/to/joinCity、`a/b` 出兵数、`generals`、rate、score、`reason` 文案、`describeAction`/`describeCandidate`/`describePlan` 文本、executed 的 `result`（含 `captured/atk/def/left/oldMajor/gold/before/after/pop`）、每城 troops/money/pop/owner/major/DEFENSE/officers、forces 表、`owned`、drift 的 tire/spirit/loyal 计数与名字表、每月 rng 调用次数。

### 3.3 负控制（证明对拍真能抓到差异）

故意把编译产物里的 `ATTACK_PLAYER: 200` 改成 `201`（只改 `build/AiModel.js`，源码不动）：

```
定点 8 条不一致 + 比较字段 243/13602 不一致（1.786502%），exit 1
首条：[unit] unit.constants.RATE.ATTACK_PLAYER web=200 cocos=201
```

重新编译后回到 0 不一致。**对拍不是恒真断言。**

### 3.4 复跑

```powershell
cd F:\sanguo
node work\cocos_ai84\build.mjs        # tsc 编译 AiModel/AiRunner → work\cocos_ai84\build
node work\cocos_ai84\parity.mjs       # 等价对拍（exit 0 = 0 不一致）
node work\cocos_ai84\runner-smoke.mjs # 编排层冒烟
# 可选环境变量：PARITY_SCENARIOS=3 PARITY_MONTHS=6（快速档）、PARITY_SHOW=1（打印明细）
```

耗时：build ≈ 3 s、parity ≈ 0.93 s、smoke ≈ 0.28 s（node 24.21）。

## 4. AiRunner.ts：一月怎么编排

```ts
runMonth(state: AiSave, cities: unknown, generals: unknown, ctx: AiRunnerCtx = {}): AiMonthOutcome
```

`AiMonthOutcome = { month, log: string[], changed, actions, executed, reports, incoming, battles, gone, drift, forces, seed }`

七步（与 `campaign.html` 的 `runAiMonth` 同序）：

1. **补宿主情报**：`buildMeta(cities, ctx)` 把剧本城市行 + `ctx.garrisonOf(name)` 合成 `owner/major/officers/DEFENSE`，`ensureMeta` 只补缺不覆盖；
2. **势力同步**：`save.king` 缺省时取 `ctx.playerId || '玩家'`；`buildForces` + `syncOwned`（同步 `owned` 与城 owner）；
3. **选行动**：`prepareMonth` → `planMonth`，`rand = ctx.rand ?? seedRng(ctx.seed ?? (month+1)*7919)`（与 web 同一条种子公式）；
4. **执行**：`executeMonth(world, actions, {rng})`；
5. **分流战报**：打玩家（`act === ACT.ATTACK_PLAYER` 或 `forceOf(world,to) === playerId`）→ 只进 `incoming` + 日志「（待 守 城 戰）」；打 AI → `resolveBattle` 就地结算，得手时 `captureKingIn`（君主阵亡/继位/灭势力），日志「得 手/敗 退（守 N 兵）」；非战斗行动按 `describeAction` 记一行；
6. **内政即时回报 + 灭亡检查**：`reports[].immediate` 的徵兵行、`checkForceDeaths`；
7. **回写 + 漂移**：`applyWorld`（比 web 的 `applyWorld` 多回写 `major/officers/DEFENSE`）、再 `syncOwned`、`monthlyDrift`。

日志第一行固定 `AI 月 報：N 個勢力行動（勢力·行動、…）`（与 web `pushLog` 同文案）。

**不入 UI、不 import `cc`、不推进月份**（`save.month` 由宿主 `GameState.advanceMonth` 推）。宿主按需挂 `onIncoming/onBattle/onForceGone` 三个钩子拿即时事件。

### 与 web 的差异（都在 AiRunner 层，`AiModel.ts` 无差异）

| 差异 | 标记 | 原因 |
|---|---|---|
| 打玩家不立刻开战，而是产出 `incoming[]` 交给宿主转成 B 方在途部队 | `[新设计]` | Cocos 没有“弹一个守城战页面”的同步入口，复用现有 `GameState.addArmy` + `arrivedAt` 的「行軍中 → 到城下 → 守城戰」流程；web 是 `incoming.push` 后立刻 `startBattle` |
| `save.owned` 的城强制归属成独立势力「玩家」（`save.king` 为空时） | `[新设计]` | Cocos 侧没有势力表（`CampaignSave` 无 `king/force/forces`），`GameState.initCampaign` 直接把剧本前 3 城给玩家，这 3 城在 `garrison.json` 里可能属于 3 个不同势力；不这么干，AI 会把玩家城当自家/别家 AI 城直接结算掉 |
| 回写 `major/officers/DEFENSE` | `[新设计]` | web 的 `applyWorld` 只回写 troops/money/owner；Cocos 存档里城级人事是 AI 的唯一来源（没有全局将领表），不回写就会“太守永远不变” |
| 漂移的 `rowOf` 先用世界里的武将对象、再退回 `generals.json` 行 | `[新设计]` | `generals.json` 的 `LOYAL` 字段**全为空串**（真值在大小写不同的 `Loyal` 里），直接用会让忠誠漂移完全不发生；`garrison.json` 的 `officers[].loyal` 是数值，更准。（`AiModel.loyalOf` 与 web 一致地只读 `LOYAL ?? loyal`，所以对拍无差） |
| `changed` 返回布尔（web 无此概念） | `[新设计]` | 宿主据此决定是否 `persistSave()` / 重绘 |

`tire` 恒为 0：Cocos 侧没有任何「加疲勞」的来源（web 是战斗后加），属于**已知未接线**，不是移植遗漏。

## 5. 宿主接线补丁（只给补丁，未落地）

> `CampaignRoot.ts` 正被 v11 改（我落笔时读到的是 1482 行版本：`private cities/paths/generals` 在 `:406-408`、`private data/save` 在 `:410-411`），行号会漂。**锚点以代码文本为准**，下面同时给行号（该版本）和原文。

### 5.1 需要哪些 state 字段

| 字段 | 现状 | AI 用途 | 补丁 |
|---|---|---|---|
| `save.cities[name].troops/pop/money` | ✅ 有 | 兵力/人口/金钱 | 无 |
| `save.cities[name].owner` | ❌ 无 | 城的归属（谁打谁） | GameState 加字段 + normalize 保留 |
| `save.cities[name].major` | ❌ 无 | 太守（出兵将、君主阵亡判定） | 同上 |
| `save.cities[name].officers` | ❌ 无 | 城内武将（徵兵/内政/守将） | 同上 |
| `save.cities[name].DEFENSE` | ❌ 无 | 城防（守城强度） | 同上 |
| `save.owned` | ✅ 有 | 玩家城（AI 跳过 + 归属「玩家」） | 无 |
| `save.king` / `save.force` | ❌ 无（`seedMonarch` 从没被调用） | 玩家势力 id | AiRunner 内部缺省写 `'玩家'`，无需宿主补 |
| `save.forces` | ⚠️ 顶层已有白名单外透传，但从未写入 | 势力表（旗/存续） | AiRunner 会写；GameState 无需改（顶层 passthrough 已存在 `:215-217`） |
| `cities[]` 行（`NAME/POPULATION/DEFENSE/MONEY/KING`） | ✅ 有 | 城规模、城防、初始归属 | 无 |
| `paths[]` | ✅ 有 | 路网/距离/相邻 | 无 |
| `garrison.json`（`garrisonOf(data,0,name)`） | ✅ 已有 `this.data` | owner/major/officers | 无 |
| `generals.json` | ✅ `this.generals` | 忠誠漂移 | 无 |

### 5.2 GameState.ts 补丁（2 处）

**(1) `CityRuntime`（`GameState.ts:19-23`）加 4 个可选字段**

```ts
export interface CityRuntime {
  troops: number;
  pop: number;
  money: number;
  /** [AI] 城主（势力 id，= garrison.json 的 owner）；'' = 空城 */
  owner?: string;
  /** [AI] 太守 */
  major?: string;
  /** [AI] 城内武将 */
  officers?: Array<{ name?: string; str?: number; int?: number; loyal?: number; status?: string | number }>;
  /** [AI] 城防 */
  DEFENSE?: number;
}
```

**(2) `normalize()` 的城对象（`GameState.ts:191-195`）加 passthrough**

锚点原文：

```ts
      cities[name] = {
        troops: Math.max(0, Math.floor(numberOr(c.troops, 0))),
        pop: Math.max(0, Math.floor(numberOr(c.pop, 0))),
        money: Math.max(0, Math.floor(numberOr(c.money, 0))),
      };
```

改成：

```ts
      const runtime: CityRuntime = {
        troops: Math.max(0, Math.floor(numberOr(c.troops, 0))),
        pop: Math.max(0, Math.floor(numberOr(c.pop, 0))),
        money: Math.max(0, Math.floor(numberOr(c.money, 0))),
      };
      // [AI] 城级 AI 字段：AiRunner 每月会写回 owner/major/officers/DEFENSE，
      // 这里若只保留上面 3 个键，下次 loadSave 就被吃掉（与 :212 的顶层 passthrough 同理）。
      if (typeof c.owner === 'string') runtime.owner = c.owner;
      if (typeof c.major === 'string') runtime.major = c.major;
      if (Array.isArray(c.officers)) {
        const list = c.officers
          .map((item) => recordOf(item))
          .filter((item): item is Record<string, unknown> => !!item && typeof item.name === 'string')
          .map((item) => ({
            name: String(item.name),
            str: Math.trunc(numberOr(item.str, 0)),
            int: Math.trunc(numberOr(item.int, 0)),
            loyal: Math.trunc(numberOr(item.loyal, 0)),
            status: typeof item.status === 'string' ? item.status : '登',
          }));
        if (list.length > 0) runtime.officers = list;
      }
      if (c.DEFENSE !== undefined) runtime.DEFENSE = Math.max(0, Math.floor(numberOr(c.DEFENSE, 0)));
      cities[name] = runtime;
```

（`recordOf`、`numberOr` 都是 `GameState.ts` 里现成的私有 helper。）

顶层字段**不用改**：`normalize()` 末尾 `:215-217` 的「白名单之外的键原样带过」已经把 `king/force/forces/talentPool/tire/loyal/morale` 保住了。

### 5.3 CampaignRoot.ts 补丁（3 处）

**(1) import（`CampaignRoot.ts:34` `import * as GameState from './GameState';` 之后）**

```ts
import { PLAYER_FORCE, runMonth as runAiMonth } from './AiRunner';
import type { AiMonthOutcome, AiRunnerGarrison } from './AiRunner';
```

**(2) advance 分支：插在 `marchArmies(3)` 之后、`spawnRaid()` 之前**

锚点原文（`CampaignRoot.ts:887-892`）：

```ts
      const income = GameState.advanceMonth(this.cities);
      // 顺序很关键：先让已在路上的部队走完这一个月，再让 AI 出兵（新部队 progress=0），
      // 否则本月新出的兵会立刻抵达，玩家永远看不到「行軍中」这一步。
      const moved = GameState.marchArmies(3);
      const spawned = this.spawnRaid();
      this.save = GameState.loadSave();
```

改成：

```ts
      const income = GameState.advanceMonth(this.cities);
      // 顺序很关键：先让已在路上的部队走完这一个月，再让 AI 出兵（新部队 progress=0），
      // 否则本月新出的兵会立刻抵达，玩家永远看不到「行軍中」这一步。
      const moved = GameState.marchArmies(3);
      // [AI] 大地圖 AI：一次推进所有 AI 势力（对齐 web campaign.html 的 runAiMonth）。
      // AI 打 AI 就地结算并回写存档；AI 打玩家只产出来犯队列，转成 B 方在途部队。
      const ai = this.runMapAi();
      // 有大地圖 AI 时，旧的粗糙 AI（每回合最多 1 路、按 0.6 折算兵力）停用，避免两套 AI 各出一路。
      const spawned = ai ? null : this.spawnRaid();
      this.save = GameState.loadSave();
```

紧接着的提示文本（`CampaignRoot.ts:896-897`）加两行：

```ts
      const notes = [`推進一月：稅收 +${income} 金。`];
      if (ai && ai.log.length > 0) notes.push(ai.log[0]);                       // 「AI 月 報：N 個勢力行動（…）」
      if (ai && ai.incoming.length > 0) {
        notes.push(`AI 出兵 ${ai.incoming.length} 路，來犯：${ai.incoming.slice(0, 3).map((row) => row.to).join('、')}。`);
      }
      if (spawned) notes.push(`敵軍出動：${spawned.from} → ${spawned.to}（${spawned.troops} 兵）。`);
```

**(3) 新方法 `runMapAi()`（放在 `spawnRaid()` 前面，`CampaignRoot.ts:1034` 上方）**

```ts
  /**
   * 大地圖 AI：一次推进所有 AI 势力（对齐 web campaign.html 的 runAiMonth）。
   * - AI 打 AI：就地结算，得失手/灭亡都写进 log 与存档；
   * - AI 打玩家：只产出来犯队列，转成 B 方在途部队（progress=0 → 下个月走完才到城下），
   *   玩家点该城走「守 城 戰」，与现有 arrivedAt 流程一致。
   */
  private runMapAi(): AiMonthOutcome | null {
    const save = this.save;
    if (!save || !this.data) return null;
    const garrisonOfCity = (name: string): AiRunnerGarrison | null => {
      const data = this.data;
      if (!data) return null;
      const g = garrisonOf(data, 0, name);
      if (!g) return null;
      return {
        owner: g.owner,
        major: g.major,
        garrison: g.garrison,
        officers: g.officers.map((o) => ({ name: o.name, str: o.str, int: o.int, loyal: o.loyal, status: o.status })),
      };
    };
    const out = runAiMonth(save, this.cities, this.generals, {
      playerId: PLAYER_FORCE,
      paths: this.paths,
      seed: (save.month + 1) * 7919,     // 与 web 同一条种子公式
      garrisonOf: garrisonOfCity,
      capOf: (name: string) => {
        const city = this.cityByName(name);
        return city ? GameState.garrisonOf(city) : 0;
      },
    });
    for (const row of out.incoming) {
      const pathIndex = pathBetween(this.scenarioLike(), row.from, row.to);
      if (pathIndex === null) continue;
      GameState.addArmy({
        id: GameState.nextArmyId('B'),
        side: 'B',
        from: row.from,
        to: row.to,
        pathIndex,
        progress: 0,
        troops: Math.max(1, Math.round(row.troops)),
        general: row.cand?.generals?.[0] ?? '來犯之將',
      });
    }
    if (out.changed) GameState.persistSave();
    return out;
  }
```

要点：
- `playerId: PLAYER_FORCE`（常量 `'玩家'`）是**故意**的：Cocos 玩家没有势力 id，`initCampaign` 直接把前 3 城给玩家，这 3 城在原剧本里可能属于 3 个不同势力。传固定 `'玩家'` 后，AiRunner 会把这 3 城的 owner 改写成 `'玩家'`，AI 才会把它们当“别人的城”来打。
- 这一步放在 `marchArmies(3)` **之后**：本月新出的 B 方部队 `progress=0`，不会当月抵达（与现有注释同一个理由）。
- `spawnRaid()` 保留但被 `ai ? null :` 短路，回滚只需删掉这两行。
- 若想先灰度：`const ai = this.aiEnabled ? this.runMapAi() : null;`（`aiEnabled` 用 `sys.localStorage` 开关，不在本补丁内）。

### 5.4 落地的验证顺序

1. 打 GameState 补丁 → `tsc -p tsconfig.check.json --noEmit` exit 0；
2. 打 CampaignRoot 补丁 → 同上；
3. 真机/预览：点「推進一月」应看到 `AI 月 報：N 個勢力行動（…）`，且 2~3 个月内有城易主；
4. 老档兼容：`normalize` 对缺 `owner` 的城不写该键，AiRunner 会按 `garrison.json` 补（`ensureMeta`），所以**旧存档不需要迁移**。

## 6. tsc 与冒烟

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
```

**退出码 0**（2026-11-25 实测；`tsc` 版本取 `game\node_modules\typescript`，与任务书给定的命令一致）。

- `AiModel.ts` / `AiRunner.ts`：0 错误。两个文件不 import `cc`、不碰 DOM/localStorage，`build.mjs` 末尾还会断言产物里没有 `from 'cc'`（否则 exit 2）。
- 补丁代码也验过类型：`work\cocos_ai84\assign-test.ts` 末尾的 `CampaignRootHarness` 把 §5.3 的 `runMapAi()` **逐字**放进去、成员类型按 `CampaignRoot` 真实声明（`this.data: GameData`、`this.cities: CampaignCity[]`、`this.paths: CampaignPath[]`、`cityByName(): CampaignCity | undefined`、`GameState.nextArmyId/addArmy/persistSave`、`core/march.Army` 含 `general?: string`），`tsc --strict` exit 0。
- 说明：会话中段该命令曾短暂报 `CampaignRoot.ts:455/:1076 Property 'syncMonarchState' does not exist`——那是 v11 正在改该文件的中间态（不在我可改范围），v11 收尾后重跑即 exit 0。

`runner-smoke.mjs`（模拟 `CampaignSave` 形状、5 剧本 × 12 月）exit 0：

```
剧本1 玩家=王朗 易主47 出兵180（野战168 待守12 得手131）灭亡11 日志228
剧本2 張魯 易主48 出兵84（野战65 待守19 得手47）灭亡2
剧本3 孟獲 易主44 出兵68（57/11/39）灭亡1
剧本4 孟獲 易主46 出兵47（47/0/36）灭亡0
剧本5 孟獲 易主44 出兵38（38/0/27）灭亡0
合计：易主 229 城、出兵 417 次（野战 280 得手）、灭亡 14 个势力、日志 572 行
```

（冒烟里玩家取“最弱势力”，所以 5 个剧本都是被围攻的一方；这也说明 AI 会主动打玩家。）

## 7. 没做到 / 待确认

1. **未落地**：`CampaignRoot.ts`、`GameState.ts` 的补丁都只在本文，没改文件（任务书禁改/需他人拍板）。
2. **未上真机**：对拍全在 node 24 下跑，微信小游戏真机未验。`[推测]` `Object.freeze`、`Math.trunc`、`Array.prototype.includes` 在微信基础库下行为一致。
3. **`tire`（疲勞）恒 0**：Cocos 侧没有“战斗后加疲勞”的来源，`monthlyDrift` 的 tire 分支永远不触发。要接需要在 `resolveBattle`/守城战结算处加 `addTire`。`[新设计]` 建议下一轮做。
4. **`save.forces` 只写不读**：AI 每回合会重建 `forces`，但 Cocos UI（国旗/势力色）还没读它。`[新设计]` 后续可喂 `M.forceRoster`。
5. **存档体积**：`[推测]` 每城多 4 个字段（`officers` 是大头，约 8 人 × 60 城 ≈ 30 KB 文本），微信 `localStorage` 单键上限 1 MB 内应该安全，但没实测。
6. **玩家势力 id 的长期方案**：现在靠 `PLAYER_FORCE='玩家'` 这个伪势力。等 `MonarchModel.seedMonarch` 真正接上（现在全工程 0 处调用），应改成“玩家势力 = `save.force`”，届时 AI 跳过整势力、而非只跳 `owned`，与 web 完全一致。`[新设计]`
7. **AI 打玩家的兵力口径**：`incoming.troops` 是候选表的 `a`（出兵单位数），转成 B 方部队时乘 `TROOP_UNIT=20` 与否需要拍板——当前 `AiModel` 里 `executeAction` 已经按 `a` 扣城内部队（`dispatchTroops` 口径），所以 `incoming.troops` 直接就是兵数，补丁里 `Math.round(row.troops)` 不做换算。`[推测]` 若守城战面板需要的是候选表原始值，这里要改。
8. `parity-report.json` 里的 `misses` 是空数组；`PARITY_SHOW=1` 可打印前 50 条。

## 8. 文件清单（本任务实际写入）

```
game\cocos\assets\scripts\AiModel.ts        2657 行（新）
game\cocos\assets\scripts\AiRunner.ts        592 行（新）
work\cocos_ai84\parity.mjs                   831 行（新）
work\cocos_ai84\runner-smoke.mjs             195 行（新）
work\cocos_ai84\build.mjs                     48 行（新）
work\cocos_ai84\tsconfig.build.json           24 行（新）
work\cocos_ai84\assign-test.ts               203 行（新）
work\cocos_ai84\parity-report.json           对拍明细（生成）
work\cocos_ai84\build\AiModel.js|AiRunner.js 编译产物（生成）
project\102_Cocos_AI移植.md                  本文
```

未触碰：`CampaignRoot.ts`、`CityPanel.ts`、`ItemsPanel.ts`、`BattleRoot.ts`、`ArtLayer.ts`、`core\**`、`game\src\**`、`game\web\**`、`game\tests\**`、`tools\**`、`project\37a|31|44`。
