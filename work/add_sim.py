import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """  if (params.get('auto') === '1') startBattle();"""
new = """  if (params.get('auto') === '1') startBattle();

  // ?sim=N：先同步跑 N 个逻辑 tick 再画（无头截图/验收用；headless 模式 rAF 可能不触发，
  // 只靠 auto=1 会一直停在 00:00）
  const simParam = Number.parseInt(params.get('sim') ?? '', 10);
  if (Number.isFinite(simParam) && simParam > 0) {
    if (state.mode !== 'fighting') startBattle();
    let guard = 0;
    while (state.world && !state.world.over && guard++ < simParam) step(state.world);
    draw();
  }"""
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('main.js: ?sim=N added')
