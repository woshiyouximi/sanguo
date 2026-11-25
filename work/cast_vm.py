import pathlib, re
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')

# 1) import
if "smartscript/runtime" not in t:
    t = t.replace("import { magicBySeq", "import { runSkill } from './smartscript/runtime.js';\nimport { magicBySeq", 1)

start = t.index("  const kind = skillKindOf(world.data, seq);\n  if (kind === null) return { ok: false, reason: 'no-magic' };\n  let killed = 0;\n  let healed = 0;")
end = t.index("  recompute(world);\n  checkOver(world);\n  return { ok: true, killed, healed, mp: g.mp, qi: g.qi };")
new = """  // 真·脚本执行：跑 MAGIC.SO 的原始字节码（vm-port 移植的 SmartScript 虚拟机）。
  // 伤害/治疗/召唤都由脚本自身的 syscall 落到 world 上，stats 回传本次的击杀与治疗量。
  const run = runSkill(world, side, m.SCRIPT, tx, ty, { ttl: life });
  const killed = run.stats.killed;
  const healed = run.stats.healed;
  if (!run.ok) {
    // 脚本跑失败（超预算/未知 opcode）时不能静默：留一条日志，并保留原地的特效表现
    world.fx.push({ seq, kind: skillKindOf(world.data, seq) ?? 'strike', x: tx, y: ty, r: 1.8, ttl: life, life, side });
    if (typeof console !== 'undefined') console.warn(`[cast] 脚本 ${m.SCRIPT} 失败：${run.log.join(' | ')}`);
  }
"""
t = t[:start] + new + t[end:]
p.write_text(t, encoding='utf-8')
print('cast -> runSkill')
