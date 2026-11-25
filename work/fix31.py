import pathlib
p = pathlib.Path(r'F:\sanguo\project\31_还原清单.md')
t = p.read_text(encoding='utf-8')
old = "| 13 | 战力基准 `150` 是推断值 | 原作 `unit+0x70` 初值未定位 |"
new = "| 13 | ~~战力基准 `150` 是推断值~~ | **已确认**：`0x43A3AD` / `0x43A3B7` 两条 `c705 … 96000000` 把 `unit+0x70` 硬写成 150；`0x442EFA`/`0x443498` 是 read-modify-write（`docs/04b5` Q1） |"
found = old in t
t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('replaced:', found)
