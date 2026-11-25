import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/final3.json', 'utf8'));
const rows = j.rows;
const fmt = (r) => {
  const m = r.scriptMdetail[0];
  return m ? `${m.name} @${m.func}+0x${m.addr.toString(16)} d${m.depth}` : '';
};
for (const r of rows) {
  const all = [...new Set([...r.scriptM, ...r.createdM.map((x) => x.snd), ...r.dirM.map((x) => x.snd), ...r.scriptOther])];
  console.log([
    String(r.seq).padStart(3, '0'), r.name.padEnd(6, '　'),
    'dir=' + r.dir, r.fx_func.padEnd(22),
    'S=' + (fmt(r) || '-'),
    'C=' + (r.createdM.map((x) => x.snd + '<' + x.seq + '>').join(',') || '-'),
    'D=' + ([...new Set(r.dirM.map((x) => x.snd))].join(',') || '-'),
    'O=' + (r.scriptOther.join(',') || '-'),
    'things=' + r.createdThing.length,
  ].join(' | '));
}
