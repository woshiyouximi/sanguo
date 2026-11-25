import pathlib
v = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = v.read_text(encoding='utf-8')
a = "    if (!u.alive && !isDying(u, world)) continue;"
b = "    // 只有「有动作帧的那一侧」才画死亡窗口，否则尸体只剩一个影子\n    if (!u.alive && !(isDying(u, world) && usesActionFrames(u))) continue;"
assert t.count(a) == 1
v.write_text(t.replace(a, b, 1), encoding='utf-8')
print('shadow-only fixed')
