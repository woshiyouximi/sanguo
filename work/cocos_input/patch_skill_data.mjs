// 修复 Cocos 内置数据：generals.json 的 SKILL 只有「最后一对」等级/技序，
// 与规范数据 game/data/generals.json 的完整 1~8 条不一致，导致战斗只出 1 格且技序错。
// 只合并 SKILL 字段（按 NAME 对齐），其它字段原样保留；输出沿用原文件的 1 空格缩进。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const SRC = path.join(ROOT, 'game/data/generals.json');
const DST = path.join(ROOT, 'game/cocos/assets/bundles/res/data/generals.json');

const canonical = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const bundle = JSON.parse(fs.readFileSync(DST, 'utf8'));
const byName = new Map(canonical.map((g) => [g.NAME, g]));

let patched = 0;
let missing = 0;
for (const row of bundle) {
  const src = byName.get(row.NAME);
  if (!src) {
    missing += 1;
    continue;
  }
  const full = Array.isArray(src.SKILL) ? src.SKILL : src.SKILL ? [src.SKILL] : [];
  if (full.length === 0) continue;
  row.SKILL = full;
  patched += 1;
}

if (missing > 0) throw new Error(`canonical 缺 ${missing} 个同名将，拒绝写出`);
fs.writeFileSync(DST, JSON.stringify(bundle, null, 1) + '\n', 'utf8');
console.log(JSON.stringify({ patched, missing, rows: bundle.length, bytes: fs.statSync(DST).size }));
