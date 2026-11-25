# project 79 — web 侧修补（R83 搜索种子 / R17 等级窗 / R29 / R14）

范围：`game/web/city_model.js`、`game/web/ai_model.js`、`game/tests/webfix_r83.test.ts`；`project/31_还原清单.md` 只追加 R29 行。
没有 git；所有行号是 2026-11-25 修改后的实际行号。

## 0. 结论

| 项 | 结论 | 证据 |
|---|---|---|
| R83 搜索种子被 `MAX_LOG` 截断 | **真 bug，已修**：第 61 次起种子冻结 | 同城同月 100 抽：种子 61→100、产出 25→37 种、最长连击 40→6 |
| R17 SearchType 等级窗 | **真缺口，已实装**（显式等级时启用；等级未知保持旧口径） | `searchPools(ITEMS,[],45)=22/35 含 45`；`(,2)=22/14 不含 45`；`()=22/50` |
| AI 九项 ACT 分布 | **病态已确认（选中层 100% attack），未改代码** | 5 剧本 ×12 月 576 条全 attack；候选层 attack/develop/search 都有；既有 6 条测试钉死 18..35，改 `KIND_RATE` 必红 |
| R29 兵力档位 | **实现对、37a 错**：实现 `[50,80,100]`、上限 100；200 档无据 | `deploy.html` 滑杆 1..100 夹上限；65 #99；31 追加 47/47a |
| R14 `80/(Length+1)` | **不改代码；R14 归属错误**：原作是 ACT=8 佔領空城，不是移動武將；已在 `ai_model.js` 实现 | 04c:135/375、04d:134/145/261；`ai_model.js:481`、`1891-1892` |

新增测试 14 条（`game/tests/webfix_r83.test.ts`），改坏→红→还原 3 轮（另有 1 次语法错误已还原）。
`tsc --noEmit`：exit 0。全量：**773 / pass 773 / fail 0**（74.3s），详见 §5.1。

---

## 1. R83 真 bug：搜索种子被日志截断

### 1.1 根因（修复前代码）

`game/web/city_model.js:148`：

```js
MAX_LOG: 60,
```

`logAdd` 每次把日志裁到 60 条（修复前 `:658-659`，现 `:706`）：

```js
if (save.searchLog.length > SEARCH.MAX_LOG) save.searchLog = save.searchLog.slice(-SEARCH.MAX_LOG);
```

搜索次数却从这个被裁剪的日志里数（修复前 `searchCount`，`city_model.js:760-764`）：

```js
export function searchCount(save, cityName) {
  const list = Array.isArray(save?.searchLog) ? save.searchLog : [];
  return list.filter((e) => e.city === cityName && e.cmd === '搜索').length;
}
```

种子直接用这个数（修复前 `:725-727`）：

```js
const count = searchCount(save, city);
const seed = searchSeed(city, save.month, count);
const rng = mulberry32(seed);
```

`searchCount` 到 60 就封顶；第 61 次起 `count` 恒为 60，`searchSeed(city, month, 60)` 恒定，
`mulberry32` 的随机序列、`pickWeightedKey`/`pickWeightedItem` 的抽取全部逐位重复。
「同城第 61 次起种子冻结」即由此而来；k2-tests 的 75 抽只有 27 种是本 bug 的直接表现。

### 1.2 修法

1. `ensureExtras` 在日志规整之后新增 `save.searchSeq`（`{[城名]: 非负整数}`）：
   - 已有该键：清洗成 `{城名: Math.max(0, trunc(n))}`；
   - 老存档没有：从 `searchLog` 里 `cmd === '搜索'` 的条数按城累计，**只补下限**，不覆盖更大值。
   代码在 `city_model.js:401-420`。
2. `search()` 在成功路径、写日志之前自增（`city_model.js:806`）：

   ```js
   bumpSearchSeq(save, city, count);
   logAdd(save, { city, cmd: '搜索', kind: out.kind, text: out.text, m: save.month });
   ```

   先自增再写日志：`logAdd` 会调 `ensureExtras`，顺序反了老档迁移会把刚写的一条也数进去，变成 `count+2`。
   金不足在 `:770` 早退，不会走到自增。
