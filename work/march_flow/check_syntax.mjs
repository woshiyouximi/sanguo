// deploy.html 的 <script type="module"> 语法检查（node --check 需要独立文件；模块里有 top-level await）。
// 用法：node F:\sanguo\work\march_flow\check_syntax.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const HTML = 'F:\\sanguo\\game\\web\\deploy.html';
const TMP = 'F:\\sanguo\\work\\march_flow\\_deploy_module.mjs';
const html = readFileSync(HTML, 'utf8');
const start = html.indexOf('<script type="module">');
const end = html.indexOf('</script>', start);
if (start < 0 || end < 0) {
  console.error('找不到 <script type="module"> 區塊');
  process.exit(2);
}
const body = html.slice(start + '<script type="module">'.length, end);
writeFileSync(TMP, body, 'utf8');
try {
  execFileSync(process.execPath, ['--check', TMP], { stdio: 'inherit' });
  console.log(`deploy.html inline module: OK (${body.split('\n').length} 行)`);
} finally {
  try { unlinkSync(TMP); } catch {}
}
