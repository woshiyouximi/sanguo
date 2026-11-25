// 一次性：把 model_assert.mjs 的 ④ 段换成 _section4_new.txt（R208 多段技能表）。
import { readFileSync, writeFileSync } from 'node:fs';

const lines = readFileSync('model_assert.mjs', 'utf8').split('\n');
const start = lines.findIndex((l) => l.includes("section('④ 技能過濾"));
if (start < 0) throw new Error('start not found');
const end = lines.findIndex((l) => l.includes('技能表缺資料時回 #id 兜底'));
if (end < 0) throw new Error('end not found');
const news = readFileSync('_section4_new.txt', 'utf8').replace(/\n$/, '').split('\n');
const out = [...lines.slice(0, start), ...news, ...lines.slice(end + 1)];
writeFileSync('model_assert.mjs', out.join('\n'), 'utf8');
console.log(`replaced ${start + 1}..${end + 1} (${end - start + 1} lines) -> ${news.length} lines`);
