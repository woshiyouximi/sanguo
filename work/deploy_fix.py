import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\deploy.html')
t = p.read_text(encoding='utf-8')

# 1) 相克矩阵按 rows[].vs 取
old = """function bonus(matrix, a, b) {
  if (!matrix || !matrix[a]) return 0;
  return matrix[a][b] ?? 0;
}"""
new = """function bonus(matrix, a, b) {
  if (!Array.isArray(matrix) || !matrix[a]) return 0;
  const row = matrix[a];
  const vs = row.vs || row;
  return vs[b] ?? 0;
}"""
assert old in t
t = t.replace(old, new, 1)

# 2) 立绘路径：游戏 web 自己的 assets
t = t.replace("img.src = 'assets/hero/'", "img.src = 'assets/hero/'")

# 3) 去掉误导性的"带兵上限"
t = t.replace("""· 帶兵上限 <b id="gcap">—</b>""", """· 節操 <b id="gcap">—</b>""")
t = t.replace("""  const lv = Math.max(1, Math.min(99, Math.floor(((gen.BaseEXP || 200) / 200) * 1)));
  $('gcap').textContent = Math.min(lv * 5, 100);""",
"""  $('gcap').textContent = gen.CONSTANCY ?? gen.Loyal ?? '—';""")
p.write_text(t, encoding='utf-8')
print('deploy fixed')
