import pathlib, re
p = pathlib.Path(r'F:\sanguo\game\tests\morale.test.ts')
t = p.read_text(encoding='utf-8')
start = t.index("test('戰力第 5 段")
end = t.index("});", start) + 3
block = t[start:end]
new = """test('戰力第 5 段：士氣 20/60/100 的士氣項 = −6 / 0 / +10（原作 (士氣−50)/5）', () => {
  // 原作為 `((short)g->+0x38 - 0x32) / 5`（`idiv 5`，0x44302C）。
  // 我们一度把 MORALE_DAMP 設成 2（除以 10）来压跨度 —— 那是手感调整，
  // 与「1:1 还原」冲突，已回退成 1（docs/04b5 Q1）。
  const p20 = moraleTerm(20);
  const p60 = moraleTerm(60);
  const p100 = moraleTerm(100);
  assert.equal(p20 - p60, -6);
  assert.equal(p60, 0);
  assert.equal(p100 - p60, 10);
});
"""
p.write_text(t.replace(block, new, 1), encoding='utf-8')
print('test updated')
