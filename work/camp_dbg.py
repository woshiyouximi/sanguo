import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
t = p.read_text(encoding='utf-8')
old = "render();\n</script>"
new = """// 调试参数：?sel=<城名> 预选；?adv=<n> 连推 n 个月（截图/自测用）
const dq = new URLSearchParams(location.search);
if (dq.get('sel')) selected = dq.get('sel');
const advN = Number.parseInt(dq.get('adv') || '0', 10) || 0;
for (let i = 0; i < advN; i++) {
  save.month += 1;
  save.gold += income();
  for (const n of save.owned) {
    const st = cityState(n);
    st.pop = Math.floor(st.pop * 1.01);
    st.money = Math.floor(st.money * 1.01) + 60;
  }
}
if (advN) saveNow();

render();
</script>"""
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('debug params added')
