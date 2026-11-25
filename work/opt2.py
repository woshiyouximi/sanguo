import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')
old = "  atlas?: SpriteAtlas | null;"
assert old in t
t = t.replace(old, "  atlas?: SpriteAtlas | null;\n  /** 主将立绘（可选）：有就画进头像框，没有就用「將」占位 */\n  portrait?: { img: CanvasImageSource; w: number; h: number } | null;", 1)
p.write_text(t, encoding='utf-8')
print('opt added')
