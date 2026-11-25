// 只做語法檢查：把 campaign.html 的 <script type="module"> 當 ES module 解析（不執行、不解析 import）
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2] || 'F:/sanguo/game/web/campaign.html';
const html = readFileSync(file, 'utf8');
const open = html.indexOf('<script type="module">');
const close = html.lastIndexOf('</script>');
if (open < 0 || close < 0) {
  console.log('NO MODULE SCRIPT');
  process.exit(2);
}
const body = html.slice(open + '<script type="module">'.length, close);
try {
  new vm.SourceTextModule(body);
  console.log(`PARSE OK chars=${body.length}`);
} catch (e) {
  console.log('PARSE ERR ' + e.message);
  const line = Number((String(e.stack).match(/campaign\.html:(\d+)/) || [])[1] || 0);
  if (line) console.log('near line ' + line);
  process.exit(1);
}