3. `searchCount` 优先读 `save.searchSeq[cityName]`，缺失才退回日志条数（`city_model.js:816-824`）：

   ```js
   const seq = save?.searchSeq;
   if (seq && typeof seq === 'object' && !Array.isArray(seq)) {
     const n = Number(seq[cityName]);
     if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
   }
   ```

4. 新增 `bumpSearchSeq`（`city_model.js:827-834`），只增不减：

   ```js
   save.searchSeq[cityName] = Math.max(prev + 1, Number.isFinite(cur) ? cur + 1 : 1);
   ```

5. 兼容性：
   - `saves.js:9` 明说不做字段白名单，`writeSlot` 原样快照整份 save（`saves.js:534-544`），`searchSeq` 会随存档往返；测试 7 已钉。
   - `campaign.html:3005-3055` 的 `normalizeCampaign` 只补默认值、不删未知键，`searchSeq` 不会被清掉。
   - `city_selftest.mjs:97-107` 的 `searchCount` 期望（+2、日志 2 条、金 -2×COST）保持通过。

### 1.3 前后证据（同城同月 100 抽，items 去掉 ONLYONE）

复现修复前：每次 `save.searchSeq['代縣'] = Math.min(i, 60)` 后调 `search()`，
等价于旧 `searchCount` 数被 `MAX_LOG` 截断的日志。

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
| 不同种子数 | 61 | **100** |
| 不同产出数 | 25 | **37** |
| 最长同结果连击 | 40 | **6** |
| `kind='none'` 次数 | 65 | 40 |
| `count` / `searchLog.length` / `searchSeq` | 60 / 60 / — | **100 / 60 / 100** |

修复前直方图（`none=65`；`x=N` 为出现 N 次）：

```text
none=65
talisman:67=3  treasure:21=3  treasure:26=3
talisman:5=2  talisman:68=2  talisman:71=2  treasure:19=2  treasure:60=2
talisman:1,11,12,6,64,70,8,9=1
treasure:18,20,25,27,32,33,43,57=1
```

修复后直方图：

```text
none=40
treasure:21=4
talisman:12,64,67,71=3  treasure:25,26=3
talisman:11,5,68=2  treasure:19,20,32,41,59,60=2
talisman:1,2,3,6,65,70,72,8,9=1
treasure:18,23,27,33,36,43,51,57,58,76,77=1
```

结论：种子不再冻结，产出分布铺开；日志仍只留 60 条（存档体积不变），计数器独立单调递增。

---

## 2. R17：SearchType 决定等级窗（已实装）

### 2.1 原作依据

`docs/04b2_招降斩首与战后结算.md:453-488` §5.3 [确认]：

```c
for (i = 0; i < 0x80; i++) {
  if (flags & 2 && element.+0x20 == 1) { w[i] = 0; continue; }   // ONLYONE 已获得
  switch (element.+0x1A) {                                       // SearchType
    case 1:
      if (g->+0x2E < lvl-4 || g->+0x2E > lvl+4) w[i] = 0;
      else { d = abs(g->+0x2E - lvl); w[i] = d ? Rate/d : Rate; }
      break;
    case 2:
      if (g->+0x2E < lvl-4) w[i] = 0;
      else if (g->+0x2E < lvl) w[i] = Rate/(lvl - g->+0x2E);
      else w[i] = Rate;
      break;
    default: w[i] = Rate;
  }
}
```

`g->+0x2E` 是执行搜索武将的等级（04c:208），`lvl` 是物品 `+0x36 Level`。
物品链 `0x427435/0x427701 → 0x426F2C(g,verbose) → 0x426D8C(c,g) → 0x408EE2(g,c)`（04b2:442-450），
`g` 是执行搜索的武将；网页 `doSearch` 没有选将 UI，因此等级只能从存档/上下文取。

