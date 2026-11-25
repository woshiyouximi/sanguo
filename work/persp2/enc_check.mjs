import { readFileSync } from 'node:fs';

for (const p of ['game/src/core/battle.ts', 'game/src/view/layout.ts']) {
  const buf = readFileSync(p);
  const s = new TextDecoder('gbk', { fatal: false }).decode(buf);
  let fffd = 0;
  let q = 0;
  const ctx = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\uFFFD') {
      fffd++;
      if (ctx.length < 12) ctx.push(`FFFD@${i}: ${JSON.stringify(s.slice(Math.max(0, i - 25), i + 25))}`);
    }
    if (s[i] === '?') {
      q++;
      if (ctx.length < 12) ctx.push(`?@${i}: ${JSON.stringify(s.slice(Math.max(0, i - 25), i + 25))}`);
    }
  }
  // 检查「能无损还原为原 UTF-8 字节」的判定：把 s 按 gbk 编码回去，与 buf 比较
  console.log(`${p}: bytes=${buf.length} chars=${s.length} FFFD=${fffd} totalQ=${q}`);
  for (const c of ctx) console.log('   ' + c);
}
