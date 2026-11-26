# F-05 修复报告：装备加成不生效（装刀武力不涨）

- 日期：2026-11-26
- 范围：`game/src/core/equip_bonus.ts`（新建）+ `game/cocos/assets/scripts/{GeneralBook,GameState,ItemsPanel}.ts` + `game/tests/equip_bonus.test.ts`（新建）
- 纪律：未用 git；未改 `CampaignRoot.ts` / `DeployRoot.ts` / `BattleRoot.ts` / `game/web/**` / `work/cocos_sync/sync_core3.mjs`。

## 0. 结论（一句话）

算法只写一份进 `core/equip_bonus.ts`（与 web `items_model.js` / `campaign.html` 同公式），名册（`GeneralBook.buildBook`）与出征（`GameState.startBattle`）都改成调它：给关羽装兵器/坐骑/兵書后，名册武力/智力/生命/技力与出征 `genStr/genInt` 都按“基础值 + 四槽合计”变高；没装备 / 没开过物品页时逐字回到原值（不改变任何旧数值）。

## 1. 改点清单

| # | 文件 | 改动 |
|---|------|------|
| 1 | `game/src/core/equip_bonus.ts`（新建，525 行，零 import 纯函数） | 四槽/五属性加成、名字表（物品存档 Sequence → 名字、战役存档名字 → 名字）、有效值；常量 `EQUIP_SLOTS`、`EQUIP_SLOT_NAMES`、`EQUIP_SAVE_KEY='sanguo_items_v1'`、`EQUIP_ITEMS_CACHE_KEY='sanguo_equip_items_v1'`。 |
| 2 | `game/cocos/assets/scripts/GeneralBook.ts` | `:55` 新增 `import { sys } from 'cc'`（读 localStorage）；`:391-407` `effectiveRowStats()`、`:416` `readEquipItemRows()`、`:425` `readEquipBagSave()`；`:484-489` `mergeRow` 用有效值替换原本的 `str/int/hp/mp`；`:537` `buildBook` 只读一次快照/存档整批下发。`equipLine` 的兵/馬/書 静态字段未动。 |
| 3 | `game/cocos/assets/scripts/GameState.ts` | `:19-27` 引入 core；`:1008-1016` 读快照/物品存档；`:1033-1044` `applyEquipBonus(launch)`；`:1051-1062` `startBattle` 在构造 launch 后调用它覆写 `genStr/genInt`。**`from 'cc'` 仍是第 10 行那唯一一条**（`work/cocos_officers85/build.mjs` 的 `ccFixed===1` 契约）。 |
| 4 | `game/cocos/assets/scripts/ItemsPanel.ts` | `:67` 引入 `EQUIP_ITEMS_CACHE_KEY`；`:404-409` `writeEquipItemsCache(items)`；`:935` 在 `open()` 里 `registerItems(items)` 之后写快照——物品页是唯一持有整张 `data/items` 表的地方。 |
| 5 | `game/cocos/assets/scripts/core/equip_bonus.ts`（镜像，sync 产物） | `node work\cocos_sync\sync_core3.mjs` 生成，21278 B / 525 行，与 web 源逐字节一致（该文件零 import，`stripImportExtensions` 无改动）。 |
| 6 | `game/cocos/assets/scripts/core/equip_bonus.ts.meta`（新建） | 照 `sango_rng.ts.meta` 的 171 字节格式；uuid `d6621a4c-64f3-4317-9de1-fd86bc2b6faf`。 |
| 7 | `game/tests/equip_bonus.test.ts`（新建，351 行，9 条测试） | 见 §4。 |

辅助（非交付代码）：`work/equip_bonus/verify_wiring.mjs` 为一次性接缝验证脚本（17 条断言），见 §5。

## 2. 公式来源（照抄 web，未发明）

真源两处：

