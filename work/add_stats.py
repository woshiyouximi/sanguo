import pathlib
p = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = p.read_text(encoding='utf-8')

t = t.replace("""  aiSides: Record<Side, boolean>;
  settled?: SettleResult;""",
"""  aiSides: Record<Side, boolean>;
  /** 统计（调试/验收用）：每侧的出手次数与命中次数 */
  stats: { attacksA: number; attacksB: number; hitsA: number; hitsB: number };
  settled?: SettleResult;""")

t = t.replace("""    aiSides: { A: opts.aiSides?.A ?? false, B: opts.aiSides?.B ?? true },
  };""",
"""    aiSides: { A: opts.aiSides?.A ?? false, B: opts.aiSides?.B ?? true },
    stats: { attacksA: 0, attacksB: 0, hitsA: 0, hitsB: 0 },
  };""")

t = t.replace("""  // 阶段 3：统一结算
  for (const { from, to } of intents) {
    const power = powerOf(world, from.side);
    const roll = world.rng() * 300;
    if (roll >= power) continue;""",
"""  // 阶段 3：统一结算
  for (const { from, to } of intents) {
    if (from.side === 'A') world.stats.attacksA++;
    else world.stats.attacksB++;
    const power = powerOf(world, from.side);
    const roll = world.rng() * 300;
    if (roll >= power) continue;
    if (from.side === 'A') world.stats.hitsA++;
    else world.stats.hitsB++;""")
p.write_text(t, encoding='utf-8')
print('stats added')
