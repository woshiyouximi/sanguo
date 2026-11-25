import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = """  // 阶段 1：移动
  for (const u of world.units) {
    if (!u.alive) continue;"""
new = """  // 阶段 1：移动（主将不前进——原作主将压后阵，不是冲锋单位；
  // 否则两军主将会同时走向中线，谁先到谁先挨打，镜像局变成 100% 一侧胜）
  for (const u of world.units) {
    if (!u.alive || u.isGeneral) continue;"""
assert old in t
t = t.replace(old, new)
# 分离力也别推主将
old2 = """    if (!u.alive) continue;
    const k = `${Math.floor(u.x / 2)},${Math.floor(u.y / 2)}`;"""
new2 = """    if (!u.alive || u.isGeneral) continue;
    const k = `${Math.floor(u.x / 2)},${Math.floor(u.y / 2)}`;"""
assert old2 in t
t = t.replace(old2, new2)
p.write_text(t, encoding='utf-8')
print('generals hold position')
