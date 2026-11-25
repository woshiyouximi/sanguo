import pathlib
p = pathlib.Path(r'F:\sanguo\proto\core.js')
t = p.read_text(encoding='utf-8')
old = """      if (n === 0 || !w.sides[s].general.alive) {
        w.over = true;
        w.winner = s === 'A' ? 'B' : 'A';
      }"""
new = """      // 兵打完即分胜负（原作：兵尽则主将败走）；主将阵亡同样立刻结束
      if (n === 0 || !w.sides[s].general.alive) {
        w.over = true;
        w.winner = s === 'A' ? 'B' : 'A';
        w.endReason = n === 0 ? 'troops' : 'general';
      }"""
assert old in t
t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('over condition patched')
