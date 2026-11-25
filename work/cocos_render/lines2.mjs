import fs from 'node:fs';
const f = 'F:/sanguo/game/cocos/assets/scripts/ItemsPanel.ts';
const lines = fs.readFileSync(f, 'utf8').split('\n');
const pats = ['scrollTo(', '#3A4759', 'hBands(', 'pagedMode = true', 'pagedMode = false', 'thumbH', 'launch', 'private pagedMode'];
for (const p of pats) {
  const out = [];
  lines.forEach((l, i) => { if (l.includes(p)) out.push((i + 1) + ': ' + l.trim().slice(0, 90)); });
  console.log('== ' + p);
  console.log(out.slice(0, 6).join('\n'));
}
