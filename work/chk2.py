import pathlib
p = pathlib.Path(r'F:\sanguo\project\31_还原清单.md')
t = p.read_text(encoding='utf-8')
for a,b in [
 ("| 3 | 兵种可选 | 13 种全开 | 该将 `UseForce` 白名单（+ 兵符学会的补充） | 🔧 gaps-wises / gaps-core |",
  "| 3 | 兵种可选 | 13 种全开 | 该将 `UseForce` 白名单（+ 兵符学会的补充的补充） | ✅ 白名单生效，未學置灰 |"),
 ("| 4 | 阵形可选 | 9 种全开 | 该将 `BattleArray`（+ 阵法书学会的补充） | 🔧 同上 |",
  "| 4 | 阵形可选 | 9 种全开 | 该将 `BattleArray` | ✅ 白名单生效 |"),
 ("| 11 | 地形 | 只用来选 BGM | 12×13 地形×兵种表加算进战力 | 🔧 gaps-core |",
  "| 11 | 地形 | 只用来选 BGM | 12×13 地形×兵种表加算进战力 | ✅ 已加算，156 格校验通过 |"),
 ("| 12 | 招降 | 结算显示\"招降 1 人\"，将不进城 | 招到的将进入该城武将池，可再出征 | 🔧 gaps-core |",
  "| 12 | 招降 | 结算显示但将不进城 | 招到的将进入该城武将池 | ✅ `roster.ts`（4 条测试） |"),
]:
    if a in t: t = t.replace(a,b)
# 去掉我上一步写坏的重复“的补充”
t = t.replace("UseForce` 白名单（+ 兵符学会的补充的补充）", "UseForce` 白名单（+ 兵符学会的补充）")
p.write_text(t, encoding='utf-8')
print('done')
