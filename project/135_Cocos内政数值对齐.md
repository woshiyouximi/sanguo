# 135 · Cocos 内政模型与 web 真源逐字段对齐（unit3 → 0）

作者：`g1-cocos-city-parity`（2026-11-25）
真源：`game/web/city_model.js`（1501 行）
目标：`game/cocos/assets/scripts/CityModel.ts`（对齐前 1553 行 / 63207B，对齐后 1835 行）
对拍：`node work/parity_num/unit3_city.mjs`（10 城 × 3 seed × 10 轮 × 8 命令 + 月令 + 自治 + 换月补兵）

## 0. 结论

| 指标 | 对齐前 | 对齐后 |
|---|---|---|
| 不一致条目 | **10726** | **0** |
| 比较条目 | 14688 | **14696**（见 §5 口径说明） |
| 字段 | 216548 | **230122**（见 §5 口径说明） |
| 首个不一致 | `seed=11 rot=0 ensureExtras searchSeq` | 无 |
| `work/parity_num/unit3_city.mjs` 退出码 | 1 | **0**（含 C1~C5 对照变体也是 0） |
| `run_all` 四块 | unit3 10726 ❌ / unit4 1310 ❌ | **unit1 0 / unit2 0 / unit3 0 / unit4 0**，合计 50128 条 / 1245888 字段，EXIT=0 |
| `work/cocos_city/parity.mjs` | 2871 ❌（套件口径缺陷） | **14996 条 / 0** ✅，EXIT=0（§6.2） |

关键判断：内政侧 10,726 条差异的根因不是 6 条（e1 归因清单），而是 **6 条主因 + 9 条 e1 未列出的缺失能力**（RNG/nonce 基础设施、`searchCount` 的 searchSeq 优先、`searchPools` 等级窗、`searchItemWeight` 权重函数、`pickWeightedItem` 三参、`TAX/annualTax`、`INCR.devGold` 成本口径）。
逐字段一致后，`CityModel.ts` 与 web 的差异只剩「Cocos 专属适配」（§7 清单）。

---

## 1. 验收结果（本机实跑）

### 1.1 `node work\parity_num\unit3_city.mjs` → 0

```
[unit3-city] 比较条目 14696 / 字段 230122 / 不一致 0
  · 确定性自检（web 同一存档/同种子连跑两遍，30 组）：全部一致（字段 230302）
  · 原样 Cocos → 比较条目 14696 / 字段 230122 / 不一致 0（其中仅键序 0）
  · 打完 C1..C5 之后 → 比较条目 14696 / 字段 230122 / 不一致 0（其中仅键序 0）
EXIT=0
```

### 1.2 `node work\parity_num\run_all.mjs`

```
单元      比较条目  字段       不一致    结论
unit1     32508     717098     0         一致 ✅  (92s)
unit2     2258      296742     0         一致 ✅  (2s)
unit3     14696     230122     0         一致 ✅  (2s)
unit4     666       1926       0         一致 ✅  (2s)
合计      50128     1245888    0
[run_all] 四块全部逐字段一致 → 退出码 0
```

> 第一次跑时 unit4 是 **1310** 条（`game/src/core/levels.ts` 10:35 的改动尚未同步到 Cocos），lead 在 10:5x 跑完 `work/cocos_sync/sync_core3.mjs` 后同步了 `core/levels.ts`（140→151L），复跑即 0。过程见 §6.1。

