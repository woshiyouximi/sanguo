import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
t = t.replace("var MOVE_PER_TICK = 0.06;  // 格/tick ≈ 1.8 格/s",
              "var MOVE_PER_TICK = 0.05;  // 格/tick ≈ 1.5 格/s")
t = t.replace("var ATTACK_COOLDOWN = 18;  // tick ≈ 0.6 s",
              "var ATTACK_COOLDOWN = 36;  // tick ≈ 1.2 s（原作一次挥击约 1 s，太快会变成\"瞬间融化\"）")
p.write_text(t, encoding='utf-8')
print('core tuned')
