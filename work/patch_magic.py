import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')

# --- 1) 常量 -------------------------------------------------------------
anchor = "  var ATTACK_COOLDOWN = 120;  // tick = 4.0 s（含挥击与收招；60 时 100v100 只要 18 s）\n"
assert anchor in t
consts = anchor + """
  // ---- 武将技（v0.2）----
  // 技力(MP)：原作 general+0x14/+0x16，消耗 MagicDef.MP（数据里就有，1:1 使用）。
  // 氣力：docs/04b 记满条 60000、docs/04b3 记 120000，二者冲突；原型取 120000（见 04b3）。
  //   原作消耗 = POWER*1200，而本版 MAGIC.INI 的 POWER 恒为 100 → 一次要吃掉整条；
  //   28 秒的对局放不出第二次，所以原型把系数缩到 120（= 10% 条），并在文档里标明是【新设计】。
  var QI_MAX = 120000;
  var QI_REGEN_PER_TICK = 200;   // 6000/s → 20 s 满条
  var QI_COST_SCALE = 120;
  var MP_BASE = 60;              // 原型：技力上限 = 60 + 智力/2（原作公式含 TIMES 的 BaseMP，未导出）

  // 三个代表技：seq → 效果类型。其余技能按 ATTACK 值走通用规则。
  var SKILL_KIND = {
    1:   { kind: 'heal',   radius: 0 },
    550: { kind: 'strike', radius: 1.8 },
    104: { kind: 'aoe',    radius: 3.6 }
  };
  var AI_SKILLS = [550, 104];    // 电脑会用的技能（按 MP 从低到高尝试）
  var AI_INTERVAL = 300;         // 10 s 思考一次
"""
t = t.replace(anchor, consts)

# --- 2) 主将字段 ---------------------------------------------------------
anchor2 = """        alive: true, cool: 0, troop: cfg.troop, str: cfg.general.str || 70,
        morale: cfg.morale == null ? 60 : cfg.morale, kills: 0
      };"""
assert anchor2 in t
new2 = """        alive: true, cool: 0, troop: cfg.troop, str: cfg.general.str || 70,
        int: cfg.general.int == null ? 70 : cfg.general.int,
        morale: cfg.morale == null ? 60 : cfg.morale, kills: 0,
        mpMax: MP_BASE + Math.floor((cfg.general.int == null ? 70 : cfg.general.int) / 2),
        mp: MP_BASE + Math.floor((cfg.general.int == null ? 70 : cfg.general.int) / 2),
        qi: Math.floor(QI_MAX * 0.35),
        aiTimer: AI_INTERVAL
      };"""
t = t.replace(anchor2, new2)

# w.fx
anchor3 = "      units: [],\n      sides: {}\n    };"
assert anchor3 in t
t = t.replace(anchor3, "      units: [],\n      fx: [],\n      sides: {}\n    };")

