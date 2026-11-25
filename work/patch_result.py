import pathlib
p = pathlib.Path(r'F:\sanguo\proto\battle.html')
t = p.read_text(encoding='utf-8')

# ---- CSS ----
assert '</style>' in t
t = t.replace('</style>', """  /* 结算浮层 */
  #result{position:absolute;left:0;top:0;width:750px;height:1334px;display:none;
    background:rgba(6,8,10,.82);backdrop-filter:blur(3px);z-index:9;
    padding:150px 40px 0;flex-direction:column;gap:0}
  #result.show{display:flex}
  #result h1{margin:0 0 6px;font-size:64px;letter-spacing:10px;text-align:center;
    color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.9)}
  #result h1.win{color:#ffd98a}
  #result h1.lose{color:#ff8a75}
  #result .sub{text-align:center;color:var(--dim);font-size:20px;margin-bottom:26px}
  #result .card{background:rgba(23,26,31,.92);border:1px solid #333c48;border-radius:14px;
    padding:18px 22px;font-size:21px;line-height:1.85}
  #result .card .r{display:flex;justify-content:space-between;gap:16px}
  #result .card .r span:first-child{color:var(--dim)}
  #result .card .r b{color:#fff}
  #result .card .r .up{color:#8ef0a8}
  #result .card .r .down{color:#ff9c8a}
  #result .hr{height:1px;background:#2a2f37;margin:12px 0}
  #result .btns{display:flex;gap:14px;margin-top:26px}
  #result .btns button{flex:1;padding:18px 0;font-size:24px}
</style>""")

# ---- HTML ----
anchor = '    <div id="panel">'
assert anchor in t
t = t.replace(anchor, """    <div id="result">
      <h1 id="rTitle">—</h1>
      <div class="sub" id="rSub">—</div>
      <div class="card" id="rCard"></div>
      <div class="btns">
        <button class="primary" id="rAgain">再 战 一 局</button>
        <button id="rReset">重 置</button>
      </div>
    </div>

    <div id="panel">""")

# ---- JS：档案 ----
anchor2 = """  var armed = 0;            // 待选落点的技能 seq（0 = 未选中）"""
assert anchor2 in t
t = t.replace(anchor2, """  // ---------------------------------------------------------------- 指挥官档案
  // 一局 → 结算 → 升级 → 再来一局，等级带着走（localStorage 持久化）
  var PROFILE_KEY = 'sanguo_proto_profile_v1';
  function defaultProfile() { return { level: 1, exp: 0, merit: 0, wins: 0, losses: 0 }; }
  function loadProfile() {
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return defaultProfile();
      var o = JSON.parse(raw);
      return { level: o.level || 1, exp: o.exp || 0, merit: o.merit || 0,
               wins: o.wins || 0, losses: o.losses || 0 };
    } catch (e) { return defaultProfile(); }
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
  }
  var profile = loadProfile();

  var armed = 0;            // 待选落点的技能 seq（0 = 未选中）""")

# ---- build() 用档案 ----
old_gen = """        A: { formation: +formA.value, troop: TROOPS[+troopA.value], morale: 60, general: { str: 90, int: 80, hp: 100 } },
        B: { formation: +formB.value, troop: TROOPS[+troopB.value], morale: 60, general: { str: 80, int: 70, hp: 100 } }"""
assert old_gen in t
t = t.replace(old_gen, """        A: { formation: +formA.value, troop: TROOPS[+troopA.value], morale: 60,
             general: { str: 90, int: 80, hp: 100, level: profile.level, exp: profile.exp,
                        merit: profile.merit, wins: profile.wins, losses: profile.losses } },
        B: { formation: +formB.value, troop: TROOPS[+troopB.value], morale: 60,
             general: { str: 80, int: 70, hp: 100, level: Math.max(1, profile.level - 1) } }""")

# ---- 结算与浮层函数 ----
anchor3 = "  // ---------------------------------------------------------------- 循环"
assert anchor3 in t
t = t.replace(anchor3, """  // ---------------------------------------------------------------- 结算
  var resultEl = document.getElementById('result');
  function showResult() {
    var s = C.settle(world);
    var win = s.winner === 'A';
    var g = world.sides.A.general;
    var meLost = s.kills.B, foeLost = s.kills.A;

    document.getElementById('rTitle').textContent = win ? '大 獲 全 勝' : '我 軍 戰 敗';
    document.getElementById('rTitle').className = win ? 'win' : 'lose';
    document.getElementById('rSub').textContent =
      s.modeName + ' · 用时 ' + s.durationSec + ' 秒 · 敵將 ' + (win ? '敗走' : '得勝');

    var rows = [];
    function row(k, v, cls) {
      rows.push('<div class="r"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>');
    }
    row('我軍損失 / 敵軍損失', meLost + ' / ' + foeLost);
    row('戰功分', '+' + s.score.A + ' <span style="color:#8a8f98;font-size:16px">（擊殺 ' +
        (win ? foeLost : meLost) + ' 兵 ×6 ＋ 敵將 Lv' + world.sides.B.general.level + ' ×' + (s.mode === 1 ? 51 : 34) + '）</span>');
    row('獲得經驗', '+' + s.expGain.A);
    row('功勳', '+' + s.meritGain + '（總 ' + g.merit + '）');
    rows.push('<div class="hr"></div>');
    row('等級', 'Lv ' + g.level + (s.levelUp && s.levelUp.A ? ' <span class="up">↑' + s.levelUp.A.level + '</span>' : ''));
    if (s.levelUp && s.levelUp.A) {
      row('升級成長', '<span class="up">體力上限 +' + s.levelUp.A.hpUp + ' · 技力上限 +' + s.levelUp.A.mpUp +
          ' · 帶兵上限 ' + s.levelUp.A.troopsCap + '</span>');
    }
    row('經驗', g.exp + ' / ' + s.nextLevelAt + '（距下一級）');
    row('戰績', g.wins + ' 勝 ' + g.losses + ' 敗');
    document.getElementById('rCard').innerHTML = rows.join('');

    profile = { level: g.level, exp: g.exp, merit: g.merit, wins: g.wins, losses: g.losses };
    saveProfile(profile);
    resultEl.classList.add('show');
  }
  function hideResult() { resultEl.classList.remove('show'); }

  document.getElementById('rAgain').addEventListener('click', function () { hideResult(); build(); });
  document.getElementById('rReset').addEventListener('click', function () {
    profile = defaultProfile(); saveProfile(profile);
    hideResult(); build();
  });

  // ---------------------------------------------------------------- 循环""")

# ---- over 时弹结算 ----
old_over = """      if (world.over) {
        running = false; runBtn.textContent = '开战';
        toastMsg(world.winner === 'A' ? '胜' : '败');
      }"""
assert old_over in t
t = t.replace(old_over, """      if (world.over) {
        running = false; runBtn.textContent = '开战';
        if (!world.settled) showResult();
      }""")

# ---- build() 里清掉结算浮层 ----
t = t.replace("    acc = 0; running = false; runBtn.textContent = '开战'; armed = 0; floaters = [];",
              "    acc = 0; running = false; runBtn.textContent = '开战'; armed = 0; floaters = [];\n    hideResult();")

# ---- 面板显示等级 ----
t = t.replace("""    stat.innerHTML =
      '兵力 <b style="color:var(--blue2)">' + me.aliveCount + '</b>""",
"""    stat.innerHTML =
      '<span class="k">Lv' + g.level + '</span> · ' +
      '兵力 <b style="color:var(--blue2)">' + me.aliveCount + '</b>""")
p.write_text(t, encoding='utf-8')
print('ui patched, lines', len(t.splitlines()))
