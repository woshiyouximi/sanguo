import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')
old = """  } else {
    E(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 46, 25, 30, withAlpha(COLORS.ours, 0.28));
    T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 50, '將', 32, COLORS.oursLight, {
      align: 'center',
      bold: true,
    });
  }"""
new = """  } else {
    E(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 46, 25, 30, withAlpha(COLORS.ours, 0.28));
    T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 50, '將', 32, COLORS.oursLight, {
      align: 'center',
      bold: true,
    });
  }
  if (opts.portrait) {
    // 立绘盖住框底，Lv 标签改成右下角的小徽章
    R(out, PORTRAIT.x + PORTRAIT.w - 40, PORTRAIT.y + PORTRAIT.h - 20, 40, 20, 'rgba(10,12,16,.78)', {
      radius: RADIUS.sm ?? 4,
    });
    T(out, PORTRAIT.x + PORTRAIT.w - 20, PORTRAIT.y + PORTRAIT.h - 16, `Lv.${g.level}`, 12, COLORS.gold, {
      align: 'center',
    });
  }"""
assert old in t
t = t.replace(old, new, 1)
# 有立绘时不要再画中间那个 Lv
old2 = """  T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 92, `Lv.${g.level}`, 14, COLORS.gold, {
    align: 'center',
  });"""
new2 = """  if (!opts.portrait) {
    T(out, PORTRAIT.x + PORTRAIT.w / 2, PORTRAIT.y + 92, `Lv.${g.level}`, 14, COLORS.gold, {
      align: 'center',
    });
  }"""
assert old2 in t
t = t.replace(old2, new2, 1)
p.write_text(t, encoding='utf-8')
print('lv badge')
