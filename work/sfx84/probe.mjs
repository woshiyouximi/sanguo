import fs from 'node:fs';
const dis = fs.readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8');
const strs = new Set();
for (const m of dis.matchAll(/PUSHS\s+\d+\s+;\s+"([^"]*)"/g)) strs.add(m[1]);
console.log('unique PUSHS strings', strs.size);
const snd = [...strs].filter((s) => /snd/i.test(s)).sort();
console.log('snd-like', snd.length, JSON.stringify(snd));
for (const p of ['F:/sanguo/extract/json/magic.json', 'F:/sanguo/game/data/magics.json']) {
  if (!fs.existsSync(p)) { console.log('missing', p); continue; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const a = Array.isArray(j) ? j : (j.magics || j.MAGIC || Object.values(j)[0]);
  console.log(p, 'n=', a.length, 'keys=', Object.keys(a[0]).join(','));
  console.log(JSON.stringify(a[0]).slice(0, 600));
}