# --- 3) 技能实现（插在 nearestEnemy 之前）--------------------------------
anchor4 = "  function nearestEnemy(w, u) {"
assert anchor4 in t
skills = """  // ---------------------------------------------------------------- 武将技
  function magicBySeq(data, seq) {
    var ms = data.magics || [];
    for (var i = 0; i < ms.length; i++) if (ms[i].seq === seq) return ms[i];
    return null;
  }

  function skillKindOf(magic) {
    var s = SKILL_KIND[magic.seq];
    if (s) return s;
    if (magic.attack >= 40) return { kind: 'aoe', radius: 3.2 };
    if (magic.attack >= 1) return { kind: 'strike', radius: 1.5 };
    return { kind: 'buff', radius: 0 };
  }

  function qiCostOf(magic) { return 100 * QI_COST_SCALE; }   // POWER 恒 100

  /** 施放武将技。tx/ty = 目标世界坐标（治疗类忽略）。返回结算对象。 */
  function cast(w, side, seq, tx, ty) {
    if (w.over) return { ok: false, reason: 'over' };
    var s = w.sides[side];
    var g = s.general;
    if (!g || !g.alive) return { ok: false, reason: 'general-dead' };
    var m = magicBySeq(w.data, seq);
    if (!m) return { ok: false, reason: 'no-magic' };

    var mpCost = m.mp | 0;
    var qiCost = qiCostOf(m);
    if (g.mp < mpCost) return { ok: false, reason: 'mp', need: mpCost, have: g.mp };
    if (g.qi < qiCost) return { ok: false, reason: 'qi', need: qiCost, have: g.qi };

    g.mp -= mpCost;
    g.qi -= qiCost;

    var sk = skillKindOf(m);
    var result = { ok: true, seq: seq, name: m.name, kind: sk.kind, killed: 0, healed: 0, mp: g.mp, qi: g.qi };

    if (sk.kind === 'heal') {
      var heal = 20 + (m.attack | 0);
      var before = g.hp;
      g.hp = Math.min(g.maxHp, g.hp + heal);
      result.healed = g.hp - before;
      s.morale = Math.min(100, s.morale + 3);
      w.fx.push({ x: g.x, y: g.y, r: 1.2, ttl: 24, side: side, kind: 'heal' });
    } else if (sk.kind === 'buff') {
      s.morale = Math.min(100, s.morale + 6);
      g.buff = 2000;   // 全局加成（百分之一单位）
      w.fx.push({ x: g.x, y: g.y, r: 1.6, ttl: 24, side: side, kind: 'buff' });
    } else {
      var chance = sk.kind === 'aoe'
        ? Math.min(0.80, 0.20 + m.attack * 0.008)
        : Math.min(0.75, 0.15 + m.attack * 0.010);
      var foe = side === 'A' ? 'B' : 'A';
      for (var i = 0; i < w.units.length; i++) {
        var u = w.units[i];
        if (!u.alive || u.side !== foe) continue;
        var dx = u.x - tx, dy = u.y - ty;
        if (dx * dx + dy * dy > sk.radius * sk.radius) continue;
        if (u.isGeneral) {
          var gd = 8 + Math.floor((m.attack | 0) / 2);
          u.hp = Math.max(0, u.hp - gd);
          if (u.hp <= 0) { u.alive = false; }
          continue;
        }
        if (w.rand() < chance) { u.alive = false; u.hp = 0; result.killed++; }
      }
      w.fx.push({ x: tx, y: ty, r: sk.radius, ttl: 30, side: side, kind: sk.kind });
    }
    w.log.push({ t: w.tick, side: side, kind: 'magic', seq: seq, name: m.name,
                 killed: result.killed, healed: result.healed });
    return result;
  }

  /** 电脑主将：每 10 s 试一次，按 MP 从低到高找放得起的技能，打我方最靠前的一小簇。 */
  function tickSkills(w) {
    var g = w.sides.B.general;
    if (!g || !g.alive || w.over) return;
    g.qi = Math.min(QI_MAX, g.qi + QI_REGEN_PER_TICK);
    w.sides.A.general.qi = Math.min(QI_MAX, w.sides.A.general.qi + QI_REGEN_PER_TICK);
    if (--g.aiTimer > 0) return;
    g.aiTimer = AI_INTERVAL;
    for (var k = 0; k < AI_SKILLS.length; k++) {
      var m = magicBySeq(w.data, AI_SKILLS[k]);
      if (!m || g.mp < m.mp || g.qi < qiCostOf(m)) continue;
      // 找一个我方单位做中心，优先挑"周围人最多"的
      var best = null, bestN = -1;
      for (var i = 0; i < w.units.length; i++) {
        var u = w.units[i];
        if (!u.alive || u.side !== 'A' || u.isGeneral) continue;
        var n = 0;
        for (var j = 0; j < w.units.length; j++) {
          var v = w.units[j];
          if (!v.alive || v.side !== 'A' || v.isGeneral) continue;
          var dx = v.x - u.x, dy = v.y - u.y;
          if (dx * dx + dy * dy <= 9) n++;
        }
        if (n > bestN) { bestN = n; best = u; }
      }
      if (!best) return;
      cast(w, 'B', m.seq, best.x, best.y);
      return;
    }
  }

  function nearestEnemy(w, u) {"""
t = t.replace(anchor4, skills)

# --- 4) step 里调用 ------------------------------------------------------
anchor5 = "    ['A', 'B'].forEach(function (s) {\n      var n = 0;"
assert anchor5 in t
t = t.replace(anchor5, """    tickSkills(w);
    for (var fxi = w.fx.length - 1; fxi >= 0; fxi--) {
      if (--w.fx[fxi].ttl <= 0) w.fx.splice(fxi, 1);
    }

    ['A', 'B'].forEach(function (s) {
      var n = 0;""")

# --- 5) 导出 -------------------------------------------------------------
anchor6 = "    formationPositions: formationPositions, powerOf: powerOf,"
assert anchor6 in t
t = t.replace(anchor6, "    formationPositions: formationPositions, powerOf: powerOf,\n    cast: cast, magicBySeq: magicBySeq, QI_MAX: QI_MAX, QI_COST_SCALE: QI_COST_SCALE,\n    qiCostOf: qiCostOf, skillKindOf: skillKindOf,")

p.write_text(t, encoding='utf-8')
print('core.js patched, lines =', len(t.splitlines()))
