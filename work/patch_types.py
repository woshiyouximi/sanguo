import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')

t = t.replace("import type { FormationTable, GameData, MatrixTable } from '../types.ts';",
              "import type { FormationTable, GameData, Magic, MatrixTable } from '../types.ts';")
t = t.replace("  winner: Side | null;", "  winner: Side | 'draw' | null;")
t = t.replace("const kind = skillKindOf(world.data, seq);",
              "const kind = skillKindOf(world.data, seq);\n    if (kind === null) return { ok: false, reason: 'no-magic' };")
p.write_text(t, encoding='utf-8')
print('patched battle.ts')