### 2.2 修复前

`searchPools` 只按 `Rate` 分区，`Level` 从头到尾没被读（65_假绿守护.md #100 的原话）：

```js
const rate = num(it.Rate);
if (rate <= 0) continue;
...
```

`pickWeightedItem` 也只按 `Rate` 加权：

```js
const rows = list.filter((it) => num(it.Rate) > 0);
...
x -= num(it.Rate);
```

### 2.3 修法

1. 新增 `searchItemWeight(it, level)`（`city_model.js:1101-1118`），逐字对应 §5.3：

   ```js
   const rate = num(it?.Rate);
   if (!(rate > 0)) return 0;
   const lv = Math.trunc(num(level));
   if (!(lv > 0)) return rate;          // 等级未知：保持旧口径
   const need = Math.trunc(num(it?.Level));
   if (!(need > 0)) return rate;
   const group = Math.trunc(num(it?.SearchType));
   if (group === 1) {
     const d = Math.abs(lv - need);
     return d > 4 ? 0 : (d ? rate / d : rate);
   }
   if (group === 2) {
     if (lv < need - 4) return 0;
     return lv < need ? rate / (need - lv) : rate;
   }
   return rate;
   ```

2. `searchPools(items, taken = [], level = 0)` 新增第三参（`city_model.js:1137`），窗外不進池（`:1151`）：

   ```js
   if (lv > 0 && searchItemWeight(it, lv) <= 0) continue;
   ```

3. `pickWeightedItem(list, r, weightOf)` 支持权重函数（`city_model.js:1266-1279`）；
   `search()` 先算等级、再传入（`:777-778`、`:794`）：

   ```js
   const level = searchLevelOf(save, cityDef, ctx);
   const pools = searchPools(ctx?.items, ownedItemSeqs(save, ctx), level);
   ...
   const it = pickWeightedItem(pools[kind], rng(), (row) => searchItemWeight(row, level));
   ```

4. 新增 `searchLevelOf(save, cityDef, ctx)`（`city_model.js:255-266`），等级源次序：

   ```text
   ctx.searchLevel → ctx.level（city.html ?lv=） → save.generalLevel[太守] → 武将行 level
   ```

   都没有返回 0（等级未知）。

### 2.4 为什么不做成默认 20

- `levelOf()` 的默认 20 是给带兵/骑兵上限用的，不是搜索武将等级。
- 若默认 20：ST1 里 Level=1 的物品会被 ±4 窗全部剔掉，`guard_r17.test.ts` 的 800 抽 1:9 断言直接红；
  ST2 的 22 件 Level 全 ≥27，全部落在 `Level-4` 以下，池子清空。
- 若用 `BaseEXP` 兜底：代縣太守劉焉 `BaseEXP=200 → levelFromExp=2`，2 级永远搜不到 45 号（Level45），
  `city_rules.test.ts:240-272` 的 R18「400 次内搜到 45」也会红。
- 所以等级窗**只在显式等级存在时启用**；普通 city 页直接开局（campaign 未写过 `generalLevel`）时保持旧口径，
  这是为了不破坏既有存档与测试的保守选择，不是遗漏（见 §6 没做到）。

### 2.5 验证数字

| 调用 | 结果 |
|---|---|
| `searchLevelOf({generalLevel:{劉焉:45}}, 代縣, {generals:GENS})` | 45 |
| `searchLevelOf({}, 代縣, {generals:GENS})` | 0 |
| `ctx.level=30` | 30 |
| `searchPools(ITEMS, [], 45)` | talisman 22 / treasure 35，含 45 号 |
| `searchPools(ITEMS, [], 2)` | talisman 22 / treasure 14，不含 45 号 |
| `searchPools(ITEMS)`（旧口径） | talisman 22 / treasure 50 |

