import pathlib
p = pathlib.Path(r'F:\sanguo\proto\test_core.js')
t = p.read_text(encoding='utf-8')
old = """  const before = w.sides.B.aliveCount;
  const r = C.cast(w, 'A', M_AOE, 40.5, 6.2);
  const killedNow = before - w.sides.B.aliveCount;"""
new = """  const cnt = () => w.units.filter(u => u.alive && u.side === 'B' && !u.isGeneral).length;
  const before = cnt();
  const r = C.cast(w, 'A', M_AOE, 40.5, 6.2);
  const killedNow = before - cnt();   // aliveCount 只在 step() 里重算，这里直接数"""
assert old in t
t = t.replace(old, new)

old2 = """  const before = w.sides.B.aliveCount;
  const r = C.cast(w, 'A', M_AOE, 5, 13);
  ok('空旷处 AoE 不误伤', r.ok && r.killed === 0 && w.sides.B.aliveCount === before);"""
new2 = """  const cnt = () => w.units.filter(u => u.alive && u.side === 'B' && !u.isGeneral).length;
  const before = cnt();
  const r = C.cast(w, 'A', M_AOE, 5, 13);
  ok('空旷处 AoE 不误伤', r.ok && r.killed === 0 && cnt() === before);"""
assert old2 in t
t = t.replace(old2, new2)
p.write_text(t, encoding='utf-8')
print('tests fixed')