1. `game/web/items_model.js`（纯逻辑 ES module）
   - `num(v)`：`'' / null / undefined → 0`，其余 `Number()` 非有限也回 0；
   - `slotOf(item)`：`JEWEL_WEAPON→weapon`、`JEWEL_HORSE→horse`、`JEWEL_THING→book`、`JEWEL_MISC 且 Loyal>0→amulet`，其余 `null`；
   - `bonusOf(item)`：兵符（`JEWEL_MISC` 且有 `Force`）早退全 0；否则每属性 `num(item[k])`；
   - `normalizeEquips/equipItem/unequipSlot`：只认四槽 + `Sequence` 存在 + `slotOf` 匹配；
   - `equipNames(equips)`：装备 Sequence 表 → 只含“真有装备的槽”的名字表；
   - `bonusOfNames/applyEquipNames`：名字表 → 装备 → 加成 / 有效值。
2. `game/web/campaign.html` 的 `[[EQUIP_CORE]]` 段（`:1700-1773`）
   - `combatStatsOf(general, bonus)`：`str = max(0, trunc(num(g.str)) + trunc(num(b.STR)))`、`int` 同（**下夹 0、不上夹**）；`equipNamesOf(name)` = 新格式 `save.equip[名][四槽名]` 优先、回落旧三表 `weapon/horse/thing`（`book` 回落 `thing`、`amulet` 只认新格式）；
   - `game/web/saves.js:equipSlotsOf/equipOf` 是同一口径的另一半。

Cocos core 的对应实现（`game/src/core/equip_bonus.ts`）：

- `numOf` = web `num`；`isTalismanOf`/`itemSlotOf` = web `isTalisman`/`slotOf`；
- `bonusOfItem(item) → EquipStats{str,int,hp,mp,speed}`：`STR→str`、`INT→int`、`MaxHP→hp`、`MaxMP→mp`、`Speed→speed`，兵符全 0；
- `equipBonusOf(source, items)`：四槽逐槽 `slotOf` 校验后累加（不夹）；
- `effectiveStatsOf(general, equip, items)`：`max(0, trunc(base)+trunc(bonus))`，无装备 = 原值 + 0；
- `equipNamesFromBag(itemsSave, name, items)`：Cocos 物品存档 `{equip:{將名:{槽:Sequence}},bag}` → 名字表；坏档/无该将记录/物品表缺失 → `null`（**不能用“解不开”冒充“没装”**）；
- `equipNamesOfSave(save, name)`：与 web `equipNamesOf` 同口径（新格式优先 + 旧三表回落）；
- `equipNamesForGeneral(...)`：物品存档有该将记录就以它为准，否则回落战役存档名字表。

名字口径的两个来源，是因为 web 的装备真源是 `sanguo_items_v1`（Sequence），而战役存档 `save.equip` 是名字镜像。Cocos 侧 `save.equip` 本来没有任何写入者（`ItemsPanel` 只写 `sanguo_items_v1`），所以两条都接：物品存档优先、战役存档兜底（兼容 web 老存档/未来写穿）。

## 3. 数据通道（为什么名册/出征能同步拿到物品表）

`startBattle()` 是同步函数，`GeneralBook.buildBook()` 是纯模型（面板 `open()` 不给它 items 参数，且 `GeneralBookPanel.ts` / `CampaignRoot.ts` 不在可改清单）；`DataLoader.loadGameData()` 只有 Promise、没有同步 peek。方案：

- `ItemsPanel.open()`（唯一持有整张 `data/items` 的入口，也是唯一能改装备的地方）把物品表写进 localStorage `sanguo_equip_items_v1`（77 行静态表，约 35KB）；
- `GeneralBook.buildBook` / `GameState.startBattle` 各自读“快照 + `sanguo_items_v1`” → core 算名字/加成；每份消费点只做 ~15 行 IO helper（键常量从 core 引入，不写第二份字面量）；
- 失败全降级：没快照 / localStorage 抛错 / 坏 JSON / 没开过物品页 / 没该将记录 → 加成 0，数值与改前完全一致。

