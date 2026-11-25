import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
i = t.index('export function settle(')
print(t[i:i+2200])
