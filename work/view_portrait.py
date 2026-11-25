import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')

# 1) ViewOptions 加 portrait
old = "  atlas?: SpriteAtlas;"
if old in t and "portrait?:" not in t:
    t = t.replace(old, "  atlas?: SpriteAtlas;\n  /** 主将立绘（可选）：有就画进头像框，没有就用「將」占位 */\n  portrait?: { img: CanvasImageSource; w: number; h: number };", 1)

# 2) 画头像
old2 = """  E(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 46, 25, 30, withAlpha(COLORS.ours, 0.28));
  T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 50, '將', 32, COLORS.oursLight, {
    align: 'center',
    bold: true,
  });"""
new2 = """  if (opts.portrait) {
    const pr = opts.portrait;
    const scale = Math.max(PORTRAIT.w / pr.w, PORTRAIT.h / pr.h);
    const sw = PORTRAIT.w / scale;
    const sh = PORTRAIT.h / scale;
    out.push({
      kind: 'sprite',
      img: pr.img,
      sx: Math.max(0, (pr.w - sw) / 2),
      sy: 0,
      sw,
      sh,
      x: PORTRAIT.x,
      y: PORTRAIT.y,
      w: PORTRAIT.w,
      h: PORTRAIT.h,
    });
  } else {
    E(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 46, 25, 30, withAlpha(COLORS.ours, 0.28));
    T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 50, '將', 32, COLORS.oursLight, {
      align: 'center',
      bold: true,
    });
  }"""
assert old2 in t
t = t.replace(old2, new2, 1)
p.write_text(t, encoding='utf-8')
print('view portrait')
