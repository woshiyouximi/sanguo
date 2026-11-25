import pathlib
p = pathlib.Path(r'F:\sanguo\game\tests\morale.test.ts')
t = p.read_text(encoding='utf-8')
start = t.index("test('戰力第 5 段")
end = t.index("});", start) + 3
new = """test('戰力第 5 段：士氣 20 / 50 / 100 的士氣項 = −6 / 0 / +10（原作 (士氣−50)/5）', () => {
  // 原作 `((short)g->+0x38 - 0x32) / 5`（`idiv 5`，0x44302C），基線是士氣 50。
  // 我们一度把 MORALE_DAMP 設成 2（除以 10）压跨度，已回退成 1（docs/04b5 Q1）。
  assert.equal(moraleTerm(20), -6);
  assert.equal(moraleTerm(50), 0);
  assert.equal(moraleTerm(100), 10);
  // 60 是常见初始值，等于 +2（不是 0）——这一点以前被基线写错过。
  assert.equal(moraleTerm(60), 2);
});
"""
p.write_text(t.replace(block if (block:=t[start:end]) else '', new, 1), encoding='utf-8')
print('ok')
