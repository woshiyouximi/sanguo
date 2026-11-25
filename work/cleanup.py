import pathlib
p = pathlib.Path(r'F:\sanguo\proto\battle.html')
t = p.read_text(encoding='utf-8')
t = t.replace("    document.getElementById('meTag');\n", "")
p.write_text(t, encoding='utf-8')
print('cleanup ok')
