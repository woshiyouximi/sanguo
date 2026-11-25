// A0b：清掉上一局残留（保留存檔槽），重载到標題頁，作為乾淨驗收起點
import fs from 'node:fs';
import path from 'node:path';

export default async function ({ evaluate, sleep, log, OUTDIR }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const before = await ev(`(() => { const ks=[]; for (let i=0;i<localStorage.length;i+=1) ks.push(localStorage.key(i)); return JSON.stringify({ keys: ks }); })()`);
  const cleared = await ev(`(() => {
    const keep = /slot/i;
    const drop = [];
    for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (!keep.test(k)) drop.push(k); }
    drop.forEach((k) => localStorage.removeItem(k));
    return JSON.stringify({ dropped: drop });
  })()`);
  await ev(`(() => { location.reload(); return JSON.stringify({ ok: true }); })()`);
  await sleep(9000);
  const after = await ev(`(() => { const ks=[]; for (let i=0;i<localStorage.length;i+=1) ks.push(localStorage.key(i)); return JSON.stringify({ keys: ks, scene: cc.director.getScene() ? cc.director.getScene().name : '?', frames: cc.director.getTotalFrames() }); })()`);
  const out = { at: new Date().toISOString(), before, cleared, after };
  fs.writeFileSync(path.join(OUTDIR, 'r0b.json'), JSON.stringify(out, null, 1), 'utf8');
  log('wrote r0b.json');
  return out;
}
