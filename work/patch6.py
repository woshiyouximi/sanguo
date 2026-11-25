import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
anchor = """    // 阶段 2：收集攻击意图（**不立即结算**）"""
assert anchor in t
sep = """    // 阶段 1.5：分离力（否则所有兵会叠成一个点）
    // 用 2 格一格的哈希桶，只检查 3x3 邻域，100~200 人时开销可忽略
    var bucket = {};
    for (var bi = 0; bi < w.units.length; bi++) {
      var bu = w.units[bi];
      if (!bu.alive || bu.isGeneral) continue;
      var bk = ((bu.x / 2) | 0) + ',' + ((bu.y / 2) | 0);
      (bucket[bk] || (bucket[bk] = [])).push(bu);
    }
    var SEP_D = 0.55, SEP_PUSH = 0.03;
    for (var key in bucket) {
      var parts = key.split(','), cx = +parts[0], cy = +parts[1];
      for (var ox = -1; ox <= 1; ox++) {
        for (var oy = -1; oy <= 1; oy++) {
          var other = bucket[(cx + ox) + ',' + (cy + oy)];
          if (!other) continue;
          for (var i1 = 0; i1 < bucket[key].length; i1++) {
            for (var i2 = 0; i2 < other.length; i2++) {
              var p1 = bucket[key][i1], p2 = other[i2];
              if (p1 === p2) continue;
              var ddx = p2.x - p1.x, ddy = p2.y - p1.y;
              var dd = Math.sqrt(ddx * ddx + ddy * ddy);
              if (dd > SEP_D || dd < 1e-6) continue;
              var nxp = ddx / dd, nyp = ddy / dd;
              p1.x -= nxp * SEP_PUSH; p1.y -= nyp * SEP_PUSH;
              p2.x += nxp * SEP_PUSH; p2.y += nyp * SEP_PUSH;
            }
          }
        }
      }
    }
    for (var fi = 0; fi < w.units.length; fi++) {
      var fu = w.units[fi];
      if (!fu.alive || fu.isGeneral) continue;
      fu.x = Math.max(0.2, Math.min(GRID_W - 1.2, fu.x));
      fu.y = Math.max(0.2, Math.min(GRID_H - 1.2, fu.y));
    }

"""
t = t.replace(anchor, sep + anchor)
p.write_text(t, encoding='utf-8')
print('separation added')
