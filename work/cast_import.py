import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')
old = "import type { PostBattleReport } from './capture.ts';"
new = "import type { PostBattleReport } from './capture.ts';\nimport { runSkill } from './smartscript/runtime.ts';"
assert old in t and 'smartscript/runtime.ts' not in t
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('import added')
