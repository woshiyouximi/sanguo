import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
t = p.read_text(encoding='utf-8')
t = t.replace("#actions{display:flex;gap:10px}",
              "#actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n#actions .btn.full{grid-column:1 / -1}")
t = t.replace(".btn{flex:1;height:86px;", ".btn{height:86px;")
# 推进一月占满整行
t = t.replace("acts.push(`<div class=\"btn\" data-act=\"advance\">", "acts.push(`<div class=\"btn full\" data-act=\"advance\">")
# 内政副标题压短，避免两行
t = t.replace("八命令 · 搜索/移動/任命", "內政八命令")
p.write_text(t, encoding='utf-8')
print('grid + subtitle')
