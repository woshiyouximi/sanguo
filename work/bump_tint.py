import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
t = t.replace("cx.fillStyle = 'rgba(196, 58, 48, 0.55)';", "cx.fillStyle = 'rgba(198, 44, 34, 0.78)';")
p.write_text(t, encoding='utf-8')
print('tint 0.78')
