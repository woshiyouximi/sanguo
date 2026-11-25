# 待派工：items（物品与装备）

> 用途：子代理并发上限 8，本轮满了。等任一 agent 结束，直接把本文件内容当 prompt 发出去。

## 现状（已确认，别重挖）
- 物品表 `F:\sanguo\data\items.json`（77 件），字段 = 原作 `SANGO.INI [ITEM]`：
  `Sequence/Name/Attrib/TYPE/WeaponType/WeaponObject/SearchType/Sort/Level/Sprite/Rate/STR/INT/MaxHP/MaxMP/Force/Battle/Skill/Speed/HP/MP/Spirit/Loyal/Tire/Description`
- `Force` 是 `1<<k` 兵种位掩码（兵符）；`Sprite` 形如 `JEWEL\BOOK01`。
- 图标：`F:\sanguo\export\png\SHAPE\JEWEL\*.SHP.png`（57 张）。
- 三页已存在：`game/web/{campaign,deploy,index}.html`；服务 `node F:\sanguo\game\web\serve.mjs 5177`。

## 只准新建
`game/web/items.html`、`game/web/items_model.js`、`game/web/items_selftest.mjs`、`project/14_物品与装备.md`、`game/web/assets/items/*`（复制图标）。
**唯一允许的既有文件改动**：`campaign.html` 底部加一行 `<a href="./items.html">物品</a>`。

## 功能
- 77 件列表（分组 + 图标 + 等级 + Description）；详情卡显示全部字段与加成；
- 装备四槽 `weapon|horse|book|amulet`（由 `WeaponType/WeaponObject` 决定）；
- 兵符（`Force` 非 0）只影响可用兵种、不加属性；
- `localStorage['sanguo_items_v1'] = {equip:{武将:{槽:seq}}, bag:[seq…]}`，初始给 12 件；
- `items_selftest.mjs` ≥10 条断言，`node` 跑出 `N 过 / M 败`。

## 验收
自检全过；Edge 无头两张截图（列表态 / 装备后）到 `work\items_1.png`、`items_2.png`；console 无错；文档 ≤110 行。