ST1 在 lv20 的权重：`seq24(L17)=66.67`、`seq25(L18)=100`、`seq26(L20)=200`、`seq27(L21)=200`、
`seq28(L23)=66.67`、`seq29(L24)=50`、`seq58(L20)=200`。
ST2 在 lv45：`seq30/31/32/33/36/40/41/43/60=200`；`seq34/35/37/38/39/42/44/45/46/47=20`；`seq61/62/63=10`。
这些与公式逐项一致。

---

## 3. AI 九项 ACT：分布实测（未改 `ai_model.js`）

### 3.1 方法

`AI.planMonth(save, sc.cities, {playerId: save.king, seed: (m+1)*7919, paths: sc.paths})`
→ `AI.executeMonth(world, actions)` → 回写 city 的 troops/money/owner/pop/major；5 剧本 ×12 月。
每势力每月默认 `maxPerForce=1`，所以选中条数 = 势力数 ×12。

### 3.2 选中层

| 剧本 | 玩家 | 选中条数 | KIND 分布 |
|---|---|---:|---|
| 1 | 公孫瓚 | 156 | `{attack:156}` |
| 2 | 公孫瓚 | 204 | `{attack:204}` |
| 3 | 袁紹 | 84 | `{attack:84}` |
| 4 | 曹操 | 84 | `{attack:84}` |
| 5 | 曹操 | 48 | `{attack:48}` |
| 合计 | — | **576** | `{attack:576}`，其余 8 个 KIND 全 0 |

### 3.3 候选层（month 1，`maxPerForce=99`，未取 top1）

| 剧本 | 势力数 | attack | develop | search |
|---|---:|---:|---:|---:|
| 1 | 13 | 49 | 11 | 11 |
| 2 | 17 | 58 | 16 | 16 |
| 3 | 7 | 48 | 19 | 19 |
| 4 | 7 | 24 | 12 | 12 |
| 5 | 4 | 20 | 17 | 17 |

候选层每势力都有内政选项，说明 develop/search 生成器不是死代码；`ctx.kinds=['develop','search']`
的白名单也能真的选出内政月（测试 14）。

### 3.4 判断

选中层 100% attack 是 **Rate 排序的设计后果，不是随机退化**：

- 攻 AI 城 `Rate=100`、攻玩家城 `Rate=200`（`ai_model.js:480-481` 一带）；
- `KIND_RATE` 的内政上限：DEVELOP 26..32、SEARCH 18..24、REINFORCE 24..28（`ai_model.js:1404-1411`）；
- `compareAction` 先比 Rate 降序（`ai_model.js:2077-2089`），内政永远低一档；
- `ai_act.test.ts:449` 还专门钉了「有邻敌时默认不开内政月」。

**没有改 `KIND_RATE` / `ACTION_COST`**，原因：

1. 要把 develop 顶上 100，必须把 `KIND_RATE` 改成 >100 或改 attack 的 100/200；前者会红
   `ai_act.test.ts:230`（移动 24..28）、`:348`（打 AI 50 输给攻 AI 100）、`:384-394`（徵兵 33..35）、
   `:414`（開墾 26..32）、`:436`（搜索 18..24）等 6 处既有断言；后者不在允许改的常量里。
2. `ACTION_COST` 只影响执行经济（金/粮/兵），不参与 Rate 排序，改了也不会改变选中分布。
3. 任务禁止改决策逻辑；`ctx.kinds` 已是官方可控口子，页面侧可按剧本/难度传白名单。

因此本条按「已确认单峰、受既有契约限制不改」记录，列入 §6「没做到」。

---

## 4. 37a 三条偏差的判断

### 4.1 R29 兵力档位

- 37a R29 原文是「编成 兵力档位（10/50/100/200 档，`+0x42` 上限内滑杆）」；
  用户任务里写的「士气档」应是转述误差，37a 该行讲的是**兵力**，不是士气。
- 实现：`deploy.html:324` 的 `SOLDIER_CAP = Math.min(GEN_LEVEL * 5, 100)`、`:397` 的档位 `[50,80,100]`，滑杆 1..100 并夹上限（`:392-393`、`:429`、`:436`）；
  `SOLDIER_CAP = min(GEN_LEVEL*5, 100)`，200 档不可能存在。
