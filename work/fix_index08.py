import pathlib
# 00 doc map
p0 = pathlib.Path(r'F:\sanguo\project\00_立项书.md')
t = p0.read_text(encoding='utf-8')
a = "| `07_云GPU提速与快速验证方案.md` | **云环境怎么搭、V0 验证包、断点续跑、10 天冲刺** | 制作人/美术/主程 |"
b = a + "\n| `08_数据迁移与对拍.md` | **10 个 INI → 13 个 JSON、14 项对拍、字段口径** | 前端/策划 |"
if a not in t: print('MISS 00 07 row')
t = t.replace(a, b)
p0.write_text(t, encoding='utf-8')

# README entry
pr = pathlib.Path(r'F:\sanguo\project\README.md')
r = pr.read_text(encoding='utf-8')
a2 = "| 想立刻看到东西 | [`07_云GPU提速与快速验证方案.md`](07_云GPU提速与快速验证方案.md) ｜ [`../cloud/README.md`](../cloud/README.md) |"
b2 = "| 想跑数据 / 查字段 | [`08_数据迁移与对拍.md`](08_数据迁移与对拍.md) ｜ [`../data/meta.json`](../data/meta.json) |\n" + a2
if a2 not in r: print('MISS README 07 row')
r = r.replace(a2, b2)
pr.write_text(r, encoding='utf-8')

# 05 M0-4 status
p5 = pathlib.Path(r'F:\sanguo\project\05_里程碑与任务拆解.md')
t5 = p5.read_text(encoding='utf-8')
a3 = "| M0-4 | **数据管线**：`import_legacy.py` 把 10 个 INI 1:1 转 JSON | 5 | 前端+策划 | `data/*.json` | **逐字段对拍**：60 城 / 400 将 / 110 技 / 67 军师技 / 77 物品 / 12 地形 / 116 路径 / 5 剧本，字段名与 INI 一致 |"
b3 = "| M0-4 | **数据管线**：`import_legacy.py` 把 10 个 INI 1:1 转 JSON | 5 | 前端+策划 | `data/*.json` ✅ **已完成** | **14 项对拍全过**（10 条数 + 2 字段 + 2 矩阵反对称），详见 `08_数据迁移与对拍.md` |"
if a3 not in t5: print('MISS 05 M0-4 row')
t5 = t5.replace(a3, b3)
p5.write_text(t5, encoding='utf-8')
print('indexes ok')
