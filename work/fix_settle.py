import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = "  const base = b.aliveCount * 6 + enemyLevel * (mode === 1 ? 51 : 34);"
new = ("  // 战功分按\"击杀数\"算，不能用 b.aliveCount（结算时它已经是 0，会把 100 击杀算成 0 分）。\n"
       "  // docs/04b §6.6 的原式还有\"骑兵×12\"项；本版单位没有兵种归属，统一按步兵 ×6 计。\n"
       "  const base = kills * 6 + enemyLevel * (mode === 1 ? 51 : 34);")
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('settle: score uses kills')
