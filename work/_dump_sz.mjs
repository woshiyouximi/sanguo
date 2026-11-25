import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';

function pngSize(p) {
  const fd = openSync(p, 'r');
  const buf = Buffer.alloc(33);
  readSync(fd, buf, 0, 33, 0);
  closeSync(fd);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

for (const d of process.argv.slice(2)) {
  console.log('==', d);
  for (const f of readdirSync(d).filter((x) => x.toLowerCase().endsWith('.png')).sort()) {
    const p = join(d, f);
    const { w, h } = pngSize(p);
    console.log(`${f.padEnd(16)} ${String(w).padStart(5)}x${String(h).padEnd(5)} ${String(statSync(p).size).padStart(7)}`);
  }
}
