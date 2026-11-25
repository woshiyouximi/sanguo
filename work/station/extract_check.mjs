// 语法门：把 campaign.html 的 <script type="module"> 抽出来落成 .mjs，供 node --check 检查。
// 只是验收辅助脚本，不属于项目代码（项目代码只用 edit/write 改）。
import { readFileSync, writeFileSync } from 'node:fs';

const h = readFileSync(new URL('../../game/web/campaign.html', import.meta.url), 'utf8');
const m = h.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.log('NO MODULE'); process.exit(2); }
writeFileSync(new URL('./_syntax.mjs', import.meta.url), m[1]);
console.log('module chars', m[1].length);
