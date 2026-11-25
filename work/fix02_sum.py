import pathlib, re
p = pathlib.Path(r'F:\sanguo\project\02_战斗重构设计.md')
t = p.read_text(encoding='utf-8')
t = t.replace('| **GPU / 资源小计** | **69.1** | — |', '| **GPU / 资源小计** | **68.1** | — |')
t = t.replace('| **合计** | **207**（上限 220） |', '| **合计** | **206**（上限 220） |')
p.write_text(t, encoding='utf-8')
# verify sums
rows = re.findall(r'^\| ([^|]+) \| \*\*([0-9.]+)\*\* \|', t, re.M)
print(rows)
