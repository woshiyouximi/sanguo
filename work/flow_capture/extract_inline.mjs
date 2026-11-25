// 只做一件事：把 campaign.html 的 `<script type="module">` 内联模块抽成 .mjs，交给 `node --check` 验语法。
// （campaign.html 是纯内联 JS，没有 tsc 覆盖；改完必须过这一关，否则整页会在模块求值阶段就崩。）
import fs from 'node:fs';

const here = new URL('.', import.meta.url);
const html = fs.readFileSync(new URL('../../game/web/campaign.html', here), 'utf8');
const lines = html.split(/\r?\n/);
const start = lines.findIndex((l) => l.includes('<script type="module">'));
if (start < 0) throw new Error('找不到 <script type="module">');
const end = lines.findIndex((l, i) => i > start && l.includes('</script>'));
if (end < 0) throw new Error('找不到 </script>');
const js = lines.slice(start + 1, end).join('\n');
fs.writeFileSync(new URL('./campaign_inline.mjs', here), js, 'utf8');
console.log(`inline module: html lines ${start + 2}..${end}, ${js.length} chars -> campaign_inline.mjs`);
