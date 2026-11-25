import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = p.read_text(encoding='utf-8')
print(len(t.splitlines()), 'lines')
i = t.index('function drawSoldier')
print(t[i:i+1500])
