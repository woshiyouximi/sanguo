import pathlib, re
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')

# aiSides 初始化
a = "      units: [],\n      fx: [],\n      sides: {}\n    };"
assert a in t
t = t.replace(a, """      units: [],
      fx: [],
      // 谁由电脑放技能：默认只有 B（A 是玩家）；测试里可以两边都开，保证对称
      aiSides: { A: !!(opts.ai && opts.ai.A), B: !(opts.ai && opts.ai.B === false) },
      sides: {}
    };""")

# 重写 tickSkills
start = t.index("  /** 电脑主将：每 10 s 试一次")
end = t.index("  function nearestEnemy(w, u) {")
new = """  /** 电脑主将：每 10 s 试一次，按 MP 从低到高找放得起的技能，打对面最密的一小簇。 */
  function aiCastFor(w, side) {
    var g = w.sides[side].general;
    if (!g || !g.alive || w.over) return;
    if (--g.aiTimer > 0) return;
    g.aiTimer = AI_INTERVAL;
    var foe = side === 'A' ? 'B' : 'A';
    for (var k = 0; k < AI_SKILLS.length; k++) {
      var m = magicBySeq(w.data, AI_SKILLS[k]);
      if (!m || g.mp < m.mp || g.qi < qiCostOf(m)) continue;
      var best = null, bestN = -1;
      for (var i = 0; i < w.units.length; i++) {
        var u = w.units[i];
        if (!u.alive || u.side !== foe || u.isGeneral) continue;
        var n = 0;
        for (var j = 0; j < w.units.length; j++) {
          var v = w.units[j];
          if (!v.alive || v.side !== foe || v.isGeneral) continue;
          var dx = v.x - u.x, dy = v.y - u.y;
          if (dx * dx + dy * dy <= 9) n++;
        }
        if (n > bestN) { bestN = n; best = u; }
      }
      if (!best) return;
      cast(w, side, m.seq, best.x, best.y);
      return;
    }
  }

  function tickSkills(w) {
    w.sides.A.general.qi = Math.min(QI_MAX, w.sides.A.general.qi + QI_REGEN_PER_TICK);
    w.sides.B.general.qi = Math.min(QI_MAX, w.sides.B.general.qi + QI_REGEN_PER_TICK);
    if (w.aiSides.A) aiCastFor(w, 'A');
    if (w.aiSides.B) aiCastFor(w, 'B');
  }

"""
t = t[:start] + new + t[end:]
p.write_text(t, encoding='utf-8')
print('tickSkills generalized')
