import fs from 'node:fs';
const DIR = 'F:/sanguo/game/cocos/assets/scripts/';
const pats = ['#5E4C2C', "'#000000', '#272A2D'", '#F2DCA8', 'edgeBands({ x: 0, y: 0, w: DESIGN_W'];
for (const f of ['CampaignRoot', 'CityPanel', 'ItemsPanel', 'DeployRoot']) {
  const lines = fs.readFileSync(DIR + f + '.ts', 'utf8').split('\n');
  console.log('== ' + f);
  for (const p of pats) {
    const hits = [];
    lines.forEach((l, i) => { if (l.includes(p)) hits.push((i + 1) + ': ' + l.trim().slice(0, 92)); });
    if (hits.length) console.log('  [' + p + ']\n    ' + hits.slice(0, 4).join('\n    '));
  }
}
