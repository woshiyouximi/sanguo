import pathlib
p = pathlib.Path(r'F:\sanguo\project\31_还原清单.md')
t = p.read_text(encoding='utf-8')

# 1) 把一、二两节的 🔧 改成当前真实状态（带证据）
repl = {
 "| 1 | 敌方主将 | 一律\"守將\"，`STR = min(100, 50+DEFENSE/8)` | 该城守将（`cities[].MAJOR` + 城内武将），取真实 STR/INT | 🔧 gaps-foes |":
 "| 1 | 敌方主将 | 一律\"守將\"，`STR = min(100, 50+DEFENSE/8)` | 该城守将（`cities[].MAJOR` + 城内武将），取真实 STR/INT | ✅ `garrison.json`（1011 条）+ `battleSetup()`；截图 `work/deploy_home4.png` |",
 "| 2 | 我方主将 | 从所有我方城按武+智取前 12 | 出兵城的武将，太守优先 | 🔧 gaps-wises |":
 "| 2 | 我方主将 | 从所有我方城按武+智取前 12 | 出兵城的武将，太守优先 | ✅ `?from=` 出发城 + `officersOf()`；截图 `work/deploy_home4.png` |",
 "| 3 | 兵种可选 | 13 种全开 | 该将 `UseForce` 白名单（+ 兵符学会的补充） | 🔧 gaps-wises / gaps-core |":
 "| 3 | 兵种可选 | 13 种全开 | 该将 `UseForce` 白名单（+ 兵符学会的补充） | ✅ `unlock.ts` + 页面白名单，未學置灰；`work/deploy_all.png` |",
 "| 4 | 阵形可选 | 9 种全开 | 该将 `BattleArray`（+ 阵法书学会的补充） | 🔧 同上 |":
 "| 4 | 阵形可选 | 9 种全开 | 该将 `BattleArray`（+ 阵法书学会的补充） | ✅ 同上；截图 `work/deploy_all.png` |",
 "| 5 | 兵力 | 只有 50 / 80 / 100 三档 | 上限 `min(等级×5, 100)`，可在 1..上限 之间选 | 🔧 gaps-wises |":
 "| 5 | 兵力 | 只有 50 / 80 / 100 三档 | 上限 `min(等级×5, 100)`，可在 1..上限 之间选 | ✅ 滑杆 1..上限；`work/deploy_slider.png` |",
 "| 6 | 技力上限 | `60 + INT/2` 代理 | 武将 `BaseMP`（關羽 43 / 張飛 38 / 諸葛亮 45） | 🔧 gaps-wises |":
 "| 6 | 技力上限 | `60 + INT/2` 代理 | 武将 `BaseMP`（關羽 43 / 張飛 38 / 諸葛亮 45） | ✅ `main.js` 覆盖 mp/mpMax；關羽=43 |",
 "| 7 | 武将技 | 按 `ATTRIB`/攻击力猜成 3 类（治疗/单体/范围） | 执行 `MAGIC.SO` 原始字节码 | 🔧 vm-port |":
 "| 7 | 武将技 | 按 `ATTRIB`/攻击力猜成 3 类（治疗/单体/范围） | 执行 `MAGIC.SO` 原始字节码 | ✅ 90/90 opcode、109/110 技能可跑；`cast()` 已接 `runSkill()` |",
 "| 8 | 军师技 | 完全没有 | 67 个，按 `Execute/ATTRIB/Rate` 生效 | 🔧 gaps-wises |":
 "| 8 | 军师技 | 完全没有 | 67 个 | 🟡 67 条已分类，**25 条立即生效**，24 条显式未实作，18 条待 `battle.ts` 消费点（vm-frame 在做） |",
 "| 9 | 大地图 | 点城直接开战 | 部队沿 116 条路走、可拦截、抵达才打 | 🔧 gaps-march |":
 "| 9 | 大地图 | 点城直接开战 | 部队沿 116 条路走、可拦截、抵达才打 | ✅ `march.ts` + `campaign.html`；截图 `work/march_1.png`、`march_2.png` |",
 "| 10 | 内政 | 3 键（徵兵/開發/推進一月） | 8 命令（開發/徵兵/搜索/移動/任命/物品/情報/出征） | 🔧 gaps-city |":
 "| 10 | 内政 | 3 键 | 8 命令 | ✅ `city.html` 八命令 + 大地图「內政」入口；截图 `work/city_2.png` |",
 "| 11 | 地形 | 只用来选 BGM | 12×13 地形×兵种表加算进战力 | 🔧 gaps-core |":
 "| 11 | 地形 | 只用来选 BGM | 12×13 表加算进战力 | ✅ `terrainBonus()` 进五段加算，156 格逐格校验 |",
 "| 12 | 招降 | 结算显示\"招降 1 人\"，将不进城 | 招到的将进入该城武将池 | 🔧 gaps-core |":
 "| 12 | 招降 | 结算显示但将不进城 | 招到的将进入该城武将池 | ✅ `roster.ts` + `applyCapturesToRoster()`（已测 4 条） |",
 "| 13 | 战力基准 | `150`（推断值） | 原作 `unit+0x70` 初始化值未定位 | ⚠️ 待定位 |":
 "| 13 | 战力基准 | `150`（推断值） | 原作 `unit+0x70` 初始化值未定位 | ⚠️ 仍待反汇编定位（唯一保留的 ⚠️） |",
}
hit = 0
for a, b in repl.items():
    if a in t:
        t = t.replace(a, b); hit += 1
p.write_text(t, encoding='utf-8')
print('rows updated', hit, '/', len(repl))
