import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """    state.camX = camera(state.world);
    draw();"""
new = """    state.camX = camera(state.world);
    if (q.has('end')) endBattle();   // 调试用：直接结算，验证战役写回
    draw();"""
assert old in t
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('end param')
