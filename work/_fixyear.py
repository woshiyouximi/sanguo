import io

P = r'F:\sanguo\game\tests\yearsettle_r7.test.ts'
raw = io.open(P, 'rb').read()
txt = raw.decode('utf-8-sig', errors='replace')
if txt.count('\ufffd') > 5:
    txt = raw.decode('cp936', errors='replace')
txt = txt.replace('\x00', '')

a = txt.index("  assert.equal(S.YEAR_STAGES[4].gate, '0x4A6444');")
b = txt.index("});", txt.index("S.YEAR_STAGES.map((s) => s.id)", a)) + 3

good = """  assert.equal(S.YEAR_STAGES[4].gate, '0x4A6444');
  for (const st of S.YEAR_STAGES) {
    assert.ok(/^\\[(推測|確認)\\]$/.test(st.evidence), `${st.key} 的 evidence 必須是 [推測] 或 [確認]`);
    assert.ok(st.label.length > 0);
  }
  // R85：第五段 `0x423824` 已由 f2 指令級取證（pop×75/10000 + 2250 逐城），其餘四段語義仍未定位
  assert.equal(S.YEAR_STAGES[4].evidence, '[確認]');
  for (let i = 0; i < 4; i += 1) assert.equal(S.YEAR_STAGES[i].evidence, '[推測]');
  const save2 = yearOneDone();
  assert.deepEqual(S.annualSettle(save2, { ts: 1 }).record.stages.map((s) => s.id),
    S.YEAR_STAGES.map((s) => s.id), '結算記錄裡要留一份當時的段序（存檔可對賬）');
});"""

txt = txt[:a] + good + txt[b:]
io.open(P, 'w', encoding='utf-8', newline='').write(txt)
print('ok chars=%d' % len(txt))
