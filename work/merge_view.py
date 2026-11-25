import pathlib
v = pathlib.Path(r'F:\sanguo\game\src\view\battleView.ts')
t = v.read_text(encoding='utf-8')

# 1) import
a = "import type { GameData } from '../types.ts';"
b = ("import type { GameData } from '../types.ts';\n"
     "import { actionAtlas, isDying, pickActionFrame, pushActionSprite, usesActionFrames } from './animSelect.ts';")
assert t.count(a) == 1
t = t.replace(a, b, 1)

# 2) drawActors 保留死亡窗口内的单位
a2 = """  for (const u of world.units) {
    if (!u.alive) continue;
    const p = project(u.x, u.y, camX);"""
b2 = """  for (const u of world.units) {
    if (!u.alive && !isDying(u, world)) continue;
    const p = project(u.x, u.y, camX);"""
assert t.count(a2) == 1
t = t.replace(a2, b2, 1)

# 3) 旧摆动窗口让位给动作帧
a3 = "      const swinging = atk.length > 0 && u.cd > 96;"
b3 = "      const swinging = atk.length > 0 && u.cd > 96 && !usesActionFrames(u);"
assert t.count(a3) == 1
t = t.replace(a3, b3, 1)

# 4) 影子之后插入动作帧分支
a4 = "  E(out, fx, fy + 13, 12, 4, COLORS.shadow);"
b4 = """  E(out, fx, fy + 13, 12, 4, COLORS.shadow);

  // 背视动作帧（攻击/受击/死亡）：有就画完直接返回，否则退回走路序列 / 色块
  const act = pickActionFrame(u, world, actionAtlas);
  if (pushActionSprite(out, act, fx, fy)) return;
  if (!u.alive) return; // 死亡窗口内但图集没加载好：别画站着的尸体
"""
assert t.count(a4) == 1
t = t.replace(a4, b4, 1)

v.write_text(t, encoding='utf-8')
print('view merged')
