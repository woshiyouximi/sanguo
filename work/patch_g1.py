import pathlib
# 1) gen_data_ui: parsePairs -> [{lv,id}]
g = pathlib.Path(r'F:\sanguo\proto\ui\_gen\gen_data_ui.js')
t = g.read_text(encoding='utf-8')
old = """const parsePairs = (v) => {
  if (Array.isArray(v)) return v.map((s) => String(s).split(',').map((x) => +x.trim())).filter((a) => a.length === 2 && a[1] > 0);
  if (typeof v === 'string' && v.trim()) {
    const n = v.split(',').map((x) => +x.trim()).filter((x) => !Number.isNaN(x));
    const out = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
    return out;
  }
  return [];
};"""
new = """const parsePairs = (v) => {
  const pairs = [];
  const push = (a) => { if (a.length >= 2 && a[1] > 0) pairs.push({ lv: a[0], id: a[1] }); };
  if (Array.isArray(v)) v.forEach((s) => push(String(s).split(',').map((x) => +x.trim())));
  else if (typeof v === 'string' && v.trim()) {
    const n = v.split(',').map((x) => +x.trim()).filter((x) => !Number.isNaN(x));
    for (let i = 0; i + 1 < n.length; i += 2) push([n[i], n[i + 1]]);
  }
  return pairs;   // [{lv, id}] —— 按習得等級升冪
};"""
assert old in t
g.write_text(t.replace(old, new), encoding='utf-8')
print('gen_data_ui parsePairs -> {lv,id}')

# 2) g1.js: use q.id / show lv, and fix placeholder text
p = pathlib.Path(r'F:\sanguo\proto\ui\screens\g1.js')
s = p.read_text(encoding='utf-8')
s = s.replace("""    var magics = (g.skill || []).map(function (q) { return SG.magic(q); }).filter(Boolean);
    var wises = (g.wiseSkill || []).map(function (q) { return SG.wise(q); }).filter(Boolean);""",
"""    /* skill/wiseSkill 现在是 [{lv,id}]：lv = 習得等級，id = 技能序號 */
    var magics = (g.skill || []).map(function (q) { var m = SG.magic(q.id); if (m) m.lv = q.lv; return m; }).filter(Boolean);
    var wises = (g.wiseSkill || []).map(function (q) { var m = SG.wise(q.id); if (m) m.lv = q.lv; return m; }).filter(Boolean);""")
s = s.replace("""            '<div class="s-i">MP ' + m.mp + (m.attack ? ' · 攻 ' + m.attack : '') + '</div>' +""",
"""            '<div class="s-i">Lv' + m.lv + ' 解鎖 · MP ' + m.mp + (m.attack ? ' · 攻 ' + m.attack : '') + '</div>' +""")
s = s.replace("""            '<div class="s-i">等級 ' + m.level + '</div>' +""",
"""            '<div class="s-i">Lv' + m.lv + ' 解鎖 · 等級 ' + m.level + '</div>' +""")
s = s.replace('title="資料表每將只有 2 條技能，其餘為空槽"', 'title="原作技能槽上限：必殺 7 格／軍師 8 格，未習得即空槽"')
s = s.replace("""'<div class="sec-title" style="padding:14px 24px 8px">必殺技 <span class="t-ref">7 格 · 已習得 ' +
      magics.length + ' 格（其餘空槽占位）</span></div>'""",
"""'<div class="sec-title" style="padding:14px 24px 8px">必殺技 <span class="t-ref">' +
      magics.length + ' / 7 格（按等級習得）</span></div>'""")
s = s.replace("""'<div class="sec-title" style="padding:14px 24px 8px">軍師技 <span class="t-ref">8 格 · 已習得 ' +
      wises.length + ' 格（其餘空槽占位）</span></div>'""",
"""'<div class="sec-title" style="padding:14px 24px 8px">軍師技 <span class="t-ref">' +
      wises.length + ' / 8 格（按等級習得）</span></div>'""")
s = s.replace(" * 佔位：必殺技 7 格／軍師技 8 格裡的空槽（資料表每將只導出 2 條）、寶物（Thing 為空串）、",
              " * 佔位：必殺技 7 格／軍師技 8 格裡的空槽（按習得等級解鎖）、寶物（Thing 為空串）、")
p.write_text(s, encoding='utf-8')
print('g1.js patched')
