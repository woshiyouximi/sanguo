// R197 探针 2：把 4 张卡 × 10 欄的 Label 全 dump 出来（核对截图里「張郃 疲勞 41」是不是真值）
const CARDS = `
  var cards = [
    { name: '夏侯淵', str: 91, int: 78, loyal: 44, constancy: 6, isKing: false, from: 'captured',
      predicted: true, chance: 1, tier: 'must', tierText: '可 降', recruitable: true, reason: '節操 6 · 必定歸降',
      level: 12, morale: 88, tire: 41, wins: 7, losses: 3, weapon: '古錠刀', item: '孫子兵法' },
    { name: '張郃', str: 88, int: 76, loyal: 61, constancy: 4, isKing: false, from: 'captured',
      predicted: false, chance: 0.5, tier: 'roll', tierText: '需 再 戰', recruitable: true, reason: '成功率 50%',
      weapon: '短弓' },
    { name: '高覽', str: 80, int: 62, loyal: 12, constancy: 2, isKing: false, from: 'executed',
      predicted: false, chance: 0, tier: 'refuse', tierText: '拒 降', recruitable: false, reason: '節操 2 · 寧死不降' },
    { name: '袁紹', str: 61, int: 70, loyal: 100, constancy: 9, isKing: true, from: 'king',
      predicted: false, chance: 0, tier: 'refuse', tierText: '君 主', recruitable: false, reason: '君主 · 只能放走' }
  ];
`;

export default async function steps({ evaluate, sleep, log }) {
  const ev = async (e) => {
    const v = await evaluate(e);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const r = await ev(String.raw`
(function () {
  var K = cc.js.getClassByName('SurrenderPanel');
  var sc = cc.director.getScene();
  if (!sc || sc.name !== 'Battle') { try { cc.director.loadScene('Battle'); } catch (e) {} return { ok: false, error: 'need-battle' }; }
  var host = sc.getChildByName('Canvas') || sc;
  var node = host.getChildByName('SurrenderPanel') || new cc.Node('SurrenderPanel');
  if (!node.parent) { node.layer = cc.Layers.Enum.UI_2D; node.parent = host; }
  var panel = node.getComponent(K) || node.addComponent(K);
  ${CARDS}
  var state = { ctx: { save: {}, data: {}, home: '鄴', atCity: [], mine: [], king: '曹操', battle: true }, cards: cards, picks: {}, done: false };
  panel.build();
  panel.open(state);
  var out = { labels: [], debug: null, views: null };
  var cells = window.__s197.fields(node);
  var names = ['夏侯淵', '張郃', '高覽', '袁紹', null];
  for (var i = 0; i < 5; i += 1) out.labels.push({ name: names[i], cells: cells[i] });
  try { out.debug = panel.debug().fields; } catch (e) { out.debug = 'ERR ' + e; }
  try {
    var vs = panel.pageViews();
    out.views = vs.map(function (v) {
      return { name: v.name, level: v.level, morale: v.morale, tire: v.tire, wins: v.wins, losses: v.losses, weapon: v.weapon, item: v.item, lossNow: v.lossNow };
    });
  } catch (e) { out.views = 'ERR ' + e; }
  return { ok: true, dump: out };
})()
`);
  if (!r || !r.ok) {
    log('probe', JSON.stringify(r));
    await sleep(300);
    return r;
  }
  for (const row of r.dump.labels) {
    const line = (row.cells || [])
      .map((c) => (c ? c.key + ' ' + c.text + (c.color === '#65707C' ? '(灰)' : '') : '?'))
      .join(' · ');
    log('卡', String(row.name), line);
  }
  log('views', JSON.stringify(r.dump.views));
  log('debug', JSON.stringify(r.dump.debug));
  await sleep(300);
  return r;
}
