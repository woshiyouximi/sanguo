// 打印指定 dis 行号附近的指令窗口（含地址/opcode/操作数），用于人工判读 spawn 参数
import fs from 'node:fs';
const lines = fs.readFileSync('F:/sanguo/export/script/magic_so.dis.txt', 'utf8').split(/\r?\n/);
const at = process.argv.slice(2).map((s) => s.split(':').map(Number)); // line:before:after
for (const [ln, before = 10, after = 6] of at) {
  console.log(`\n===== around line ${ln} =====`);
  for (let i = Math.max(0, ln - before - 1); i < Math.min(lines.length, ln + after); i++) console.log(String(i + 1).padStart(6) + '  ' + lines[i].padEnd(96));
}