- 65_假绿守护.md #99 已经判过：37a 这行应改成 50/80/100、上限 100。
- **结论：实现对，37a 错。** 37a 的 200 档没有实现依据；`game/src/core/battle.ts:467`
  （cocos 副本 `game/cocos/assets/scripts/core/battle.ts:440`）的「fill 只有 10/50/100/200 四档」
  是战斗精灵切片注释，不是兵力预设。
- `project/31_还原清单.md` 已追加 47 行（R29 结论）与 47a 行（file:line 更正：web 源 `:467`、cocos 副本 `:440`）。

### 4.2 R17 SearchType 等级窗

- **真缺口**：修复前 `searchPools` 只按 Rate 分区，从未读 `Level`；65 #100 的判断成立。
- 已在 `city_model.js` 实装（§2）；未改 `.d.ts`、未改既有测试口径。
- 判断：**实装**，不是「不实装」。

### 4.3 R14 `Rate = 80/(Length+1)`

- 37a R14 写「移動武將：9 邻接，`Rate = 80/(Length+1)`（04c §3.2）」。
- 但 04c:135/375 的 `+0x38` 是「到目标距离」，`0x40C7E8` 的 `80/(距离+1)`；
  04d:134/145/261 把这条调用钉在 **ACT=8 佔領空城**：
  `0x40BE2F(8, srcCity, dstCity, 0, n, 0, 80/(dstCity->[+0x38]+1))`。
- 该式在 `ai_model.js:481` 与 `ai_model.js:1891-1892` 已经实现：
  `Math.floor(RATE.OCCUPY / (d + 1))`，`d` 用邻接跳数（因为 PATH Length 实测 37..260，
  `80/(260+1)=0`，文件头 `ai_model.js:30-34` 有说明）。
- 移動武將的 planner rate 是 `24 + 兵缺比例*4` 夹 24..28（`ai_model.js:675-695`），标 [推测]；
  04d:280/286 明说 PlanMoveGeneral 评分表/補金/移動武將规划器未逆完，不能拿一条错位的公式硬套。
- 用户任务第 5 条写「R14 `Rate=80/(Length+1)`（物品出现率）」是把 R14 与 R17 混在一起；
  物品出现率是 R17 的 Rate 权重，不是这条。
- **结论：R14 不改代码；报告判「不实装（R14 归属错误）」。** 已实现的佔領空城部分无需再改。

---

## 5. 测试与改坏验证

新增 `game/tests/webfix_r83.test.ts`，14 条：

1. 搜索计数器：100 抽 `searchSeq=100`、`searchLog=60`、种子 100 个；
2. 搜索分布：100 抽 ≥30 种、最长连击 ≤10；
3. 旧口径对照：`min(i,60)` 时 61 个种子、连击 40；
4. 老存档迁移：60 条日志 → seq 60 → 下一抽 61；
5. 金不足：不扣金、不动 seq；
6. 多城独立：代縣 5、襄平 3；
7. 存档往返：`searchSeq` 经 `writeSlot/getSnapshot` 原样回来；
8. `searchLevelOf` 优先级 / 未知 0 / 夹 1..99；
9. ST1 权重；
10. ST2 权重；
11. 池分区：已知 45 含 45、等级 2 不含、无等级 22/50；
12. `search()` 集成：只有 45 号时 lv2 抽不到、lv45 40 抽内抽到；
13. AI 候选层：5 剧本 month1 都有 attack/develop/search；
14. AI 白名单：真实剧本 `ctx.kinds=[develop,search]` 能选出内政月。

定向运行：`node --test tests/webfix_r83.test.ts tests/city_rules.test.ts tests/guard_r17.test.ts tests/guard_r19.test.ts`
→ **tests 43 / pass 43 / fail 0**（185ms）。

