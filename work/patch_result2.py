import pathlib
p = pathlib.Path(r'F:\sanguo\proto\battle.html')
t = p.read_text(encoding='utf-8')
anchor = """  if (q.has('cast')) {"""
assert anchor in t
t = t.replace(anchor, """  if (q.has('result')) {          // 截图用：直接跑完并弹结算
    var guardR = 0;
    while (world && !world.over && guardR++ < 30 * 180) C.step(world);
    showResult();
  }
  if (q.has('cast')) {""")
p.write_text(t, encoding='utf-8')
print('debug result param added')
