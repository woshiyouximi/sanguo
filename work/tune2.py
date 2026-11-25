import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
t = t.replace("var MOVE_PER_TICK = 0.05;  // 格/tick ≈ 1.5 格/s",
              "var MOVE_PER_TICK = 0.09;  // 格/tick ≈ 2.7 格/s（原作单兵推进观感）")
p.write_text(t, encoding='utf-8')
print('move 0.09')
