import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
t = p.read_text(encoding='utf-8')

# 1) 建邻接图 + 距离
anchor = "const mine = (n) => save.owned.includes(n);"
add = """const mine = (n) => save.owned.includes(n);

// 道路图：只收非哨兵路径（Length < 30000），这是原作"可走"的那 77 条
const adj = new Map();
for (const c of ALL) adj.set(c.NAME, new Set());
for (const p of scenario.paths || []) {
  if ((p.Length || 0) >= 30000) continue;
  if (!adj.has(p.Start) || !adj.has(p.End)) continue;
  adj.get(p.Start).add(p.End);
  adj.get(p.End).add(p.Start);
}
// 从"我方任一城"出发的最少道路数
function distFromOwned(target) {
  const seen = new Set(save.owned);
  let frontier = save.owned.slice();
  let d = 0;
  while (frontier.length && d < 30) {
    if (frontier.includes(target)) return d;
    const next = [];
    for (const n of frontier) {
      for (const m of adj.get(n) || []) if (!seen.has(m)) { seen.add(m); next.push(m); }
    }
    frontier = next; d++;
  }
  return 99;
}"""
assert anchor in t
t = t.replace(anchor, add, 1)

# 2) 选中敌城时，按钮显示距离；不邻接则禁用
old = """  } else if (selected) {
    const st = save.cities[selected];
    const g = commander();
    acts.push(`<div class="btn primary" data-act="march"><span>出 征</span><small>目標 ${selected}${g ? ' · 主將 ' + g.NAME : ''}</small></div>`);"""
new = """  } else if (selected) {
    const g = commander();
    const d = distFromOwned(selected);
    const ok = d === 1;
    acts.push(`<div class="btn primary" data-act="march" ${ok ? '' : 'disabled'}>` +
      `<span>出 征</span><small>${ok
        ? `目標 ${selected}${g ? ' · 主將 ' + g.NAME : ''}`
        : (d >= 99 ? '與我方領土不接壤' : `需 ${d} 段路，先打近的`)}</small></div>`);"""
assert old in t
t = t.replace(old, new, 1)

# 3) 点击时若不可达，toast 提示（禁用按钮不触发 click，这里兜底）
old2 = """  if (act === 'march') {
    const c = ALL.find((x) => x.NAME === selected);"""
new2 = """  if (act === 'march') {
    if (distFromOwned(selected) !== 1) return toast('不接壤：只能打與我方相鄰的城。');
    const c = ALL.find((x) => x.NAME === selected);"""
assert old2 in t
t = t.replace(old2, new2, 1)
p.write_text(t, encoding='utf-8')
print('adjacency wired')
