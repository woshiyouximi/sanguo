import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync('F:/sanguo/work/sfx84/final3.json', 'utf8'));
const want = process.argv.slice(2).map(Number);
for (const r of j.rows) {
  if (want.length && !want.includes(r.seq)) continue;
  console.log('=== #' + r.seq, r.name, r.fx_func, 'dir=' + r.dir);
  for (const s of r.scriptMdetail) console.log('   S', s.name, '@' + s.func, 'd' + s.depth, s.path.join(' > '));
  for (const s of r.scriptOtherDetail) console.log('   O', s.name, '@' + s.func, 'syscall=' + s.syscall.toString(16));
  if (r.createdThing.length) console.log('   things', r.createdThing.join(','));
  for (const c of r.createdM) console.log('   C', c.snd, '<' + c.seq + '>', c.dir, c.field);
  for (const c of r.dirM) console.log('   D', c.snd, '<' + c.seq + '>', c.dir, c.field);
}
