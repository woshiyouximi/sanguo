import io, re, sys

def read(p):
    return io.open(p, encoding='utf-8').read()

def write(p, s):
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---------- strategy.ts ----------
sp = r'F:\sanguo\game\src\core\strategy.ts'
s = read(sp)

if 'REGEN_ACC_MAX' not in s:
    anchor = 'export const REGEN_PERIOD_TICKS = 120;'
    add = anchor + '''

/**
 * 原作 `0x43E847` 的累加阈值（`army+0x8c` 越过 `0x1770`=6000 回 1 点）。
 * 速率 = 参数 / 100 点每秒（60Hz）：技力参数 30/50/70 ⇒ 0.30/0.50/0.70 点/秒，
 * 体力参数 40/60/80 ⇒ 0.40/0.60/0.80 点/秒。证据见 `work/dis_battle_units.txt`
 * 地址 0x43E84A–0x43E963 与 `work/jili/REPORT.md` §2。
 *
 * 注意：`REGEN_PERIOD_TICKS` 是旧实现的「每 120 tick 回一次百分比」，
 * 保留只为 `game/tests/tick60.test.ts` 的历史断言，已不参与战斗计算。
 */
export const REGEN_ACC_MAX = 0x1770;'''
    s = s.replace(anchor, add, 1)

if 'hpRegenAcc' not in s:
    old = """  /** 恢復體力：每 `REGEN_PERIOD_TICKS` 回 `maxHp × hpRegen / 1000` */
  hpRegen: number;
  /** 恢復技力：同上，用 `mpMax` */
  mpRegen: number;"""
    new = """  /** 恢復體力參數（原作 `army+0x88`，40/60/80）：每幀累加，越過 `REGEN_ACC_MAX` 回 1 點 */
  hpRegen: number;
  /** 恢復技力參數（原作 `army+0x88`，30/50/70）：同上 */
  mpRegen: number;
  /** 原作 `army+0x8c` 體力恢復累加器（`hpRegen` 每幀加進來，過 6000 清零回 1 點） */
  hpRegenAcc?: number;
  /** 原作 `army+0x8c` 技力恢復累加器（體力旗標成立時整段不走） */
  mpRegenAcc?: number;"""
    if old not in s:
        print('WARN: ArmyStatus regen fields pattern not found', file=sys.stderr)
    s = s.replace(old, new, 1)

write(sp, s)

# ---------- battle.ts ----------
bp = r'F:\sanguo\game\src\core\battle.ts'
b = read(bp)

start = b.find('function strategyRegen(world: World, side: Side): void {')
if start < 0:
    print('ERROR: strategyRegen not found', file=sys.stderr)
    sys.exit(1)

# back up to the doc comment start ("/**\n * R37 恢復體力")
doc = b.rfind('/**', 0, start)
assert doc > 0, 'doc comment not found'
end = b.find('\n}\n', start)
assert end > 0, 'function end not found'
end += 3  # include "\n}\n"

new_fn = '''/**
 * 原作 `0x43E847(army)`：`work/dis_battle_units.txt` 地址 0x43E84A–0x43E963，
 * 唯一调用点 `0x43E9E5`（在 `0x43E964` 内），而 `0x43E964` 由 Process 4 的
 * OM_TICK(msg=2) 分支**每帧**调用。
 *
 *   - `army+0x84` bit0=體力恢復 / bit1=技力恢復（**只有军师技**「體力/技力自動恢復」会置位，
 *     全 dumps 26 处写入点里除 `0x44D450` 军师技分派器外只有 ctor/读档/初始化）；
 *   - 每帧 `army+0x8c += army+0x88`（參數 40/60/80 或 30/50/70）；
 *   - `army+0x8c > 0x1770`(6000) ⇒ `-= 6000`、对应当前值 +1、夹到上限；
 *   - bit0 成立时直接返回，技力分支整段不走（體力優先，`0x43E857` 末尾 `jmp 0x43E960`）。
 *
 * 效果（60Hz）：技力 L1/L2/L3 = 0.30/0.50/0.70 点/秒，體力 = 0.40/0.60/0.80 点/秒。
 * 没带军师技时整场恒 0 —— 这就是原作口径，玩家觉得「不回」属正常。
 */
function strategyRegen(world: World, side: Side): void {
  const army = world.army?.[side];
  if (!army) return;
  const g = world.sides[side].general;
  if (!g.alive) return;
  if ((army.flags & ARMY_FLAG.hpRegen) !== 0) {
    if (army.hpRegen <= 0) return;
    army.hpRegenAcc = (army.hpRegenAcc ?? 0) + army.hpRegen;
    if (army.hpRegenAcc > REGEN_ACC_MAX) {
      army.hpRegenAcc -= REGEN_ACC_MAX;
      g.hp = Math.min(g.maxHp, g.hp + 1);
    }
    return;
  }
  if ((army.flags & ARMY_FLAG.mpRegen) !== 0) {
    if (army.mpRegen <= 0) return;
    army.mpRegenAcc = (army.mpRegenAcc ?? 0) + army.mpRegen;
    if (army.mpRegenAcc > REGEN_ACC_MAX) {
      army.mpRegenAcc -= REGEN_ACC_MAX;
      g.mp = Math.min(g.mpMax, g.mp + 1);
    }
  }
}
'''
b = b[:doc] + new_fn + b[end:]

# import: REGEN_PERIOD_TICKS -> REGEN_ACC_MAX
b = b.replace('REGEN_PERIOD_TICKS,', 'REGEN_ACC_MAX,', 1)
write(bp, b)
print('OK')
