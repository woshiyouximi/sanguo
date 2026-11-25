import pathlib, re
p = pathlib.Path(r'F:\sanguo\proto\ui\_gen\gen_data_ui.js')
t = p.read_text(encoding='utf-8')

helper = """/* 技能字段：新版 data/generals.json 是 ["等级,编号", ...] 的数组（TIMES.INI 里 SKILL= 重复多行），
   旧版是单串 "等级,编号"。统一解析成 [[lv,id], ...]。 */
const parsePairs = (v) => {
  if (Array.isArray(v)) return v.map((s) => String(s).split(',').map((x) => +x.trim())).filter((a) => a.length === 2 && a[1] > 0);
  if (typeof v === 'string' && v.trim()) {
    const n = v.split(',').map((x) => +x.trim()).filter((x) => !Number.isNaN(x));
    const out = [];
    for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
    return out;
  }
  return [];
};

"""
anchor = 'const guan = {'
assert anchor in t
t = t.replace(anchor, helper + anchor, 1)

t = t.replace("  skill: (GUAN.SKILL || '').split(',').map((s) => +s.trim()).filter(Boolean),\n  wiseSkill: (GUAN.WISESKILL || '').split(',').map((s) => +s.trim()).filter(Boolean),",
              "  skill: parsePairs(GUAN.SKILL),\n  wiseSkill: parsePairs(GUAN.WISESKILL),")
t = t.replace("    skill: (g.SKILL || '').split(',').map((s) => +s.trim()).filter(Boolean),\n    wiseSkill: (g.WISESKILL || '').split(',').map((s) => +s.trim()).filter(Boolean),",
              "    skill: parsePairs(g.SKILL),\n    wiseSkill: parsePairs(g.WISESKILL),")
p.write_text(t, encoding='utf-8')
print('parsePairs patched; remaining raw splits:', len(re.findall(r"SKILL \|\| ''\)", t)))
