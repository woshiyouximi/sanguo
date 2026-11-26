import io

p = r'F:\sanguo\game\tests\strategy.test.ts'
s = io.open(p, encoding='utf-8').read()
start = s.find("test('R37 恢復體力 每 60 tick")
assert start > 0, 'legacy test not found'
end = s.find('\n});', start) + 4
new = """test('R37 恢復體力：原作定額累加——參數 40 ⇒ 0.40 點/秒（第 151 幀回第 1 點），且不超上限', () => {
  const w = mk({ a: { strategy: seqFor(35, 1) } }); // 參數 40
  fire(w, 'A', seqFor(35, 1));
  const g = w.sides.A.general;
  g.hp = Math.max(1, Math.floor(g.maxHp / 2));
  const hurt = g.hp;
  for (let i = 0; i < 150; i += 1) tickSkills(w);
  assert.equal(g.hp, hurt, `150 幀時累加器 6000、還沒越線：${hurt} → ${g.hp}`);
  tickSkills(w);
  assert.equal(g.hp, hurt + 1, `第 151 幀越線回 1 點：${hurt} → ${g.hp}`);
  for (let i = 0; i < 1000; i += 1) tickSkills(w);
  assert.equal(g.hp, g.maxHp);
});"""
s = s[:start] + new + s[end:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched strategy.test.ts')
