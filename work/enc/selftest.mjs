#!/usr/bin/env node
// 编码守门的自证脚本：造一批「该抓的 / 不该抓的」样本，跑 scan_utf8.mjs，断言它的判定与退出码。
//
//   node work/enc/selftest.mjs
//
// 全部样本都在 work/enc/_selftest/ 里建、跑完删干净；不碰任何源码。
// 用法场景：改了 scan_utf8.mjs 之后跑一遍，确认守门本身没被改坏。

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN = join(HERE, 'scan_utf8.mjs');
const DIR = join(HERE, '_selftest');

const FFFD = '\uFFFD';
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

let pass = 0;
let fail = 0;
const rows = [];

function run() {
  const r = spawnSync(process.execPath, [SCAN, DIR, '--max=3'], { encoding: 'utf8' });
  if (r.error) throw r.error;
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

/** 建样本 -> 跑 -> 断言 -> 删样本。 */
function check(name, files, expect) {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  for (const [fn, content] of Object.entries(files)) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    writeFileSync(join(DIR, fn), buf);
  }
  const r = run();
  const problems = [];
  if (r.code !== expect.code) problems.push(`exit ${r.code} != ${expect.code}`);
  for (const needle of expect.has || []) {
    if (!r.out.includes(needle)) problems.push(`output missing "${needle}"`);
  }
  for (const needle of expect.hasNot || []) {
    if (r.out.includes(needle)) problems.push(`output should not contain "${needle}"`);
  }
  if (problems.length === 0) {
    pass += 1;
    rows.push(`PASS  ${name}  (exit ${r.code})`);
  } else {
    fail += 1;
    rows.push(`FAIL  ${name}  ${problems.join('; ')}`);
    rows.push('---- scan output ----');
    rows.push(r.out.trimEnd());
    rows.push('--------------------');
  }
  return r;
}

const CLEAN_TS = '// 干净的中文注释：这里不该报任何东西\nexport const a = 1;\n';

// 1. 干净文件 -> 0 BAD / exit 0
check('clean .ts', { 'ok.ts': CLEAN_TS }, { code: 0, has: ['0 BAD'], hasNot: ['BAD '] });

// 2. 一个 U+FFFD（CP936 事故的最小特征）-> BAD / exit 1
check(
  'one U+FFFD in .ts',
  { 'bad.ts': `// 保真校验${FFFD}?· 期望值生成器\nexport const a = 1;\n` },
  { code: 1, has: ['BAD ', 'bad.ts:1:', 'U+FFFD'] },
);

// 3. 非法 UTF-8 字节（截断的 3 字节序列）-> BAD / exit 1
check(
  'invalid utf-8 bytes in .ts',
  { 'bad_bytes.ts': Buffer.concat([Buffer.from('// '), Buffer.from([0xe4, 0xb8]), Buffer.from('\nexport const a = 1;\n')]) },
  { code: 1, has: ['BAD ', 'bad_bytes.ts:1:', 'invalid UTF-8'] },
);

// 4. .ts 带 BOM -> 只 WARN，退出码仍 0
check('BOM on .ts -> WARN only', { 'bom.ts': Buffer.concat([BOM, Buffer.from(CLEAN_TS, 'utf8')]) }, {
  code: 0,
  has: ['WARN ', 'UTF-8 BOM on .ts'],
});

// 5. .ps1 带 BOM -> 正常，不报（PS 5.1 需要 BOM 才认中文）
check('BOM on .ps1 -> normal', { 'bom.ps1': Buffer.concat([BOM, Buffer.from('# 中文注释\nWrite-Host 1\n', 'utf8')]) }, {
  code: 0,
  hasNot: ['WARN '],
});

// 6. UTF-8 被当 GBK 读的乱码（合法 UTF-8、0 个 U+FFFD）-> WARN mojibake
check(
  'gbk mojibake -> WARN',
  { 'moji.ts': `// 淇濈湡鏍￠獙缃?路 鏈熸湜鍊肩敓鎴愬櫒\nexport const a = 1;\n` },
  { code: 0, has: ['WARN ', 'mojibake'] },
);

// 7. 二进制/无关扩展名不参与判定
check('irrelevant extension ignored', { 'blob.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]) }, {
  code: 0,
  hasNot: ['BAD '],
});

// 8. 修好就立刻转绿：坏文件删掉后 exit 0（门禁不能有记忆）
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
writeFileSync(join(DIR, 'bad.ts'), `// 坏${FFFD}?\n`, 'utf8');
const before = run();
writeFileSync(join(DIR, 'bad.ts'), '// 好了，正常中文\n', 'utf8');
const after = run();
if (before.code === 1 && after.code === 0) {
  pass += 1;
  rows.push(`PASS  fix clears the gate  (before exit ${before.code} -> after exit ${after.code})`);
} else {
  fail += 1;
  rows.push(`FAIL  fix clears the gate  (before ${before.code}, after ${after.code})`);
  rows.push(before.out.trimEnd());
  rows.push(after.out.trimEnd());
}

// 收尾：不留垃圾
rmSync(DIR, { recursive: true, force: true });
if (existsSync(DIR)) {
  fail += 1;
  rows.push('FAIL  cleanup: _selftest still exists');
}

for (const r of rows) console.log(r);
console.log(`selftest: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