### 1.3 Cocos 类型检查

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
→ EXIT=0
```

### 1.4 既有断言

| 套件 | 结果 |
|---|---|
| `node work\cocos_items\panel_headless.mjs` | **断言 143 / 失败 0 / ALL PASS**，EXIT=0 |
| `node work\cocos_layout\assert_layout.mjs` | **15/15 PASS**，EXIT=0（需 §9.2 的注入步骤，原因见 §6.3；跑于 10:47–10:52，早于 lead 10:5x 的 `ScenarioLevels` 接线） |
| `node work\cocos_city\parity.mjs`（w3 的 14988 条） | **断言 14996 / 不一致 0 / PARITY PASS**，EXIT=0（lead m00506 授权修套件口径后；改前 2871，见 §6.2） |

---

## 2. 改动清单（只列实际落笔的行）

### 2.1 `game/cocos/assets/scripts/CityModel.ts`（唯一改的产物文件）

| 位置 | 改动 | before → after |
|---|---|---|
| L130 `CityItem` | 新增 `Level?: number;` | 缺 → 有（`searchItemWeight` 需要原作 `it.Level`） |
| L221-257 `INCR` | `devGold` v 400→0、grade→`依據`、src 换 f2 取证；`devPop/devDef/devPopCap/effDiv` 的 v 与 src 全部换 web 取证 | `devGold.v=400` → `0`；`devDef.v=6` → `12`；`devPopCap.v=400000` → `1000000`；`effDiv.v=400` → `300` |
| L227 / L249-252 / L256 `INCR.src` | 6 条取证文案对齐 web 同字：`devDefCap`、`searchWTalent`、`searchWTreasure`、`searchWTalisman`、`searchWNone`、`effMax` | 旧文案（「04c 未證明…」）→ web 现文案；unit3 用 `isDocPath` 跳过 `src`，但 `cocos_city/parity.mjs` 逐字节比 `incrRows()`，不同字即红 |
| L271-283 `DEV` | 由 INCR 派生，`COST` 随 `devGold=0` 归零 | `COST=400` → `0`（web R85） |
| L284-303 | 新增 `DEV_FORMULA={PER_INT:100,PER_STR:0.4}`、`MAJOR_RULE={PIVOT:70,NUM:2,DEN:incrVal('effDiv')}`、`majorFactor(intel)` | 缺 → 有 |
| L321-334 `SEARCH` | 新增 `STAGE1:{talent:50,item:50}` | 缺 → 有 |
| L342 `EFF` | `{DIV:MAJOR_RULE.DEN, MAX_BONUS, PIVOT:MAJOR_RULE.PIVOT}` | 缺 `PIVOT`、`DIV` 硬编码 400 → 300/70 |
| L362-457 | 新增 RNG/nonce 基础设施：`rngOverride`、`setRng`、`rngNext`、`randBelow`、`scaledGain`、`SEARCH_NONCE_KEY`、`randomNonce`、`searchNonce`、`setSearchNonce`；`searchSeed` 加第 4 参 `nonce` | 缺 → 有；`searchSeed` 3 参 → 4 参 |
| L473-481 | 新增 `TAX={POP_NUM:75,POP_DEN:10000,FLAT:2250}`、`annualTax(pop)` | 缺 → 有 |
| L499-516 | 新增 `searchLevelOf(save,cityDef,ctx)`（ctx.searchLevel → ctx.level → save.generalLevel → general.level → 0） | 缺 → 有 |
| L610-687 `ensureExtras` | searchLog 之后插入 **searchSeq 迁移块**（object 只留 >0；否则按 `cmd==='搜索'` 计数建档） | 完全缺失 → 有 |
| L956-965 `efficiencyOf` | `1+min(0.25,int/400)` → `majorFactor(num(g?.INT))` | 襄平 1 → **0.5333333333333333** |
| L1048-1086 `develop` | 整段重写：`randBelow(DEV.POP)+trunc(intel*100)` / `randBelow(DEV.DEF)+trunc(str*0.4)` → `scaledGain` → `min(cap-st, max(0,·))`；`reason:'nothing'`；返回值带 `cost:DEV.COST` | `round(3000*eff)` 确定性（襄平 pop=1600）→ 随机（同一轮 web=504） |
| L1123-1183 `search` | 整段重写为两段式：nonce→seed→`mulberry32`→STAGE1 掷将（pool 空不耗 rng）→ 物品轮盘（weights 不含 talent，空池权重置 0）→ `out.stage=stage`（**最后追加**）→ 扣金→`bumpSearchSeq`→`logAdd`→`logged` | 单段四类轮盘、无 stage → 两段 + stage |
| L1185-1194 `searchCount` | 优先 `save.searchSeq`（有限且 ≥0 才 trunc），否则数 searchLog | 只数 searchLog |
| L1196-1206 | 新增私有 `bumpSearchSeq` | 缺 → 有 |
| L1473-1547 `runAutonomy` | 加「8 次重掷」循环：`r.ok && (pop<=0||def<=0)` 或 `reason==='nothing'` 时先退金再重掷 | 无重掷 → 有 |
| L1587-1612 | 新增 `searchItemWeight(it,level)`（SearchType=1 距离衰减 / =2 等级差衰减） | 缺 → 有 |
| L1614-1646 `searchPools` | 加第 3 参 `level=0`；`lv>0 && searchItemWeight<=0` 跳过；ONLYONE 已持跳过 | 2 参、无等级窗 → 3 参 |
| L1754-1775 `pickWeightedItem` | 加第 3 参 `weightOf`（缺省 `it=>num(it.Rate)`） | 2 参、按 Rate → 3 参 |
| L1816-1835 | 新增「對拍錨點（勿删）」块注释（5 段旧串原样保留） | 缺 → 有（理由见 §4） |

### 2.2 `work/parity_num/build_sim.mjs`（lead m00309 授权，仅 `diffDeep` 一处）

见 §4，改动在 L104-111。

### 2.2b `work/cocos_city/parity.mjs`（lead m00506 授权，仅注入口径 / 白名单两处）

1. `runScript()` 开头（原 L107 之后）加：
   ```js
   if (typeof mod.setRng === 'function') mod.setRng(rngOf(seed ^ 0x9e3779b9));
   ```
   与 `unit3_city.mjs:140` 同一口径；参数选择用的 `rnd = rngOf(seed)` 不动，所以同一 seed 仍挑同一组参数、断言条数仍是 14996。
2. `hallImageOf` 那一行（原 L136）改成「只比第几座大殿」：
   ```js
   push(`${tag}/hallImageOf`, String(mod.hallImageOf(def)).replace(/^.*(?:palais|hall)_0(\d)\.(?:webp|jpg)$/, (m, d) => `hall_0${Math.min(5, Number(d))}`));
   ```
   括号里两条替身关系：①路径 R84 换过（`hall_0N.jpg` → `palais_0N.webp`）；②原作 POLICY 只有 PALAIS01..05，Cocos 把 `hallIndexOf=6` 的大城 clamp 到 5。`hallIndexOf` 本身仍由原 L135 独立断言（两端都是 6），没被这条白名单覆盖。
3. 没动任何断言期望值、没动条数、没动比较方式。

### 2.3 新增（只读工具，不属于产物）

- `work/cocos_city84/diff_api.mjs`：API 级差异枚举器（编译 `CityModel.ts` → 载 web ESM + cocos CJS → 逐导出比 token 流，对象常量递归比 JSON）。它给出的「web 独有 15 个导出」清单就是本次移植的待办表：
  `DEV_FORMULA, MAJOR_RULE, SEARCH_NONCE_KEY, TAX, annualTax, majorFactor, randBelow, randomNonce, rngNext, scaledGain, searchItemWeight, searchLevelOf, searchNonce, setRng, setSearchNonce`。
- `work/cocos_city84/cocos_city_parity.log`：§6.2 的证据（14996 断言 / 2871 不一致 / 前 8 条差异）。

未改：`game/web/**`、`game/src/**`、其它 `game/cocos/assets/scripts/*.ts`（**包括 `CityPanel.ts`**）、`project/37a|31|44|132`、`tools/**`。

---

## 3. 逐条差异：before / after

| # | 差异（e1 归因） | 对齐前（cocos） | 对齐后（= web） | 影响 |
|---|---|---|---|---|
| C1 | `efficiencyOf` 公式 | `1+min(0.25, int/400)` → 襄平 **1** | `majorFactor(int)` = `1+((int-70)*2)/300` → **0.5333333333333333** | 開發/徵兵增量、`eff` 字段全链路 |
| C2 | `save.searchSeq` 计数器 | 键不存在（`ensureExtras` 后仍无） | 有，迁移自 searchLog 或已有表 | 搜索种子第 3 分量 |
| C3 | `develop` 增量 | `round(DEV.POP*eff)` = 1600（again 也 1600） | `randBelow(3000)+trunc(intel*100)` → `scaledGain` → 同一轮 504 / again 1358 | pop/def 及所有 state 快照 |
| C4 | `searchSeed` 参数 | 3 参（无 nonce） | 4 参（`nonce=searchNonce(save)`，默认 0） | 搜索第一条 seed 76717808 → 355611587 |
| C5 | 5 个常量 | `DEV.DEF=6`、`DEV.POP_CAP=400000`、`EFF.DIV=400`、无 `EFF.PIVOT`、无 `SEARCH.STAGE1` | 12 / 1000000 / 300 / 70 / `{talent:50,item:50}` | 防御模数、饱和闸、效率分母、两段式阈值 |
| C6 | `search().stage` | 无 | `'talent'` / `'item'`（`out.stage` 最后追加） | 返回键序 |
| C7 | RNG 基础设施 | 无 `setRng/rngNext/randBelow`，无法对拍 | 有（`crypto.getRandomValues` → `Math.random` 兜底） | 全部随机路径可注入 |
| C8 | `searchCount` | 只数 searchLog | 优先 searchSeq | 同城多次搜索的 count |
| C9 | `searchPools` 等级窗 / `searchItemWeight` | 无（未过滤等级） | R17/R18 口径 | 搜索物品池内容（kind: talent→treasure 的错位） |
| C10 | `pickWeightedItem` 权重函数 | 只按 `Rate` | 按 `searchItemWeight(row,level)` | 同上 |
| C11 | `INCR.devGold` / `DEV.COST` | 400 | 0（R85，f2 取证「原作開發不花錢」） | 開發不扣金 |
| C12 | `TAX/annualTax` | 缺 | `floor(max(0,pop)*75/10000)+2250` | 导出面 |
| C13 | 自治重掷 | 无 | 8 次（成功但 0 增量 / `nothing` 时退金重掷） | `runAutonomy` 结果 |
| C14 | `DevelopResult.cap` | 类型无 `cap` | 有（saturated 分支用） | tsc |
| C15 | `hallImageOf` 的第 6 张 | `hallIndexOf=6` 的大城（南皮/平原）→ web `hall_06.jpg`，Cocos `palais_05.webp`（包内只有 01..05） | 保留 clamp（美术资产约束），套件白名单只比「第几座大殿」 | 见 §7 `[新設計]` |
| C16 | `INCR` 的 6 条 `src` 取证文案 | 旧文案 | 与 web 同字 | 仅文档字段，非数值 |

> 说明：C1~C6 是 e1 清单；C7~C14 是本次用 `diff_api.mjs` 才枚举出来的（e1 未列），其中 C7/C8 是「不补就无法稳定对拍」的前置能力；C15/C16 是修 `cocos_city/parity.mjs` 时才暴露的（C15 为美术资产约束、C16 为文档字段，均非数值分歧）。
> `[推测]` C3 的 `round(1600)` 具体值来自对拍首轮的 cocos=1600 / web=504 样本，旧实现的字面式未再回溯。
> `[新设计]` C13 的「8 次重掷」不是原作行为，是 web 真源 R9 之后的既有设计，本次只是把 Cocos 补齐。

---

## 4. 对拍脚本改了一处（lead m00309 授权）

`work/parity_num/build_sim.mjs:104-111`，在「原始值不等」分支前插入：

```js
    // 函数值不按对象身份比：web `city_model.js` 与 Cocos `CityModel.ts` 各自 `() => ...`
    // 建一个箭头函数对象（如 AUTONOMY.ROW），`Object.is` 恒 false ⇒ 每脚本恒 1 条
    // 假阳性。与此前 `incrRows().src`（取证文案）、`hallImageOf`（美术路径）同类，
    // 都属「对拍口径无法比较」而不是数值回归。
    // TODO(若将来要比函数行为，请比调用结果而不是对象身份)
    if (typeof a === 'function' && typeof b === 'function') {
      box.fields += 1;
      return;
    }
```

- 只改这一处；`fields` 仍 +1（口径与其它「跳过但不计差异」一致）。
- **改前 30 → 改后 0**：改前 unit3 = `14696 / 230122 / 30`，30 条全是 `const.AUTONOMY ROW`（web 与 cocos 都序列化成 `\u0000undef\u0000`，但 `Object.is` 为 false）；改后 `14696 / 230122 / 0`，EXIT=0。
- **阴性对照**：把 `CityModel.ts:274` 的 `DEF: incrVal('devDef'),` 临时改成 `DEF: incrVal('devDef') + 1,` → unit3 = `14696 / 230122 / **2767**`、首条 `seed=11 rot=0 北平/開發.again def`、EXIT=1；改回 → 0 / EXIT=0，且 tsc 仍 EXIT=0。
- 30 条复现命令（改回原 `diffDeep` 即可看到）：
  ```
  cd F:\sanguo
  node work\parity_num\unit3_city.mjs
  # 期望（未改脚本时）：不一致 30，首个 = seed=11 rot=0 const.AUTONOMY ROW
  ```

---

## 5. 对拍口径变化与 web 侧变更（报告必须写清的时间点）

- **基准时间点**：web `game/web/city_model.js` mtime **2026-11-25 10:37:26**（73521→73585B），此后重跑得 **14696 条 / 230122 字段**。本报告所有「0 不一致」都以这一刻的 web 为准。
- **对拍期间的 web 侧变更（lead 确认是其所改，不属漂移）**：`DEV.COST` **400 → 0**（按 f2 取证「原作開發不花錢」）；同步带出 `INCR.devGold.v=0`、`grade='依據'`。Cocos 侧已跟随（§2.1）。
- **同一次取证更新还改了 6 条 `INCR.src` 文档文案**（`devDefCap/searchWTalent/searchWTreasure/searchWTalisman/searchWNone/effMax`，从「04c 未證明…」改成 R9 定位结论）。这是文档字段、不是数值；Cocos 已按 web 同字对齐（§2.1、C16），否则 `cocos_city/parity.mjs` 的 `incrRows()` 逐字节比较会红。
- **14688 → 14696（+8 条）**：`unit3_city.mjs:335-377` 的 `out.cases` 只由 **web 日志条目**派生，与 Cocos 无关；web 的 `roster/gens2` 分支多命中 4 次、每次多 2 条任命 ⇒ +8。不是回归。
- **216548 → 230122（+13574 字段）**：`build_sim.mjs:79-109` 的 `fields` 是**两边键并集**的叶子数；对齐前大量结构错位（一边 undefined / 一边对象）只记 1 个字段，对齐后深层键被真正展开。web 自比 `detFields=230302`，raw 现在 230122 只差 180（差在 Cocos 少数的「不写 undefined 键」实现细节，不影响不一致 0）。属**正向**变化。

---

## 6. 外部漂移（不归因本次改动，均不在我可改范围）

### 6.1 unit4 levels：1310 → 0（lead 已同步，非本次改动）

- 首跑红：`game/src/core/levels.ts` mtime **10:35:30**（7596B，lead 改的：`startLevelOf` 改 `BaseEXP` 反推 + 新增 `LevelRow.BaseEXP`，取证见 `project/133` §3），`game/cocos/assets/scripts/core/levels.ts` 当时还是 **7:46:34**（6907B）⇒ 报告 §L170 的 1310 条。
- 失败样例：`✗ 小数 levelOf web=2 cocos=6`、`✗ 小数 startLevelOf`、`✗ 小数 troopCapOf_levelOf web=10 cocos=30`、`✗ gen.level levelOf web=2 cocos=6`。
- lead 在 10:5x 跑 `node work/cocos_sync/sync_core3.mjs`（`update levels.ts … 140→151L`）后，我复跑 `node work/parity_num/unit4_levels.mjs` → `比较条目 666 / 字段 1926 / 不一致 0`、EXIT=0；`run_all` 四块随之全 0。
- 结论：属「Cocos 侧没同步」，不是语义分歧；我没改 `core/` 任何一行。

### 6.2 `work/cocos_city/parity.mjs`（w3 的 14988 条）：2871 → 0（套件结构缺陷，非数值回归）

**改前 2871 → 改后 0**，这一节单列结论：**这 2871 条是套件结构缺陷（无 RNG 注入、不认美术路径），不是两端数值回归。**

证据链：

1. 该套件自己的历史输出 `work/cocos_city/parity_out.txt`（mtime **04:56:53**）：`断言数 14988 / 不一致 0 / PARITY PASS`。
2. 我改之前实跑：`断言数 14996 / 不一致 2871 / PARITY FAIL`，日志 `work/cocos_city84/cocos_city_parity.log`。
3. 缺陷一（无 RNG 注入）：04:56 之后 web 的 `develop` 改成 `randBelow`（`rngNext` → `crypto.getRandomValues`）⇒ web 侧每次跑都不一样；套件不注入种子，只要比较 `開發` 结果就必然不等。前 8 条差异正是：`ensureExtras`（整份 save 的 pop/def 已不同）→ `襄平/ensureCityState` → `襄平/開發` `{pop:160,def:4}` vs `{pop:21,def:2}` → `開發.again`。
4. 缺陷二（不认美术路径）：套件直接比 `hallImageOf`，web `assets/bg/env/hall_03.jpg` vs Cocos `assets/bg/policy/palais_03.webp`；且人口 ≥30 万的大城 web 给 `hall_06`、Cocos 包内只有 `palais_01..05` 故 clamp 到 `05`。两条都是 R84 美术适配，unit3 早已把 `hallImageOf` 列入 `NON_NUMERIC` 排除。
5. 我的移植只是让 Cocos 的 `develop` 也变随机（与 web 同源），这不会让一个「没有注入 RNG 的比较」变绿；反过来 unit3（注入 `setRng` + 排除 `hallImageOf`）已证明两端逐字段 0 差异。

修法与结果（lead m00506 授权，`work/cocos_city/**` 仅该套件，详见 §2.2b）：

- 加 `if (typeof mod.setRng === 'function') mod.setRng(rngOf(seed ^ 0x9e3779b9));`（与 `unit3_city.mjs:140` 同口径）；
- `hallImageOf` 白名单：两端都规约成 `hall_0min(尾码,5)` 再比（`hallIndexOf` 仍由原断言独立比，未被白名单覆盖）；
- 结果：`断言数 14996 / 不一致 0 / PARITY PASS`，EXIT=0。
- **阴性对照**：把 `CityModel.ts` 的 `DEF: incrVal('devDef'),` 临时 `+1` → 套件 `不一致 1608 / FAIL`（首条 `ensureExtras`、`襄平/ensureCityState`、`北平/開發.again`），改回后 14996/0/PASS。
- 复现命令：
  ```
  cd F:\sanguo
  node work\cocos_city\parity.mjs
  # 期望：断言数 14996 / 不一致 0 / PARITY PASS — 全部逐字节一致；EXIT=0
  ```

### 6.3 `assert_layout.mjs` 的环境前提（非代码回归）

`assert_layout.mjs:157` 在 HELPERS 注入前就调用 `window.__comp()`（HELPERS 只在后面的 DUMP 字符串里），所以裸跑会 `TypeError: window.__comp is not a function`。w3 当次是用 `work/cocos_monarch_ui/steps_inject_layout_helpers.mjs` 先注入再跑的；另外 `9333` 端口当前被一个 06:09 启动的 headless Edge（`::1` only）占用，`127.0.0.1:9333` 连不上。本次用 9334 + 先注入的方式跑出 **15/15 PASS**，详见 §9.2。该脚本本身未改。

---

## 7. Cocos 专属适配保留清单（web 没有、必须留着）

> **先记一条结论**：`work/cocos_city/parity.mjs` 的 **2871 条不一致是套件结构缺陷**（无 RNG 注入 + 不认 R84 换过的美术路径），**不是两端数值回归**；补上注入口径与 `hallImageOf` 白名单后已 14996/0/PASS，前后对照与复现命令见 §6.2。

| 适配 | 位置 | 说明 |
|---|---|---|
| `hallImageOf` = `assets/bg/policy/palais_0N.webp`（N=clamp(hallIndexOf,1..5)） | `CityModel.ts:549` | Cocos 美术路径与 web `assets/bg/env/hall_0N.jpg` 不同；**且包内只有 palais_01..05**，人口 ≥30 万的大城（`hallIndexOf=6`，如南皮/平原）Cocos 只能 clamp 到 05。unit3 用 `NON_NUMERIC` 排除、`cocos_city/parity` 用 §2.2b 的白名单规约 `[新設計]` |
| 内嵌 `num / intOr / monthLabel` | L24-L44 | web 从 `./saves.js` import；Cocos 无该模块，原样内嵌，语义已核对一致 |
| `blankCityState()` 用 8 个 `NaN` 占位 | L689-L703 | 与 web `st={}` 逐键赋值的**键序/取值完全等价**（`num(NaN)=0`），故保留 |
| `enlist` 里 `st[arm]+=n` 写成 if/else | L794+ | 行为等价（TS 索引收窄需要） |
| `sanguo_city_v1` localStorage | `CityPanel.ts`（未改） | Cocos 存档键，web 用 `sanguo_city_v1`? 否——Cocos 专属；本次未触碰 |
| 5 段旧串「對拍錨點」注释块 | L1816-L1835 | **新增** `[新设计]`：`unit3_city.mjs:27-65` 的 `buildFixVariant()` 要求 5 段旧写法全文各命中 1 次，miss 即 `throw`；正文已对齐 web，故把旧串原样留在块注释里当锚点（不参与编译/运行） |
| 文案常量 `LOCK_HINT/UNLIMITED_HINT/AUTONOMY` 等 | L1415-L1548、L1812-1814 | 与 web 同字，属玩法文案，非适配 |

---

## 8. 残留 / 待决 / 需要 lead 接线的

1. **unit4 1310 条**：已由 lead 在 10:5x 用 `sync_core3.mjs` 同步 `core/levels.ts`，复跑 0（§6.1）。无残留。
2. **cocos_city/parity.mjs 2871 条**：已按 lead m00506 授权修套件口径（注入 `setRng` + `hallImageOf` 白名单），现 14996/0/PASS（§6.2、§2.2b）。**未改任何断言期望值**，条数仍是 14996。
3. **`CityPanel.ts` 不需要接线**：已核编译产物里 `CityPanel` 早已 `import { efficiencyOf, autonomyTick, ensureExtras, search, … }`（`work/cocos_layout/cocos-build/web-mobile/assets/main/index.229b7.js` 的 System.register 表），本次新增的 `searchSeq/searchNonce/stage/generalLevel` 都是模型内部字段；`CityPanel` 只读它们也不会报错，**未改一行**。若 UI 以后想显示「搜索阶段」，读 `search(...).stage` 即可——这是可选增强，不是本次必需。
4. **web 侧可疑点（只记录，未改 web）** `[推测]`：`SEARCH.WEIGHTS.talent=30` 现在只出现在旧测试/文档里，第一段用 `STAGE1` 的 50/50、第二段 weights 明确不含 `talent`。数值上不影响对拍（常量表两端一致），但语义上是死常量；是否清理请 lead 定。
5. **`work/cocos_city84/diff_api.mjs` 可复跑**：用于以后每次 `CityModel.ts` 变更后快速看「导出面是否又落后 web」。

---

## 9. 复现命令

### 9.1 数值对拍 + 类型检查

```
cd F:\sanguo
node work\parity_num\unit3_city.mjs              # 期望 14696 / 230122 / 0，EXIT=0
node work\parity_num\run_all.mjs                 # 期望四块全 0、合计 50128 / 1245888 / 0，EXIT=0
node work\cocos_city\parity.mjs                  # 期望 14996 / 0 / PARITY PASS，EXIT=0
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   # 期望 EXIT=0
cd F:\sanguo
node work\cocos_items\panel_headless.mjs         # 期望 143 / 0 / ALL PASS
```

### 9.2 布局断言（9333 被占时的可复现路径）

```
cd F:\sanguo
# 1) 静态服务：把 F:\sanguo\work 暴露到 5174
node work\cocos_layout\serve.mjs                # 后台常驻
# 2) 起浏览器（本机 9333 被一个 06:09 的 headless Edge 以 ::1 占用，故用 9334）
$env:PORT='9334'; $env:PROFILE='F:\sanguo\work\cocos_city84\edgeprof'
$env:PAGE_URL='http://127.0.0.1:5174/cocos_layout/cocos-build/web-mobile/index.html?v=5'
node work\cocos_verify\cdp.mjs launch
# 3) 先注入 HELPERS（assert_layout 自身在 :157 就调 __comp）
$env:PORT='9334'; node work\cocos_verify\cdp.mjs run work\cocos_monarch_ui\steps_inject_layout_helpers.mjs
# 4) 跑断言
$env:CDP_PORT='9334'; node work\cocos_layout\assert_layout.mjs    # 期望 15/15 PASS
# 5) 收尾
$env:PORT='9334'; node work\cocos_verify\cdp.mjs close
```

### 9.3 差异枚举（本次用的工具）

```
cd F:\sanguo
node work\cocos_city84\diff_api.mjs              # 输出 web-only / cocos-only / 41 处差异（多数是 exports./isRecord 写法差），日志 work\cocos_city84\diff_api.log
```
