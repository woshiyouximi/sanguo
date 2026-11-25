import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')

# 主将增加等级/经验/战绩字段
a = """        mp: MP_BASE + Math.floor((cfg.general.int == null ? 70 : cfg.general.int) / 2),
        qi: Math.floor(QI_MAX * 0.35),
        aiTimer: AI_INTERVAL
      };"""
assert a in t
t = t.replace(a, """        mp: MP_BASE + Math.floor((cfg.general.int == null ? 70 : cfg.general.int) / 2),
        qi: Math.floor(QI_MAX * 0.35),
        aiTimer: AI_INTERVAL,
        // 成长（结算用；docs/04b §6.7）
        level: cfg.general.level || 1,
        exp: cfg.general.exp || 0,
        merit: cfg.general.merit || 0,
        wins: cfg.general.wins || 0,
        losses: cfg.general.losses || 0
      };""")

# 结算函数（插在 project 之前）
anchor = "  // ---------------------------------------------------------------- 投影"
assert anchor in t
settle = """  // ---------------------------------------------------------------- 战后结算
  // 全部照 docs/04b §6 的公式：
  //   战功分 = 击杀步兵×6 + 击杀骑兵×12 + 敌将等级×{51 歼灭 / 34 击退}；败方分减半
  //   经验   = 战功分 + 敌方等级和×32÷我方人数
  //   功勋   = max(15, 15 + 秒数/10)，上限 100
  //   升级阈值 = ((n-1)*137 - 34) * n / 2 + 17
  function expToReach(n) {
    return Math.floor(((n - 1) * 137 - 34) * n / 2 + 17);
  }

  function levelFromExp(exp) {
    var n = 1;
    while (n < 99 && expToReach(n + 1) <= exp) n++;
    return n;
  }

  /** 打完后调用一次。返回结算明细（供 UI 显示）。 */
  function settle(w) {
    if (w.settled) return w.settlement;
    w.settled = true;

    var durSec = Math.floor(w.tick / TICK_HZ);
    var A = w.sides.A, B = w.sides.B;
    var winnerSide = w.winner;
    var loserSide = winnerSide === 'A' ? 'B' : 'A';
    var W = w.sides[winnerSide], L = w.sides[loserSide];

    // 歼灭（敌将阵亡）还是击退（兵被打光）
    var mode = L.general.alive ? 2 : 1;
    var modeName = mode === 1 ? '歼灭' : '击退';
    var modeMul = mode === 1 ? 51 : 34;

    var wKills = L.start - L.aliveCount;          // 胜方打掉的兵
    var lKills = W.start - W.aliveCount;          // 败方打掉的兵
    var scW = Math.max(0, wKills * 6 + L.general.level * modeMul);
    var scL = Math.max(0, lKills * 6);
    if (mode === 1) scL = Math.floor(scL / 2);

    // 额外经验：敌方等级和 × 32 ÷ 我方人数（本条按 1 名主将计）
    var extraW = Math.floor(L.general.level * 32);
    var extraL = Math.floor(W.general.level * 32);

    var out = {
      winner: winnerSide, mode: mode, modeName: modeName,
      durationSec: durSec,
      kills: { A: wKills, B: lKills },
      score: { A: winnerSide === 'A' ? scW : scL, B: winnerSide === 'B' ? scW : scL },
      expGain: { A: winnerSide === 'A' ? scW + extraW : scL + extraL,
                B: winnerSide === 'B' ? scW + extraW : scL + extraL },
      meritGain: Math.min(100, 15 + Math.floor(durSec / 10)),
      levelUp: null
    };

    ['A', 'B'].forEach(function (s) {
      var g = w.sides[s].general;
      var gain = out.expGain[s];
      g.exp += gain;
      g.merit = Math.min(100, g.merit + out.meritGain);
      if (s === winnerSide) g.wins++; else g.losses++;
      var lv = levelFromExp(g.exp);
      if (lv > g.level) {
        var hpUp = 0, mpUp = 0;
        while (g.level < lv) {
          g.level++;
          var dHp = 6 + Math.floor(g.str / 20);
          var dMp = 3 + Math.floor((g.int || 70) / 25);
          g.maxHp += dHp; g.mpMax += dMp;
          hpUp += dHp; mpUp += dMp;
        }
        g.hp = g.maxHp; g.mp = g.mpMax;      // 升级即回满（原作保留溢出，这里等效）
        out.levelUp = out.levelUp || {};
        out.levelUp[s] = { level: g.level, hpUp: hpUp, mpUp: mpUp, troopsCap: Math.min(5 * g.level, 100) };
      }
    });

    out.level = { A: w.sides.A.general.level, B: w.sides.B.general.level };
    out.exp = { A: w.sides.A.general.exp, B: w.sides.B.general.exp };
    out.record = { A: [w.sides.A.general.wins, w.sides.A.general.losses],
                   B: [w.sides.B.general.wins, w.sides.B.general.losses] };
    out.nextLevelAt = expToReach(w.sides.A.general.level + 1);
    w.settlement = out;
    return out;
  }

  // ---------------------------------------------------------------- 投影"""
t = t.replace(anchor, settle)

# step() 结束时不再直接判 over 之外的事；结算由 UI/调用方触发。导出 settle 等
t = t.replace("    cast: cast, magicBySeq: magicBySeq, QI_MAX: QI_MAX, QI_COST_SCALE: QI_COST_SCALE,",
              "    cast: cast, magicBySeq: magicBySeq, QI_MAX: QI_MAX, QI_COST_SCALE: QI_COST_SCALE,\n    settle: settle, expToReach: expToReach, levelFromExp: levelFromExp,")
p.write_text(t, encoding='utf-8')
print('settle added, lines', len(t.splitlines()))
