import pathlib, re
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
t = re.sub(r'var ATTACK_COOLDOWN = \d+;[^\n]*',
           'var ATTACK_COOLDOWN = 120;  // tick = 4.0 s（含挥击与收招；60 时 100v100 只要 18 s）', t)
p.write_text(t, encoding='utf-8')
print('cd=120')
