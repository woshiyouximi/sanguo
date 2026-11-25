// v6：map5 的深链升级（X -> A2）
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/map5.json', 'utf8'));
const disk = new Set(fs.readdirSync('F:/sanguo/game/web/assets/audio/sfx').filter((f) => /\.mp3$/.test(f)).map((f) => f.replace(/\.mp3$/, '')));
let upg = [];
for (const r of rows) {
  if (r.grade !== 'X') continue;
  const want = 'm' + r.dir + 'snd';
  const hit = (r.deep ?? []).filter((n) => n.startsWith(want)).sort();
  if (hit.length) { r.snd = hit[0]; r.grade = 'A2'; r.via = '深链(depth<=4) ' + hit[0]; upg.push(r.seq); }
}
const bad = rows.filter((r) => r.snd && !disk.has(r.snd)).map((r) => r.seq + ':' + r.snd);
const cnt = {}; for (const r of rows) cnt[r.grade] = (cnt[r.grade] ?? 0) + 1;
console.log('升级为 A2:', JSON.stringify(upg), '等级', JSON.stringify(cnt), '磁盘缺失', JSON.stringify(bad));
console.log('仍为 X:', rows.filter((r) => r.grade === 'X').map((r) => r.seq + ' ' + r.name + ' dir' + r.dir + ' -> ' + r.snd).join(' | '));
console.log('无音效行:', rows.filter((r) => !r.snd).map((r) => r.seq).join(','));
fs.writeFileSync('F:/sanguo/work/sfx84/map6.json', JSON.stringify(rows, null, 1));
