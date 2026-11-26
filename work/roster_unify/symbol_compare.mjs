// roster.ts 差異考古：按「頂層符號」逐個比對 web 源 vs Cocos 鏡像。
// 只讀，不改任何東西。輸出 work/roster_unify/symbols_table.md（UTF-8）。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const WEB = join(root, 'game', 'src', 'core', 'roster.ts');
const COCOS = join(root, 'game', 'cocos', 'assets', 'scripts', 'core', 'roster.ts');

const DECL = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|type|interface|class|enum)\s+([A-Za-z_$][\w$]*)/;

function chunks(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    const m = DECL.exec(lines[i]);
    if (m) starts.push({ line: i, name: m[1], exported: /^export\s/.test(lines[i]), text: lines[i] });
  }
  const out = new Map();
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    const end = k + 1 < starts.length ? starts[k + 1].line : lines.length;
    const body = lines.slice(s.line, end).join('\n');
    // 同一個名字只取第一次（避免 type/函數同名之類的重複誤判）
    if (!out.has(s.name)) out.set(s.name, { exported: s.exported, decl: s.text.trim(), body, line: s.line + 1 });
  }
  return out;
}

// 比對用歸一化：丟註釋行/空行，壓縮空白。註釋差異不算「實現不同」。
function norm(body) {
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*') && l !== '*/')
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

const web = chunks(WEB);
const cocos = chunks(COCOS);
const names = Array.from(new Set([...web.keys(), ...cocos.keys()])).sort((a, b) => {
  const la = (web.get(a) ?? cocos.get(a)).line;
  const lb = (web.get(b) ?? cocos.get(b)).line;
  return la - lb;
});

const rows = [];
let same = 0;
let diff = 0;
let onlyWeb = 0;
let onlyCocos = 0;
for (const name of names) {
  const a = web.get(name);
  const b = cocos.get(name);
  let status;
  if (a && !b) {
    status = '只 web 有';
    onlyWeb++;
  } else if (!a && b) {
    status = '只 cocos 有';
    onlyCocos++;
  } else if (norm(a.body) === norm(b.body)) {
    status = '實現相同';
    same++;
  } else {
    status = '實現不同';
    diff++;
  }
  const churn = (() => {
    const sa = new Set(norm(a?.body ?? '').split(' '));
    const sb = new Set(norm(b?.body ?? '').split(' '));
    let add = 0;
    let del = 0;
    for (const t of sb) if (!sa.has(t)) add++;
    for (const t of sa) if (!sb.has(t)) del++;
    return `+${add}/-${del}`;
  })();
  rows.push({
    name,
    status: status + (status === '實現不同' ? `（詞元 ${churn}）` : ''),
    webLine: a ? a.line : '—',
    cocosLine: b ? b.line : '—',
    exported: (a?.exported ?? b?.exported) ? 'export' : 'private',
  });
}

const md = [];
md.push('# roster.ts 頂層符號差異表（自動生成）');
md.push('');
md.push(`- web 源：\`game/src/core/roster.ts\``);
md.push(`- cocos 鏡像：\`game/cocos/assets/scripts/core/roster.ts\``);
md.push(`- 統計：共 ${names.length} 個頂層符號｜實現相同 ${same}｜實現不同 ${diff}｜只 web 有 ${onlyWeb}｜只 cocos 有 ${onlyCocos}`);
md.push('');
md.push('> 判定口徑：去掉註釋行、壓縮空白後逐字比較（註釋差異不算實現不同）。');
md.push('');
md.push('| 符號 | 可見性 | web 行 | cocos 行 | 狀態 |');
md.push('|---|---|---|---|---|');
for (const r of rows) {
  md.push(`| \`${r.name}\` | ${r.exported} | ${r.webLine} | ${r.cocosLine} | ${r.status} |`);
}
md.push('');
md.push('## 只看「實現不同」的符號');
md.push('');
for (const r of rows) {
  if (r.status.startsWith('實現不同')) md.push(`- \`${r.name}\`（web:${r.webLine} / cocos:${r.cocosLine}）${r.status}`);
}
writeFileSync(join(here, 'symbols_table.md'), md.join('\n') + '\n', 'utf8');
console.log(`wrote symbols_table.md  symbols=${names.length} same=${same} diff=${diff} onlyWeb=${onlyWeb} onlyCocos=${onlyCocos}`);
for (const r of rows) if (r.status.startsWith('實現不同')) console.log(`  DIFF ${r.name} web:${r.webLine} cocos:${r.cocosLine} ${r.status}`);
for (const r of rows) if (r.status === '只 web 有' || r.status === '只 cocos 有') console.log(`  ${r.status} ${r.name}`);
