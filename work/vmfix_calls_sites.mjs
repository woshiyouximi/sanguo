// 静态统计：dis 里每个 CALLS 站点指向的函数 argc（影响面）。
import { readFileSync } from 'node:fs';

for (const f of ['F:/sanguo/export/script/magic_so.dis.txt', 'F:/sanguo/export/script/system_so.dis.txt']) {
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    console.log('skip', f);
    continue;
  }
  const lines = text.split(/\r?\n/);
  const argcOf = new Map();
  for (const ln of lines) {
    const m = /;\s*func\s+#\d+\s+(\S+)\s+id=\S+\s+argc=(\d+)/.exec(ln);
    if (m) argcOf.set(m[1], Number(m[2]));
  }
  const perSite = new Map();
  const twoArgNames = new Map();
  let lastName = null;
  let sites = 0;
  for (const ln of lines) {
    const n = /PUSHS\s+\d+\s*;\s*"([^"]+)"/.exec(ln);
    if (n) lastName = n[1];
    if (/\bCALLS\b/.test(ln)) {
      sites++;
      const argc = lastName ? argcOf.get(lastName) : undefined;
      const key = argc === undefined ? `?(${lastName})` : String(argc);
      perSite.set(key, (perSite.get(key) ?? 0) + 1);
      if (argc !== undefined && argc < 4) twoArgNames.set(lastName, (twoArgNames.get(lastName) ?? 0) + 1);
    }
  }
  console.log('==', f);
  console.log('函数数', argcOf.size, 'CALLS 站点', sites);
  console.log('按 argc:', [...perSite.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, v]) => `${k}→${v}`).join('  '));
  console.log('argc<4 的被调函数:', [...twoArgNames.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(' '));
}
