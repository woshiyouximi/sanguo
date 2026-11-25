import pathlib
p = pathlib.Path(r'F:\sanguo\project\16_单位动作接入.md')
t = p.read_text(encoding='utf-8')
add = """
## 合并记录（已落地）

2026-11-24 18:38 合并进主树，`battleView.ts`/`battle.ts`/`main.js` 均为最终版：

- `core/battle.ts`：`Unit` 加 `lastAttackTick?/lastHitTick?`；出手写 `lastAttackTick`、命中与被击杀写 `lastHitTick`。
- `view/battleView.ts`：`drawActors` 保留"死亡窗口内且该侧有动作帧"的单位；`drawSoldier` 在影子之后插
  `pickActionFrame → pushActionSprite`，命中就 `return`；旧 `u.cd > 96` 摆动窗口加 `!usesActionFrames(u)` 让位。
- **合并时额外修了一个坑**：第一版 `drawActors` 只判断 `isDying`，而 `ACTION_SIDES = ['A']`，
  于是敌方尸体进入窗口后只画出**一个孤立影子**（影子在动作分支之前画）。改成
  `if (!u.alive && !(isDying(u, world) && usesActionFrames(u))) continue;` 后消失。
- 验证：`tsc --noEmit` **0**、`node --test` **17/17**、`tsc -p tsconfig.build.json` **0**，
  截图 `work/act2_zoom.png`（`?sim=260&freeze=1&seed=302`）无孤立影子。
- 仍未做：`hit_back` 实战不可见（士兵一击必杀）、只接 A 侧、敌方无动作帧。
"""
if '## 合并记录（已落地）' not in t:
    t = t.rstrip() + "\n" + add
p.write_text(t, encoding='utf-8')
print('doc16 merged note')
