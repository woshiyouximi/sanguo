import pathlib
core = pathlib.Path(r'F:\sanguo\game\src\core\battle.ts')
t = core.read_text(encoding='utf-8')

# 1) Unit 字段
a = "  isGeneral?: false;"
b = ("  isGeneral?: false;\n"
     "  /** 最近一次出手的 world.tick（视图选 attack_back 帧用） */\n"
     "  lastAttackTick?: number;\n"
     "  /** 最近一次挨打的 world.tick（视图选 hit_back / death_back 用） */\n"
     "  lastHitTick?: number;")
assert t.count(a) == 1, t.count(a)
t = t.replace(a, b, 1)

# 2) 出手
a2 = "    u.cd = ATTACK_COOLDOWN;"
b2 = "    u.cd = ATTACK_COOLDOWN;\n    u.lastAttackTick = world.tick;"
assert t.count(a2) == 1
t = t.replace(a2, b2, 1)

# 3) 命中统计后
a3 = "    if (from.side === 'A') world.stats.hitsA++;"
b3 = "    to.lastHitTick = world.tick;\n    if (from.side === 'A') world.stats.hitsA++;"
assert t.count(a3) == 1
t = t.replace(a3, b3, 1)

# 4) 死亡
a4 = "      if (world.rng() < p) {"
b4 = "      if (world.rng() < p) {\n        u.lastHitTick = world.tick;"
assert t.count(a4) == 1
t = t.replace(a4, b4, 1)

core.write_text(t, encoding='utf-8')
print('core merged')
