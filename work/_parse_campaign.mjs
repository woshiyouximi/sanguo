// 解析 game/web/campaign.html 里的 <script type="module">，只解析不执行。
// 用法：node --experimental-vm-modules work/_parse_campaign.mjs
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('F:/sanguo/game/web/campaign.html', 'utf8');
const re = /<script\s+type="module"\s*>([\s\S]*?)<\/script>/g;
let m, n = 0, bad = 0;
while ((m = re.exec(html))) {
  n += 1;
  const body = m[1];
  try {
    new vm.SourceTextModule(body, { identifier: `campaign.html#${n}` });
    console.log(`script#${n} PARSE OK chars=${body.length}`);
  } catch (e) {
    bad += 1;
    console.log(`script#${n} PARSE FAIL: ${e.message}`);
    const line = /:(\d+)/.exec(e.stack || '');
    if (line) console.log((e.stack || '').split('\n').slice(0, 4).join('\n'));
  }
}
console.log(`scripts=${n} bad=${bad}`);
process.exit(bad ? 1 : 0);
