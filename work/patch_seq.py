import pathlib
core = pathlib.Path(r'F:\sanguo\proto\core.js')
t = core.read_text(encoding='utf-8')
t = t.replace("""  var SKILL_KIND = {
    1:   { kind: 'heal',   radius: 0 },
    550: { kind: 'strike', radius: 1.8 },
    104: { kind: 'aoe',    radius: 3.6 }
  };
  var AI_SKILLS = [550, 104];    // 电脑会用的技能（按 MP 从低到高尝试）""",
"""  var SKILL_KIND = {
    1:   { kind: 'heal',   radius: 0 },     // 命療術 MP20 ATK30
    50:  { kind: 'strike', radius: 1.8 },   // 半月斬 MP22 ATK12
    104: { kind: 'aoe',    radius: 3.6 }    // 神鬼亂舞 MP47 ATK60
  };
  var AI_SKILLS = [50, 104];     // 电脑会用的技能（按 MP 从低到高尝试）""")
core.write_text(t, encoding='utf-8')

test = pathlib.Path(r'F:\sanguo\proto\test_core.js')
s = test.read_text(encoding='utf-8')
s = s.replace("const M_HEAL = 1, M_STRIKE = 550, M_AOE = 104;", "const M_HEAL = 1, M_STRIKE = 50, M_AOE = 104;")
test.write_text(s, encoding='utf-8')
print('seq fixed')
