// R94 子集同步：只把本轮改过的 4 个 core 文件拷到 cocos，避免把另一 agent 正在改的
// battle.ts / smartscript/** 一起带过去（那会让 cocos 侧编译到半成品）。
// 变换与 sync_core3.mjs 完全一致：strip .ts 相对导入 + 命中即替换 KEEP_PATCHES。
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'F:/sanguo/game/src/core';
const DST = 'F:/sanguo/game/cocos/assets/scripts/core';
const SYNC = 'F:/sanguo/work/cocos_sync/sync_core3.mjs';
const FILES = ['deploy_queue.ts', 'wises.ts', 'strategy.ts', 'wises_effects.ts'];

const raw = readFileSync(SYNC, 'utf8');
const start = raw.indexOf('const KEEP_PATCHES');
const end = raw.indexOf('\n];', start);
if (start < 0 || end < 0) throw new Error('KEEP_PATCHES 定位失败');
const KEEP = new Function(raw.slice(start, end + 3) + '\nreturn KEEP_PATCHES;')();
console.log(`[r94] KEEP_PATCHES ${KEEP.length} 条，本批命中 ${KEEP.filter((p) => FILES.includes(p.file)).length} 条`);

const stripImportExtensions = (text) => {
  let out = text.replace(/(\bfrom\s+')(\.\.?\/[^']*?)\.ts(')/g, '$1$2$3');
  out = out.replace(/(\bimport\s+')(\.\.?\/[^']*?)\.ts(')/g, '$1$2$3');
  return out;
};

for (const file of FILES) {
  let text = stripImportExtensions(readFileSync(`${SRC}/${file}`, 'utf8'));
  for (const patch of KEEP.filter((p) => p.file === file)) {
    const hits = text.split(patch.from).length - 1;
    if (hits !== 1) throw new Error(`${file} ${patch.id} 锚点命中 ${hits} 次（应为 1）`);
    text = text.replace(patch.from, patch.to);
    console.log(`  ${file} 补丁 ${patch.id} 已应用`);
  }
  writeFileSync(`${DST}/${file}`, text, 'utf8');
  console.log(`  write ${file} ${Buffer.byteLength(text)}B`);
}
