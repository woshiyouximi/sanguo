# 112 Cocos 物品数据：数据面补齐 + 「共 1 件」根因

任务：Cocos 物品页显示 `共 1 件 · 背包 12 件`，要与 web 版等价（77 件 / 可裝備 55 / 8 页）。
负责文件：`ItemsModel.ts`、`ItemsPanel.ts`、`bundles\res\data\**`、`work\cocos_items\**`、本文档。

## 0. 结论速览

1. **不是数据缺失**。`items.json`(35485 B) / `things.json`(615835 B) / `things_define.json`(1914 B) 早在
   `game\cocos\assets\bundles\res\data\` 里，且与 `game\data\` 的 web 源**逐字节相同**（sha256 见 §1），
   `.meta` 齐全，构建产物里也真实打进去了。**本次没有新增/修改任何数据文件**。
2. **真正根因**：Creator 的 Babel 把 `ItemsModel.allItems()` 里那句 `[...REGISTRY.values()]`
   降级成 `[].concat(m.values())`；`Array.prototype.concat` 只摊平数组、不摊平 Map iterator，
   于是 `allItems()` 回传 **长度 1 的 `[MapIterator]`**。面板遂显示「共 1 件」、品名「—」、
   分组兜底成「寶物」；而 `itemOf(seq)` 走 Map.get 仍然正常，所以「背包 12 件」看起来是对的。
   这正好是任务书禁用 `[...set]` 所指的同一类 Babel 事故。
3. 修复后：页头 `共 77 件 · 可裝備 55 · 背包 12 件 · 已裝備 0/4`、8 页、83 条目；
   `panel_headless.mjs` 143 断言 0 失败；`parity.mjs` 1969 断言 0 失败；`tsc --noEmit` EXIT=0。
4. 构建产物级取证（**未跑 CocosCreator**，只在内存里给旧产物打补丁）同样得到 77/55/8，
   截图 `work\cocos_items\out\items_panel_fixed.png`。构建归 lead，重新构建后修复才会上线。

## 1. 数据来源与字节数

| web 源 | 字节 | sha256 | bundle 目标 | 关系 | `.meta` uuid |
| --- | --- | --- | --- | --- | --- |
| `game\data\items.json` | 35485 | `c8049a22357761bce7ab17847420f47b745724790ae669631700183604169145` | `game\cocos\assets\bundles\res\data\items.json` | 逐字节相同 | `9830dbc4-2e44-4a96-896a-cc41c7bcb5f0` |
| `game\data\things.json` | 615835 | `d2f38c8675e5de4e892ec3b6744720fcabdb6c11b44c95c7f0ae55f8b345876c` | `game\cocos\assets\bundles\res\data\things.json` | 逐字节相同 | `41028dfb-ac68-413e-a00c-85505d8c0295` |
| `game\data\things_define.json` | 1914 | `3ee48de735dfbc2d873500dec63af9fcaba85305d45f1a1cb257c22c35133d56` | `game\cocos\assets\bundles\res\data\things_define.json` | 逐字节相同 | `dc04f568-9de2-4608-99aa-5acbaa3475b1` |

- 三份数据文件的落盘时间都是 2026-11-24 18:06，`.meta` 各 179 B；`things.json` **未裁剪字段**
  （已存在且构建已包含，裁剪只会引入数值风险，收益为零）。
- `items.json`：77 条，字段 `Sequence,Name,Attrib,TYPE,WeaponType,WeaponObject,SearchType,Sort,Level,Sprite,Rate,STR,INT,MaxHP,MaxMP,Force,Battle,Skill,Speed,HP,MP,Spirit,Loyal,Tire,Description`。
- 分组：兵器 34 / 坐騎 8 / 兵書 8 / 寶物 5 / 兵符 13 / 陣法 9；`isEquippable` = 55。
- bundle `res\data\` 现有：`fonts 1457`、`formations 316013`、`garrison 87547`、`generals 356831`、
  `items 35485`、`magics 39278`、`meta 1723`、`sango_system 332`、`scenarios 316948`、`terrains 2542`、
  `things 615835`、`things_define 1914`、`troops 2182`、`wises 8732`（外加 `magic_so.bin` 261008、
  `magic_so.symbols.json` 59761），每个 json 都有 179 B 的 `.meta`。
- 文件名集合核对：`game\data\*.json` 与 `bundles\res\data\*.json` **完全一致**（`Compare-Object` 无差集）。
- 读取路径（无需改动，已核实）：`DataLoader.ts` `RES_BUNDLE='res'` →
  `bundle.load('data/'+name, JsonAsset)`；`CORE_DATA_FILES` 含 `items`，`ALL_DATA_FILES` 另含
  `things`/`things_define`。物品页只用 `items.json`，things* 属审计表，已在 bundle 内备用。

## 2. `.meta` 的处理方式

三份 `.meta` **原本就存在**，本次一字节未动，也没有手写新增。格式与 bundle 内其它 json 完全一致：

```json
{"ver":"2.0.1","importer":"json","imported":true,"uuid":"<固定 uuid>","files":[".json"],"subMetas":{},"userData":{}}
```

- 字段含义：`ver` 导入器版本、`importer:"json"`、`imported:true`、`uuid` 资源标识、`files:[".json"]`、
  `subMetas:{}`、`userData:{}`。与 `fonts`/`generals`/`meta`/`terrains` 等 13 个 json 的 meta 形状相同。
- uuid 都是**固定值**（上表列出），不是每次导入现生成：固定值避免场景/预制体引用在重建后失效。
  若以后真的新增数据文件，照抄这个 179 B 形状 + 一个固定 UUIDv4 即可。
- 构建侧已验证：`game\cocos-build\wechatgame\assets\res\config.e1757.json` 含 `data/items`、
  `data/things`、`data/things_define` 等路径；导入产物
  `game\cocos-build\wechatgame\assets\res\import\98\9830dbc4-2e44-4a96-896a-cc41c7bcb5f0.c5493.json`
  里是完整的 `cc.JsonAsset`，`json` 即 77 条物品数组。

## 3. 根因与改动（file:line）

### 3.1 根因证据链

- 现象截图 `work\cocos_verify5\city_panel_direct.png`（2026-11-25 07:30，旧构建）：
  `共 1 件 · 可裝備 0 · 背包 12 件 · 已裝備 0/4`、`寶 物 1 件 · 已擁有 0`、唯一行 `— [使用品]`。
- 运行时取证（本机 headless Edge + CDP，07:55 构建，`work\cocos_items\cdp.mjs` +
  `steps_items.mjs`）：`comp.data.itemsLen = 77`（数据好），但
  `panel.debug() = {opened:true, pages:1, entries:2, bag:12, selected:null}`，
  标签里是 `共 1 件 …`、`寶 物 1 件`、`—　[使用品]`、`第 1/1 頁`。
  → 数据在，**只有 `allItems()` 坏了**；`itemOf()` 正常，所以背包仍是 12。
- 构建产物原文（`game\cocos-build\web-mobile\assets\main\index.82486.js`，offset 267972）：

```js
System.register("chunks:///_virtual/ItemsModel.ts", …, e({allItems:function(){return[].concat(m.values())},applyEquip:…
```

`[].concat(MapIterator)` → `[MapIterator]`，长度 1；元素没有 `.Name`/`.TYPE`，
于是品名 `—`、`groupOf` 兜底 `amulet` → 出现「寶物 1 件」。

### 3.2 改动

| 文件:行 | 改动 | 为什么 |
| --- | --- | --- |
| `game\cocos\assets\scripts\ItemsModel.ts:233-238` | `allItems()` 改为 `return Array.from(REGISTRY.values());`（原 `[...REGISTRY.values()]`），并写明 Babel 事故 | 根因修复；`Array.from` 对 iterator 语义正确，Babel 不会把它降成 `[].concat` |
| `game\cocos\assets\scripts\ItemsPanel.ts:812-818` | `persist()` 里 `[...this.bag]` → `Array.from(this.bag)` | 同一 Babel 事故的第二个受害者：`[].concat(Set)` 会把**整个 Set 当一个元素**塞进 `save.bag`（JSON 再写成 `{}`），一关面板背包就丢 |
| `game\cocos\assets\scripts\ItemsPanel.ts:1007-1020` | `placePage()`：先 `const pageEntries: ListEntry[] = this.pages[this.page] ?? [];` 再 `for (const entry of pageEntries)` | 原写法把 `??` 逻辑式放在 for-of 头，正是任务书禁用的 Creator Babel 崩法 |
| `game\cocos\assets\scripts\ItemsPanel.ts:190`、`:601` | `PanelDebug` 增 `pageSizes: number[]`，`debug()` 回 `this.pages.map(p => p.length)` | 让 headless 能逐页断言「8 页每页都有内容」，只影响调试快照，不影响 UI/逻辑 |

逻辑语义一行未改：`parity.mjs` 1969 断言仍 0 失败，`panel_headless.mjs` 原有 91 条断言仍全过。

### 3.3 为什么原有的两套测试抓不到

`parity.mjs` 与 `panel_headless.mjs` 都用**普通 tsc** 编 `_sim`，原生引擎里 `[...map.values()]`
本来就是对的；坏只坏在 Creator 的 Babel 降级。因此新增了静态守卫（§6）。

## 4. 字段名对拍（`game\web\items_model.js` ↔ `ItemsModel.ts`）

逐行读过 web 版 252 行：27 个导出（`SLOTS`/`SLOT_NAMES`/`STAT_KEYS`/`STAT_NAMES`/`GROUP_ORDER`/
`GROUP_LABELS`/`num`/`bitsOf`/`typeOf`/`isTalisman`/`isFormBook`/`slotOf`/`isEquippable`/`groupOf`/
`emptyBonus`/`bonusOf`/`registerItems`/`itemOf`/`allItems`/`normalizeEquips`/`equipItem`/`unequipSlot`/
`equippedSlot`/`totalBonus`/`applyEquip`/`runtimeGeneral`/`bonusText`）**同名同义**；
`WeaponObject`/`WeaponType`/`SearchType`/`Sort`/`Level`/`Sprite`/`Rate`/`Skill`/`Description`
两端都存在。**没有字段名差异**，所以没有加任何回退分支——加了反而会偏离 web 语义、破坏对拍。

## 5. 验收数字

### 5.1 `panel_headless.mjs`（mock `cc`，跑真实编译产物）

- **143 断言，0 失败，ALL PASS**（原 91 条 + 本次新增第 13 段 52 条）。
- 页头（开面板即断言）：`共 77 件 · 可裝備 55 · 背包 12 件 · 已裝備 0/4`；
  解锁后另一条：`共 77 件 · 可裝備 55 · 背包 77 件 · 已裝備 1/4`。
- 8 页逐页（每页「物品行 + 组头」，行合计 77、条目合计 83）：
  `第 1 頁 11 行 + 1 組頭；第 2 頁 11 行；第 3 頁 11 行；第 4 頁 10 行 + 2 組頭；
   第 5 頁 11 行 + 1 組頭；第 6 頁 11 行 + 1 組頭；第 7 頁 11 行 + 1 組頭；第 8 頁 1 行`。
- 加成表：选中 `#14 直劍` → 10 行逐项等于 `ItemsModel.bonusOf()`（`武力 +1`，其余 `—`），
  至少一项非 `—`；另外段里 `applyEquip` 让武力 99→100。
- 模型层 equip/unequip（每槽 5 条断言，4 槽全过）：`equipItem` 落槽 → `equippedSlot` 认槽 →
  `applyEquip` 至少一项属性变化 → `unequipSlot` 清槽；同槽装第二件会取代第一件且只留一个 key；
  兵符 / 陣法書 `slotOf = null`、`equipItem` 原样返回、兵符 `bonusOf` 全 0（不加属性）。
- 原有 12 段交互（页签、选中、裝備/卸下、翻页 0→1→2→1、切武将、全部解锁 12→77、槽位点击、
  存档、关闭、重开）全部保持通过。

### 5.2 `parity.mjs`

- **1969 断言，0 失败，ALL PASS**；`items.json` sha256 `c8049a22357761bc…`；
  groups `{"weapon":34,"horse":8,"book":8,"amulet":5,"talisman":13,"formation":9}`；两端各 27 导出。

### 5.3 `tsc`

```powershell
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit   # EXIT=0
```

`work\cocos_items\tsconfig.sim.json` 的 `_sim` 重建也 EXIT=0（注意 tsc 在
`game\node_modules\typescript\bin\tsc`，不是仓库根 `node_modules`）。

### 5.4 构建产物级（不改 `game\cocos-build`，内存补丁）

- 做法：`work\cocos_items\serve_fixed.mjs` 在 127.0.0.1:5187 端出 `game\cocos-build\web-mobile`，
  **只在响应内存里**把 `return[].concat(m.values())` → `return Array.from(m.values())`
  （另一处 `[].concat(this.bag)` → `Array.from(this.bag)`），磁盘产物零改动。
- 修复前（原生构建）：`共 1 件 · 可裝備 0`，`pages=1 entries=2 bag=12`。
- 修复后（同一份产物、只改这一处）：
  `header = "共 77 件 · 可裝備 55 · 背包 12 件 · 已裝備 0/4"`、`pageText = "第 1/8 頁"`、
  `pages=8`、`entries=83`、`hits=37`、`selected=14`、首屏 11 行；
  截图 `work\cocos_items\out\items_panel_fixed.png`（366922 B，视觉为 11 行兵器 + 右侧加成表）。
- 踩坑记录：构建里是 `return[].concat(…)`（`return` 与 `[` 之间**没有空格**），首次补丁只换
  `[].concat(…)` 拼出了 `returnArray.from(…)`，页面报
  `ReferenceError: returnArray is not defined at allItems`——已修正为连 `return` 一起换。
  这个坑也说明：**线上要等 lead 重新构建**，源码修复才生效。

## 6. 新增 / 改动文件清单

| 文件 | 类型 | 说明 |
| --- | --- | --- |
| `game\cocos\assets\scripts\ItemsModel.ts` | 改 | `allItems()` 用 `Array.from`（§3.2） |
| `game\cocos\assets\scripts\ItemsPanel.ts` | 改 | `persist()` 用 `Array.from`；`placePage()` 拆 for-of 头；`PanelDebug.pageSizes` |
| `work\cocos_items\babel_guard.mjs` | 新 | 静态守卫：扫这两个文件，禁止 `[...x]` 与「逻辑式 for-of 头」，退出码非 0 即失败（自测能抓 `[...set]`、`[...map.values()]`、`for (const v of a ?? [])`） |
| `work\cocos_items\cdp.mjs` | 新 | 零依赖 CDP 取证器：随机端口 + 独立 headless Edge profile，跑 steps 模块、截图、自动关浏览器 |
| `work\cocos_items\steps_items.mjs` | 新 | 旧构建（5173）取证：拿 `comp.data` 形状 + `panel.debug()` + 全部 Label |
| `work\cocos_items\serve_fixed.mjs` | 新 | 内存补丁静态服务器（只读构建产物，不写盘） |
| `work\cocos_items\steps_items_fixed.mjs` | 新 | 补丁构建取证：页头 / 页码 / 分组 / debug / 截图 |
| `work\cocos_items\steps_timing2.mjs` | 新（诊断） | 轮询等 Campaign 组件后连开面板采样，抓出了 `returnArray` 这个补丁事故 |
| `work\cocos_items\panel_headless.mjs` | 改 | 新增第 13 段「数据面」52 条断言（逐页条目 / 加成表 / equip-unequip 可用性） |
| `work\cocos_items\out\items_panel_runtime.png` | 产物 | 修复前运行时截图（共 1 件） |
| `work\cocos_items\out\items_panel_fixed.png` | 产物 | 修复后构建产物截图（共 77 件 · 第 1/8 頁） |
| `work\cocos_items\out\panel.log` / `parity.log` / `cdp_fixed.log` | 产物 | 三段验收日志 |

未改动（守约束）：`CampaignRoot.ts` / `GameState.ts` / `CityPanel.ts` / `AiRunner.ts` /
`MonarchModel.ts` / `Portrait.ts` / `core\**` / `game\web\**` / `game\tests\**` /
`project\37a|31|44`，以及任何数据文件。

## 7. 没做到 / 边界 / 交给 lead

1. **没有跑 CocosCreator、没有跑 `tools\build_wechat.ps1`**（任务书禁止）。所以
   `game\cocos-build` 里仍是旧代码；重新构建后请用下面这条验收：
   ```powershell
   Select-String -Path F:\sanguo\game\cocos-build\web-mobile\assets\main\index.*.js -Pattern '\[\]\.concat\(m\.values\(\)\)'
   # 期望：无匹配；同时 ItemsModel.allItems 里出现 Array.from(m.values())
   ```
   真机/微信小游戏、`dist\wechat-*` 打包均未验证（构建归 lead）。
2. **同仓还有同类 Babel 隐患**（不在我可改的文件内，报给 lead）：
   - `game\cocos\assets\scripts\AudioBus.ts:197` `return [...seen];`（`seen` 是 Set → 会变成 `[Set]`）
   - `game\cocos\assets\scripts\AiModel.ts:1336` `[...new Set([...], ...)]`（第一个 spread 是 Set）
   - 其余 `[...]`（`GameState.ts:632`、`CityPanel`→`garrison.ts` 等）多为数组 copy，安全。
3. 物品页 UI 的「裝備/卸下」早已接线并有 12 段交互断言；本次只补了**模型层可用性**断言
   （任务书要求「UI 是否接线不作要求」）。
4. `things.json` 未裁剪：已存在、构建已包含，裁剪无收益且会引入数值风险。

## 8. 复现命令

```powershell
# 1) 类型检查（硬约束）
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit    # EXIT=0

# 2) 重建 _sim 并跑模型对拍
cd F:\sanguo\work\cocos_items
node ..\..\game\node_modules\typescript\bin\tsc -p tsconfig.sim.json        # EXIT=0
node parity.mjs            # 1969 断言 0 失败 ALL PASS

# 3) 面板无头验收（143 断言 0 失败）
node panel_headless.mjs

# 4) Babel 降级守卫（退出码 0 = 干净）
node babel_guard.mjs

# 5) 构建产物级取证（可选，会起 5187 静态服务 + headless Edge）
node serve_fixed.mjs 5187
$env:PAGE_URL='http://127.0.0.1:5187/index.html'
node cdp.mjs run steps_items_fixed.mjs
# 期望：header = 共 77 件 · 可裝備 55 · 背包 12 件 · 已裝備 0/4，pageText = 第 1/8 頁，pages=8
```
