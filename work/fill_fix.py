import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = """  const slot = table.slots[formation] ?? table.slots[0]!;
  const want = String(soldiers);
  const key = slot.fill[want] ? want : String(100);
  const entries = slot.fill[key] ?? [];
  const n = entries.length;"""
new = """  const slot = table.slots[formation] ?? table.slots[0]!;
  const want = String(soldiers);
  // 导出的 fill 只有 10/50/100/200 四档；其它人数按 200 档的顺序切片近似，
  // 否则会退回 100 人 —— 表现为"HUD 写 80 兵、场上却站 100 个"。
  const key = slot.fill[want] ? want : (slot.fill['200'] ? '200' : '100');
  const base = slot.fill[key] ?? [];
  const entries = base.slice(0, Math.max(1, Math.min(soldiers, base.length)));
  const n = entries.length;"""
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('fill slice')
