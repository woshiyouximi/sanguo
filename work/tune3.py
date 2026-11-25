import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
t = t.replace("var ATTACK_COOLDOWN = 36;  // tick ≈ 1.2 s（原作一次挥击约 1 s，太快会变成\"瞬间融化\"）",
              "var ATTACK_COOLDOWN = 60;  // tick = 2.0 s（含挥击+收招；1.2 s 时 100v100 只要 13 秒就打完）")
p.write_text(t, encoding='utf-8')
print('cooldown 60')
