import pathlib
p = pathlib.Path(r'F:\sanguo\proto\battle.html')
t = p.read_text(encoding='utf-8')
old = "  build();\n  requestAnimationFrame(loop);"
new = """  build();

  // 调试参数：?sim=300 先把 300 tick 跑完再画（用于无头截图 / 复现某一帧）
  var q = new URLSearchParams(location.search);
  if (q.has('sim')) {
    var n = parseInt(q.get('sim'), 10) || 0;
    for (var i = 0; i < n && world && !world.over; i++) C.step(world);
    draw();
  }
  if (!q.has('freeze')) requestAnimationFrame(loop);"""
assert old in t, 'anchor not found'
p.write_text(t.replace(old, new), encoding='utf-8')
print('patched battle.html')
