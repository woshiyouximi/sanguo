"""重建 src/core/battle.ts：以 cocos 快照（12:30 的 pristine 副本，UTF-8）为底，
补回被 cocos 同步工具剥掉的 `.ts` 导入后缀，再打上本轮 R89 的两处改动。

背景：2026-11-25 12:48 我用 PowerShell `Get-Content -Raw | Set-Content -Encoding utf8`
改这个文件，PS 5.1 按 GBK 解码 UTF-8 导致全文中文注释/字符串变成乱码（BOM+CRLF）。
cocos 快照 `game/cocos/assets/scripts/core/battle.ts`（12:30:08，晚于 dist 12:29:07）
与 pristine src 逐行相同（除导入后缀），所以拿它做底本重建。
"""
import re

COCOS = r'F:\sanguo\game\cocos\assets\scripts\core\battle.ts'
SRC = r'F:\sanguo\game\src\core\battle.ts'
OUT = r'F:\sanguo\work\g2g3\battle_rebuilt.ts'

text = open(COCOS, 'rb').read().decode('utf-8-sig').replace('\r\n', '\n')

# 1) 补回 `.ts` 后缀（cocos 侧的同步工具会剥掉它；src 用 allowImportingTsExtensions）
IMP = re.compile(r"""^(\s*(?:import|export)\b[^\n]*?from\s+|\s*import\s+|}\s*from\s+)'(\.[^']*)'""", re.M)


def add_ts(m):
    spec = m.group(2)
    if re.search(r'\.(ts|js|json)$', spec):
        return m.group(0)
    return m.group(1) + "'" + spec + ".ts'"


text = IMP.sub(add_ts, text)

# 2) R89：applyDamage 记下出手方，伤害通道把 G[2]/G[3] 按原作 0x43BA59 的语义填好
edits = [
    (
        'export function applyDamage(world: World, to: Unit, amount: number): number {',
        'export function applyDamage(world: World, to: Unit, amount: number, from?: Unit): number {',
    ),
    (
        "  if ((world.damageChannel ?? 'script') === 'script' && damageViaScript(world, to, dmg)) return dmg;",
        "  if ((world.damageChannel ?? 'script') === 'script' && damageViaScript(world, to, dmg, from)) return dmg;",
    ),
    (
        'function damageViaScript(world: World, to: Unit, dmg: number): boolean {',
        'function damageViaScript(world: World, to: Unit, dmg: number, from?: Unit): boolean {',
    ),
    (
        '  const before = rt.host.calls.length;',
        '  // R89（project/154 §4）：原作 `Hurt` 的第一条指令是\n'
        '  //   `LDSL arg2; LDG 2; EQ` / `LDSL arg2; LDG 3; EQ` / `LOR` / `3D L01364`\n'
        '  // ⇒ 只有「受害者是引擎全局 G[2] 或 G[3]」时才走 0x2B/0x125 真扣血，否则只放 Hit01。\n'
        '  // G[2]/G[3] 的唯一写入者 `0x43BA59`：`G2 = 0x421AD2(施法方 unit->+0x44)`、\n'
        '  // `G3 = 0x421AD2(对方 unit->+0x44)`（`0x421AD2(p)= p? p->[4]:0` 即取对象句柄）。\n'
        '  // 普攻不是原作走 `Hurt` 的路径（`0x43ED96` 全 EXE 只有 0x125 宿主一个调用者），\n'
        '  // 这里是本端口的桥：把这一击的「出手方/受害方」按同样语义填进 G2/G3。\n'
        '  // `from` 缺省（老调用点是 3 参）时 G2 只能是 0，此时靠 G3 放行。\n'
        '  rt.vm.setEngineValue(2, from ? damageHandleOf(world, from) : 0);\n'
        '  rt.vm.setEngineValue(3, victim);\n'
        '  const before = rt.host.calls.length;',
    ),
    ('      applyDamage(world, to, dmg);', '      applyDamage(world, to, dmg, from);'),
    ('      applyDamage(world, to, 1);', '      applyDamage(world, to, 1, from);'),
]

for old, new in edits:
    n = text.count(old)
    assert n == 1, 'edit hit %d times: %r' % (n, old[:60])
    text = text.replace(old, new)

open(OUT, 'w', encoding='utf-8', newline='\n').write(text)
open(SRC, 'wb').write(text.encode('utf-8'))
print('wrote', SRC, len(text.encode('utf-8')), 'bytes,', text.count('\n'), 'lines')
