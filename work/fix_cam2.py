import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = """  let cam: number;
  if (aN && bN) cam = (aMin + bMax) / 2;"""
new = """  let cam: number;
  if (aN && bN) {
    const mid = (aMin + bMax) / 2;
    // 开局两军相距 30 行、一屏只有 12.6 行：若直接取中点，屏幕上只有空战场（实测就是"点开战什么都看不见"）。
    // 因此相距超过一屏时先跟住我方前锋——把它放在屏幕 ~65% 高处（约 2.6 行偏置），等接近了再过渡到中点。
    cam = (aMin - bMax > 2 * half) ? aMin - 2.6 : mid;
  }"""
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('camera: follow own front when gap > 1 screen')
