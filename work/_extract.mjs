// 把 campaign.html 里的 <script type="module"> 抽到 work/_cmp_check.mjs，供 node --check 做语法检查
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('F:/sanguo/game/web/campaign.html', 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('no module script found'); process.exit(2); }
writeFileSync('F:/sanguo/work/_cmp_check.mjs', m[1], 'utf8');
console.log('extracted', m[1].length, 'chars');
