import pathlib, re
p = pathlib.Path(r'F:\sanguo\project\31_还原清单.md')
lines = p.read_text(encoding='utf-8').splitlines()
out = []
for ln in lines:
    if ln.startswith('| 13 | 战力基准'):
        out.append('| 13 | 战力基准 | **150（已确认）** | `0x43A3AD` / `0x43A3B7` 两条 `c705 … 96000000` 把 `unit+0x70` 硬写成 150；`0x442EFA`/`0x443498` 是 read-modify-write。证据见 `docs/04b5` Q1 | ✅ 已确认 |')
    else:
        out.append(ln)
p.write_text("\n".join(out) + "\n", encoding='utf-8')
print('ok')
