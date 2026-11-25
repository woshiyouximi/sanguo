import fs from 'node:fs';
const blocks = JSON.parse(fs.readFileSync('F:/sanguo/work/blocks_44d450.json', 'utf8'));
const execOf = (b) => b.idx + 2; // block idx0 (va 0x44D567) == exec 2
const want = new Set([7, 8, 9, 12, 15, 18, 21, 24, 27, 30, 33, 34, 35, 38, 41, 44, 45, 46, 47, 48, 49, 50, 53, 56, 57, 58, 61, 64, 65]);
for (const b of blocks) {
  const ex = execOf(b);
  if (!want.has(ex)) continue;
  console.log('\n=== exec ' + ex + ' @ ' + b.va + ' ===');
  const keep = b.body.filter((l) => /\[.*\+ 0x[0-9a-f]+\]|\[.*- 0x[0-9a-f]+\]|0x[0-9a-f]{2,}\b/.test(l) && !/^0044|^0045/.test('') );
  console.log(keep.map((l) => l.replace(/ {2,}/g, ' ').replace(/^(\S+) (\S+) /, '$1 $2 ')).join('\n'));
}
