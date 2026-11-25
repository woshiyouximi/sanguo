import fs from 'node:fs';

const dump = fs.readFileSync('F:/sanguo/work/b3_full.txt', 'utf8');
const tailMark = '","file_path":"F:\\\\sanguo\\\\game\\\\tests\\\\wises.test.ts"}';
const endIdx = dump.lastIndexOf(tailMark);
console.log('tail idx', endIdx);
if (endIdx < 0) {
  // 換一種：dump 裡也許是單反斜線
  const alt = '","file_path":"F:\\sanguo\\game\\tests\\wises.test.ts"}';
  console.log('alt idx', dump.lastIndexOf(alt));
  process.exit(1);
}
const startIdx = dump.lastIndexOf('{"content":"', endIdx);
console.log('head idx', startIdx);
const json = dump.slice(startIdx, endIdx + tailMark.length);
const obj = JSON.parse(json);
console.log('content length', obj.content.length, 'lines', obj.content.split('\n').length);
fs.writeFileSync('F:/sanguo/game/tests/wises.test.ts', obj.content, 'utf8');
console.log('restored');
