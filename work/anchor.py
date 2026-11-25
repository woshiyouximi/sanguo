import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')
old = """      x: PORTRAIT.x,
      y: PORTRAIT.y,
      w: PORTRAIT.w,
      h: PORTRAIT.h,"""
new = """      // sprite 命令的 (x,y) 是「底部中心」锚点：这里换算成头像框中心 + 底边
      x: PORTRAIT.x + PORTRAIT.w / 2,
      y: PORTRAIT.y + PORTRAIT.h,
      w: PORTRAIT.w,
      h: PORTRAIT.h,"""
assert old in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('anchor fixed')