**没有采用的方案与理由**（防止后来者重走）：

1. 在消费者里用 `assetManager.getBundle('res')?.get('data/items', JsonAsset)` 同步读：`work/cocos_officers85/build.mjs` 的 `_cc.js` shim 只导出 `sys/director/store`、并强制全库只有 1 处 `from 'cc'`（在 GameState.ts），新增 `assetManager/JsonAsset` 会让构建检查失败、`parity.mjs` 直接 ESM 链接崩；`work/cocos_book` 的 mock `Bundle` 也没有 `.get()`，headless 不可验。
2. `GameState` import `GeneralBook`/`DataLoader`：前者依赖链里有 `from 'cc'` 的模块 → `ccFixed=2`；后者无同步接口。
3. `GeneralBook` import `GameState`：违反 `work/cocos_book/tsconfig.sim.json` 注释里的 harness 契约（“不 import GameState / CampaignRoot / ItemsPanel”）。
4. 把加成结果写回存档（bonus map）：派生状态入库、要动 `CampaignSave` schema/normalize，且与 web“物品存档是真源、战役存档是镜像”的口径冲突。
5. 新增一支 Cocos 脚本模块共用读取器：本次允许改动清单里只有“新 core 文件”，不能新增 Cocos 脚本。

## 4. 测试：`game/tests/equip_bonus.test.ts`（9 条，全绿）

`node --test tests/equip_bonus.test.ts` → **9 pass / 0 fail**。与 web 对拍用的是真数据 `game/data/items.json`（77 件）+ 真 `game/web/items_model.js`、`game/web/saves.js` + 从 `campaign.html` 抽出的 `[[EQUIP_CORE]]`（`new Function` 还原 `combatStatsOf`，与 `webfix_r86.test.ts` 同手法）。

| # | 覆盖点 |
|---|--------|
| ① | 无装备 = 原值（空表 / null / 未知物品名 / 未知 Sequence / 数据表键形状） |
| ② | 单件 +3：物品对象 / 名字 / Sequence 三种吃法都 +STR，且只加武力 |
| ③ | 四槽叠加：与 web `bonusOfNames` 同值、amulet 五属性为 0、逐槽加=总和、`MaxHP→hp`/`MaxMP→mp` |
| ④ | 上限/负数：999+30=1029 不上夹、负加成后下夹 0、`numOf` 边界、兵符 slot=null 且加 0 |
| ⑤ | 与 web 逐件逐槽对拍：77 件 `bonusOfItem` vs web `bonusOf`、`itemSlotOf`/`isTalismanOf`、7 组四槽表 vs `bonusOfNames`、4 组基础值 × 7 组装备的有效值 vs `applyEquip`+`combatStatsOf` |
| ⑥ | 装备了才生效：bag→名字→加成；关羽涨/吕布不涨；错槽丢弃；兵符丢弃；空表覆盖旧存档；无物品表回 `null` |
| ⑦ | 存档名字表回落：`save.equip` 优先、旧三表兜底、`book←thing`、`''/---/—` 算没装 |
| ⑧ | JSON 解析容错：快照/物品存档坏值降级，完整管线（JSON→表→名字→有效值） |
| ⑨ | 接缝源码断言：`ItemsPanel.open` 真写快照（在 `registerItems` 之后）、`GeneralBook` 真调 `effectiveRowStats/effectiveStatsOf`、`GameState.startBattle` 真调 `applyEquipBonus` 且**全文件仍只有一条 `from 'cc'` import**、cocos core 镜像与 web 源逐字节一致 |

全量回归：`cd game && node --test "tests/*.test.ts"` → **tests 1874 / pass 1873 / fail 0 / skipped 0 / todo 1**。

## 5. 校验记录（2026-11-26）

