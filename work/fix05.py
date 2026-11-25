import pathlib
p = pathlib.Path(r'F:\sanguo\project\05_里程碑与任务拆解.md')
t = p.read_text(encoding='utf-8')
subs = [
 ('> 23 周 / 5~6 人 / 6 个质量门。', '> 23 周 / **8 人**（美术 4.5）/ 6 个质量门。'),
 ('| M4-3 | 战场单位全量替换：15 造型 ×2 阵营 + 13 兵种 ×2 阵营 | 6 | 美术 | 序列帧 | 100 单位同屏帧率达标 |',
  '| M4-3 | 战场单位全量替换：**13 兵种 × 双视角 = 26 组（620 帧）** + 主将 8 套 skin（104 部件）+ 马 16 组 | 12 | 美术 | 序列帧 | 100 单位同屏帧率达标；背/正朝向一眼可辨 |'),
 ('| M1-5 | **竖屏表现层**', '| M1-5 | **竖屏表现层**'),
]
for a,b in subs:
    if a not in t: print('MISS', a[:40])
    t = t.replace(a,b)
p.write_text(t, encoding='utf-8')
print('done')
