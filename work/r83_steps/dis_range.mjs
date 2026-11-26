// R83: dump an address range from the full .text disassembly TSV.
// usage: node dis_range.mjs 0x43B574 0x43B670 [file]
import { readFileSync } from 'node:fs';

const TSV = process.argv[4] ?? 'F:/sanguo/work/orig_numbers/text_dis.tsv';
const lo = parseInt(process.argv[2], 16);
const hi = parseInt(process.argv[3], 16);

const lines = readFileSync(TSV, 'utf8').split(/\r?\n/);
let shown = 0;
for (const ln of lines) {
  if (!ln) continue;
  const a = parseInt(ln.slice(0, 8), 16);
  if (!Number.isFinite(a)) continue;
  if (a < lo) continue;
  if (a > hi) break;
  // addr \t bytes \t mnemonic \t operands \t comment
  const p = ln.split('\t');
  const m = (p[2] ?? '').padEnd(9);
  const o = (p[3] ?? '');
  process.stdout.write(`${p[0]}  ${(p[1] ?? '').padEnd(20)} ${m} ${o}\n`);
  shown++;
}
process.stdout.write(`-- ${shown} instructions in [${process.argv[2]}, ${process.argv[3]}]\n`);
