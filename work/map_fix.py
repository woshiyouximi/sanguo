import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
t = p.read_text(encoding='utf-8')
t = t.replace("const cities = ALL.slice(0, 24);", "const cities = ALL;   // 全部 60 城都进列表与地图")
t = t.replace("""  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);""",
"""  let li = 0;
  for (const c of ALL) {
    const [sx, sy] = toScreen(c.pos_xy[0], c.pos_xy[1]);
    li++;""")
t = t.replace("""    g.fillText(c.NAME, sx, sy - r - 8);""",
"""    // 标签一上一下错开，缓解中原一带的拥挤
    g.fillText(c.NAME, sx, li % 2 ? sy - r - 8 : sy + r + 19);""")
p.write_text(t, encoding='utf-8')
print('labels staggered')
