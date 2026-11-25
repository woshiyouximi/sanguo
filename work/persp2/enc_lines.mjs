import { readFileSync } from 'node:fs';

const dec = new TextDecoder('utf-8', { fatal: true });
for (const p of ['game/src/core/battle.ts', 'game/src/view/layout.ts']) {
  const buf = readFileSync(p);
  // 按 0x0A 切行，逐行试严格解码
  let start = 0;
  let bad = 0;
  const badLines = [];
  for (let i = 0; i <= buf.length; i++) {
    if (i === buf.length || buf[i] === 0x0a) {
      const line = buf.subarray(start, i);
      try {
        dec.decode(line);
      } catch {
        bad++;
        if (badLines.length < 8) badLines.push(start);
      }
      start = i + 1;
    }
  }
  console.log(`${p}: badLines=${bad} totalBytes=${buf.length}`);
  for (const off of badLines) {
    const end = buf.indexOf(0x0a, off);
    const raw = buf.subarray(off, end < 0 ? buf.length : end);
    console.log(`  line@${off}: ${JSON.stringify(raw.toString('latin1').slice(0, 120))}`);
  }
}
