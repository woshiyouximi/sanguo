import { readFileSync } from 'node:fs';

function hex(b, n = 40) {
  return [...b.subarray(0, n)].map((x) => x.toString(16).padStart(2, '0')).join(' ');
}
for (const p of ['game/src/core/battle.ts', 'game/src/view/layout.ts', 'game/src/core/field.ts', 'game/src/view/projection.ts']) {
  const buf = readFileSync(p);
  let utf8ok = true;
  let errAt = -1;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    utf8ok = false;
    const m = /position (\d+)/.exec(String(e.message));
    errAt = m ? Number(m[1]) : -1;
  }
  const nonAscii = [...buf].filter((b) => b >= 0x80).length;
  const asciiQ = [...buf].filter((b) => b === 0x3f).length;
  console.log(`${p}\n  bytes=${buf.length} nonAscii=${nonAscii} asciiQ=${asciiQ} validUTF8=${utf8ok} first64=${hex(buf, 64)}`);
  if (!utf8ok) {
    const s = Math.max(0, errAt - 30);
    console.log(`  utf8 err at byte ${errAt}; ctx bytes=${hex(buf.subarray(s, s + 60))}`);
    console.log(`  ctx latin1=${JSON.stringify(buf.subarray(s, s + 60).toString('latin1'))}`);
    // 是否含「战斗核心」的 UTF-8
    const needle = Buffer.from('战斗核心', 'utf8');
    console.log(`  contains utf8 战斗核心: ${buf.indexOf(needle) >= 0};  contains gbk 战斗核心: ${buf.indexOf(Buffer.from('战斗核心', 'latin1')) >= 0}`);
  }
}