改坏→红→还原（备份 `city_model.r83.bak`，`Copy-Item` 还原；备份已删）：

| 轮 | 改坏 | 红掉的用例 | 还原后 |
|---|---|---|---|
| A | `searchCount` 改回只数 `searchLog` | 3 条：计数器、分布、老存档迁移 | 14 pass |
| B | 删掉 `bumpSearchSeq(save, city, count)` | 4 条：计数器、分布、迁移、存档往返 | 14 pass |
| C | `searchItemWeight` 在 rate 检查后直接 `return rate`（忽略 Level） | 4 条：ST1、ST2、池分区、search 集成 | 14 pass |

另有一次改坏把函数体重复导致语法错误，立即用备份还原并 `node --check` 通过；教训是改坏前先确认还原路径。

`node --check web/city_model.js` 通过。
`npm.cmd exec -- tsc --noEmit`（后台 job `pwsh-d264f1da9772433e`）：**exit 0**。

### 5.1 全量测试

baseline（改动前）：tests 717 / pass 717 / fail 0，duration 82.6s。

改动后（2026-11-25 05:36）：`node --test tests/*.test.ts` → **tests 773 / pass 773 / fail 0 / duration 74.3s**。
773 = 717 baseline + 56 条（本轮新增 14 条；其余 42 条是并行 Agent 同期新增的测试，全量一起跑，证明本改动没有弄红别人）。

中间有一次排除 `battle.test.ts` 的过滤全量，撞上并行 Agent 未收工的 `r50_r67.test.ts`「A 侧没有 士兵单位」
与 `src/core/syso_host.ts` 文件清单断言；等其收工后全量 773/0 通过。`battle.test.ts` 单跑 21/21、72s 也通过。

---

## 6. 没做到的 / 边界

1. **AI 分布仍是 100% attack**：候选层证明内政不是死代码，但要改选中分布必须动 `KIND_RATE`
   超 100，会红 6 条既有断言且违反「不改决策逻辑」；`ACTION_COST` 不参与排序。故未改 `ai_model.js`，
   只在 §3 留了前后分布与原因。
2. **cocos 侧同 bug 未修**：`game/cocos/assets/scripts/core/CityModel.ts` 有同一套 `searchLog` 计数逻辑，
   但任务边界禁止改 `game/cocos/**`，本轮只修 web 的 `city_model.js`。
3. **R14 移動武將 Rate 未实装**：04d 明说该规划器未逆完，37a 的公式归属 ACT=8；
   实装会引入无据数值，故判「不实装」。
4. **R17 的等级源在普通 city 页可能为 0**：没有选将 UI（禁改 `city.html`），
   只有 `?lv=` 或 campaign 写过 `save.generalLevel` 时才套窗；这是为兼容旧存档/旧测试的保守选择。

---

## 7. 文件与行号索引

- `game/web/city_model.js:148` `MAX_LOG: 60`
- `game/web/city_model.js:255-266` `searchLevelOf`
- `game/web/city_model.js:401-420` `ensureExtras` 的 `searchSeq` 迁移
- `game/web/city_model.js:706` 日志截断
- `game/web/city_model.js:768-810` `search`（`:773` count、`:774` seed、`:777` level、`:806` bump）
- `game/web/city_model.js:816-824` `searchCount`
- `game/web/city_model.js:827-834` `bumpSearchSeq`
- `game/web/city_model.js:1101-1118` `searchItemWeight`
- `game/web/city_model.js:1137-1165` `searchPools`（`:1151` 等级过滤）
- `game/web/city_model.js:1266-1279` `pickWeightedItem`
- `game/web/ai_model.js:481`、`1891-1892` 佔領空城 `80/(d+1)`（未改）
- `game/web/ai_model.js:675-695` 移動武將 24..28（未改）
- `game/web/ai_model.js:1404-1411` `KIND_RATE`（未改）
- `game/tests/webfix_r83.test.ts` 14 条
- `project/31_还原清单.md` 47 / 47a 行
