import pathlib, re
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
i = t.index('export function camera(')
j = t.index('\n}', i)
print(t[i:j+2])
