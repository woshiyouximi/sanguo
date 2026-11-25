/**
 * KEEP_PATCHES 对账：从 `work/cocos_sync/sync_core3.mjs` 的 KEEP_PATCHES 表里抽出
 * 每条 patch 的 id / file / replace（不含注释的实质代码行），再到 Cocos 侧文件里核对
 * 该行是否**仍然存在**（= patch 仍在），以及 web 侧对应 find 行是否已不存在。
 * 只读，不写 game/**。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'work', 'cocos_sync', 'sync_core3.mjs');
const COC = path.join(ROOT, 'game', 'cocos', 'assets', 'scripts', 'core');
const WEB = path.join(ROOT, 'game', 'src', 'core');

const text = fs.readFileSync(SRC, 'utf8');
const start = text.indexOf('KEEP_PATCHES');
const body = text.slice(start);

/** 取一个字面量（'...' / "..." / `...`），返回 { value, end } */
function readLiteral(s, i) {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  const q = s[i];
  if (q === "'" || q === '"') {
    let j = i + 1;
    let out = '';
    while (j < s.length) {
      if (s[j] === '\\') { out += s[j + 1] === 'n' ? '\n' : s[j + 1]; j += 2; continue; }
      if (s[j] === q) return { value: out, end: j + 1, quote: q };
      out += s[j];
      j += 1;
    }
    return { value: out, end: j, quote: q };
  }
  if (q === '`') {
    let j = i + 1;
    let out = '';
    while (j < s.length) {
      if (s[j] === '\\') { out += s[j + 1] === 'n' ? '\n' : s[j + 1]; j += 2; continue; }
      if (s[j] === '`') return { value: out, end: j + 1, quote: q };
      out += s[j];
      j += 1;
    }
    return { value: out, end: j, quote: q };
  }
  return null;
}

const patches = [];
let pos = 0;
while (true) {
  const idAt = body.indexOf("id: '", pos);
  if (idAt < 0) break;
  const idEnd = body.indexOf("'", idAt + 5);
  const id = body.slice(idAt + 5, idEnd);
  const nextId = body.indexOf("id: '", idEnd);
  const block = body.slice(idEnd, nextId < 0 ? body.length : nextId);
  const fAt = block.indexOf("file: '");
  const file = fAt < 0 ? null : block.slice(fAt + 7, block.indexOf("'", fAt + 7));
  const rAt = block.search(/(^|\n)\s*to:/);
  let replace = null;
  if (rAt >= 0) {
    let i = block.indexOf('to:', rAt) + 3;
    while (i < block.length && /\s/.test(block[i])) i += 1;
    if (block[i] === '[') {
      i += 1;
      const parts = [];
      while (i < block.length && block[i] !== ']') {
        if (/\s/.test(block[i]) || block[i] === ',') { i += 1; continue; }
        const lit = readLiteral(block, i);
        if (!lit) break;
        parts.push(lit.value);
        i = lit.end;
      }
      replace = parts.join('\n');
    } else {
      const lit = readLiteral(block, i);
      if (lit) replace = lit.value;
    }
  }
  patches.push({ id, file, replace });
  pos = idEnd;
}

/** 取最长得体的一行代码（跳过纯注释/空行）——最长行最能区分 patch 是否还在 */
function codeLine(s) {
  if (!s) return null;
  const lines = s.split('\n').map((x) => x.trim()).filter(Boolean)
    .filter((l) => !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
  if (!lines.length) return null;
  return lines.reduce((a, b) => (b.length > a.length ? b : a));
}

const rows = [];
for (const p of patches) {
  const rel = p.file ? p.file.replace(/^core\//, '') : null;
  const cocFile = rel ? path.join(COC, rel) : null;
  const webFile = rel ? path.join(WEB, rel) : null;
  const needle = codeLine(p.replace);
  const hasCoc = cocFile && fs.existsSync(cocFile) && needle ? fs.readFileSync(cocFile, 'utf8').includes(needle) : null;
  const hasWeb = webFile && fs.existsSync(webFile) && needle ? fs.readFileSync(webFile, 'utf8').includes(needle) : null;
  rows.push({ id: p.id, file: rel, needle, hasCoc, hasWeb });
}

console.log('| # | 文件 | patch 后代码行（前 90 字） | Cocos 命中 | web 命中 | 结论 |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
  const verdict = r.hasCoc === null ? '未抽到 replace' : r.hasCoc ? 'patch 仍在' : 'patch 已被覆盖/丢失';
  console.log(`| ${r.id} | ${r.file ?? '?'} | ${(r.needle ?? '(空)').slice(0, 90)} | ${r.hasCoc === null ? '?' : r.hasCoc ? '✅' : '❌'} | ${r.hasWeb === null ? '?' : r.hasWeb ? '⚠️也有' : '✅无'} | ${verdict} |`);
}
const ok = rows.filter((r) => r.hasCoc === true).length;
console.log(`\n合计 ${rows.length} 条 KEEP_PATCHES，Cocos 侧仍命中 ${ok} 条`);
