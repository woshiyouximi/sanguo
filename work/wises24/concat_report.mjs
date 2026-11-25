import { readFileSync, writeFileSync } from 'node:fs';
const head = readFileSync('F:/sanguo/work/wises24/report_head.md', 'utf8');
const table = readFileSync('F:/sanguo/work/wises24/table.md', 'utf8');
const tail = readFileSync('F:/sanguo/work/wises24/report_tail.md', 'utf8');
writeFileSync('F:/sanguo/project/130_军师技24条裁决.md', head + table + '\n' + tail, 'utf8');
console.log('written', (head + table + tail).length);