| 项 | 命令（工作目录） | 结果 |
|----|------------------|------|
| 核心同步 | `node work\cocos_sync\sync_core3.mjs`（F:\sanguo） | `create equip_bonus.ts 0→21031B`；Babel 陷阱静态检查 0 处；KEEP_PATCHES 全 OK；再跑一次 25/25 一致（仅报告文件刷新） |
| TS 全量 | `cd game; node node_modules\typescript\bin\tsc --noEmit` | **exit 0** |
| TS Cocos | `cd game; node node_modules\typescript\bin\tsc -p cocos\tsconfig.check.json` | **exit 0** |
| 全量测试 | `cd game; node --test "tests/*.test.ts"` | 1874 条，fail 0 |
| UTF-8 | `node work\enc\scan_utf8.mjs` | `0 BAD`（4 个 WARN 均为仓库既有 allowlist 外文件，与本轮无关） |
| 名册 node 断言 | `node work\cocos_book\model_assert.mjs`（先 `tsc -p work\cocos_book\tsconfig.sim.json` 重建 `_sim`） | 277/277 通过（无装备冷启动 = 原值） |
| officers85 构建 | `node work\cocos_officers85\build.mjs` | `'cc' → _cc.js: 1 处`（ccFixed===1 ✓）、文件 30 个、exit 0 |
| officers85 对拍 | `node work\cocos_officers85\parity.mjs` | `PARITY OK`：523 条目 / 2615 字段不一致 0 |
| 接缝验证 | `node work\equip_bonus\verify_wiring.mjs` | 17/17 断言通过（见下） |

`verify_wiring.mjs` 用两套真 harness 产物（`_sim` 的 mock `cc` + officers85 的 `_cc.js` 内存 store）在 node 里证明：

- `GeneralBook.buildBook`：关羽 武力 80→**110**（兵器 STR 30）、智力 70→**90**（兵書 INT 20）、生命 900→**925**（MaxHP 25）、技力 100→**120**（MaxMP 20）；吕布不动；坏快照回落原值；
- `GameState.startBattle`：`genStr 80→110`、`genInt 70→90`；`bstr` 不被波及；其它 loadout 字段原样；`genStr/genInt` 原本是 `undefined` 时保持 `undefined`（`BattleRoot` 的 80/60 回退语义不变）。

## 6. 遗留 / 已知限制

1. **名册的“兵/馬/書”行仍是 `generals.json` 的静态字段**（`GeneralBook.equipLine` 未改，超出本次范围）：装备名只在物品页可见；名册的武力/智力/生命/技力已是有效值。
2. **物品表快照依赖“至少打开过一次物品页”**：从未打开过的存档，名册/出征数值 = 改前原值。这与 web 一致（web 也是 `items.html` 的 `sanguo_items_v1` 为真源、campaign 加载时 `syncEquipFromBag()` 才灌名字），且打开一次物品页即全量生效（快照跨会话来）。
3. **速度（Speed）**：core 会算进 `EquipStats.speed`，但名册没有速度栏、`BattleRoot` 的战斗将也只有 `str/int/level`，所以目前只计算不使用。
4. **生命/技力上限**：进了名册展示；战斗单位没有 hp/mp 字段（`BattleRoot` 只读 `genStr/genInt/genLevel`），core 已备好，后续战斗系统接字段时直接用 `effectiveStatsOf`。
5. **物品表若变更**：已装备的旧 `Sequence` 在新表里解不开会被丢弃（web `normalizeEquips` 同行为）；快照在每次打开物品页时覆写。
6. **未做真机/编辑器截图验证**（本环境无 Creator 设备）：以「真 harness 产物 + node 断言 + 双 tsc + 源码接缝断言」替代；建议在编辑器里再走一遍「物品页装备 → 名册数值涨 → 出征伤害变高」。
7. `ItemsPanel.open()` 的 `items` 来自 `CampaignRoot` 的 `data.items`（`GameData`）；若未来面板改成增量传表，快照会截断——已用「每次 open 全量覆写」+ 源码断言钉住。
