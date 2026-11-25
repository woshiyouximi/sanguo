import io

src = open(r'F:\sanguo\work\skillwait\probe_all_magics.mjs', encoding='utf-8').read()

src = src.replace(
"""    const aliveB0 = world.units.filter((u) => u.side === 'B' && u.alive).length;""",
"""    const aliveB0 = world.units.filter((u) => u.side === 'B' && u.alive).length;
    const snap = () => {
      const st = world.units.filter((u) => u.alive).map((u) => (u.status ?? 0)).reduce((a, b) => (a | b), 0);
      return { st, mb: world.sides.B.morale, ma: world.sides.A.morale, tb: world.sides.B.general.tire ?? 0, mbp: world.sides.B.general.mp ?? 0, n: world.units.length };
    };
    const s0 = snap();""")

src = src.replace(
"""    row.effect = row.markDmg > 0 || row.markKills > 0 || row.markHeal > 0 || row.markSummon > 0 || row.dmgB > 0;""",
"""    const s1 = snap();
    row.dStatus = s1.st !== s0.st;
    row.dMorale = s1.mb !== s0.mb || s1.ma !== s0.ma;
    row.dTire = s1.tb !== s0.tb;
    row.dMp = s1.mbp !== s0.mbp;
    row.dCount = s1.n !== s0.n;
    row.effect = row.markDmg > 0 || row.markKills > 0 || row.markHeal > 0 || row.markSummon > 0
      || row.dmgB > 0 || row.dStatus || row.dMorale || row.dTire || row.dMp || row.dCount;""")

open(r'F:\sanguo\work\skillwait\probe_all_magics2.mjs', 'w', encoding='utf-8', newline='\n').write(src)
print('written', len(src))
