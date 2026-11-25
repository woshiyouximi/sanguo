import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\data.ts')
t = p.read_text(encoding='utf-8')
old = """  assertAntisymmetric('兵种', data.troops);
  assertAntisymmetric('阵形', data.formations);"""
new = """  assertAntisymmetric('兵种', data.troops);
  assertAntisymmetric('阵形', data.formations);
  // 多值字段一律数组（project/08 §9.5）。老数据里 102 人的 WISESKILL 是字符串，
  // 消费方按数组取会静默拿到 undefined，所以在入口就把契约钉死。
  assertArrayFields(data.generals as unknown as Array<Record<string, unknown>>, [
    'SKILL',
    'WISESKILL',
    'POS',
    'BattleArray',
    'Force',
    'UseForce',
  ]);"""
assert old in t
t = t.replace(old, new, 1)

anchor = "function assertAntisymmetric(label: string, table: MatrixTable): void {"
add = """function assertArrayFields(rows: Array<Record<string, unknown>>, fields: string[]): void {
  for (const f of fields) {
    let bad = 0;
    for (const r of rows) {
      const v = r[f];
      if (v !== undefined && !Array.isArray(v)) bad++;
    }
    if (bad > 0) throw new Error(`字段 ${f} 有 ${bad} 行不是数组（应为数组）`);
  }
}

"""
t = t.replace(anchor, add + anchor, 1)
p.write_text(t, encoding='utf-8')
print('assertArrayFields added')
