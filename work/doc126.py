import pathlib
p = pathlib.Path(r'F:\sanguo\project\11_客户端工程与视图层.md')
t = p.read_text(encoding='utf-8')
add = """
### 12.6 主将立绘进战斗 HUD（v3）
- `ViewOptions` 新增 `portrait?: { img, w, h }`；`drawConsole()` 里有图就把立绘画进头像框、没图才画「將」占位。
- 两个坑：① `sprite` 命令的 `(x,y)` 是**底部中心**锚点，直接把头像框左上角传进去会画到屏幕外；
  ② 立绘人物一般从图高 15% 处才开始，`sy` 必须上偏（`(h-sh)*0.16`），否则框里全是背景。
- 立绘按 `?gen=` 的姓名去 `web/assets/hero/<繁名>.png` 取；取不到就回退占位，不影响战斗。
"""
if '12.6 主将立绘进战斗 HUD' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc 12.6')
