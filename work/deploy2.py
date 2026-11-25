import pathlib
# 1) deploy.html 加"战前情报"块填满空隙
p = pathlib.Path(r'F:\sanguo\game\web\deploy.html')
t = p.read_text(encoding='utf-8')
old = """    <div class="sec">
      <h2>兵 力</h2>"""
new = """    <div class="sec">
      <h2>戰 前 情 報</h2>
      <div class="sub" id="intel" style="line-height:1.6">—</div>
    </div>
    <div class="sec">
      <h2>兵 力</h2>"""
assert old in t
t = t.replace(old, new, 1)
old2 = """  $('gosub').textContent = `${gen.NAME} · ${TROOP_NAMES[troop] ?? '?'} · ${FORM_NAMES[form] ?? '?'} · ${soldiers} 兵`;"""
new2 = """  $('gosub').textContent = `${gen.NAME} · ${TROOP_NAMES[troop] ?? '?'} · ${FORM_NAMES[form] ?? '?'} · ${soldiers} 兵`;
  const net = tb + fb;
  $('intel').innerHTML =
    `敵軍 ${garrison} 兵（騎兵 0）· 防御 ${city.DEFENSE ?? '—'}<br>` +
    `我方 ${soldiers} 兵 · 主將 ${gen.NAME}（武 ${gen.STR} / 智 ${gen.INT}）<br>` +
    `相剋淨值合計 <b style="color:${net >= 0 ? '#7FD1A8' : '#E08A7A'}">${net > 0 ? '+' : ''}${net}</b>` +
    `（原作命中 = 150 + 相剋 + 士氣/疲勞修正，300 制隨機）`;"""
assert old2 in t
t = t.replace(old2, new2, 1)
p.write_text(t, encoding='utf-8')

# 2) campaign 的出征改走 deploy.html
p2 = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
t2 = p2.read_text(encoding='utf-8')
old3 = """  if (act === 'march') {
    if (distFromOwned(selected) !== 1) return toast('不接壤：只能打與我方相鄰的城。');
    const c = ALL.find((x) => x.NAME === selected);"""
new3 = """  if (act === 'march') {
    if (distFromOwned(selected) !== 1) return toast('不接壤：只能打與我方相鄰的城。');
    location.href = './deploy.html?city=' + encodeURIComponent(selected);
    return;
  }
  if (act === 'march_direct') {
    const c = ALL.find((x) => x.NAME === selected);"""
assert old3 in t2
t2 = t2.replace(old3, new3, 1)
p2.write_text(t2, encoding='utf-8')
print('deploy route + intel')
