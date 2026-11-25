import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """    while (state.world && !state.world.over && guard++ < simParam) step(state.world);
    draw();"""
new = """    while (state.world && !state.world.over && guard++ < simParam) step(state.world);
    // 冻结截图时镜头必须硬切到位：正常帧循环里 camX 是平滑跟随，
    // freeze 会跳过 frame()，镜头会停在开局位置，画面就"空"了。
    state.camX = camera(state.world);
    draw();"""
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('camera hard-cut on sim')
