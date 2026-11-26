// 预演「同步后」的 Cocos core：全程只写 work/roster_unify/preview/，绝不碰 game/cocos。
//  1. 把真实 Cocos scripts 树整份字节复制到 preview/scripts；
//  2. 把同步器 sync_core3.mjs 原样复制，只把 DST_ROOT / WORK_DIR 两个绝对路径改指 preview，
//     SRC_ROOT 仍指真实 web 源（只读）—— 于是这一跑产出的 core/roster.ts 就是真同步会写的字节；
//  3. 用真实 dry-run 的 manifest 里记录的 dst_sha16 校验预览产物（sha 一致才算数）；
//  4. 用预览树跑 Cocos 的 tsc 检查（tsconfig 继承 game/cocos/tsconfig.check.json）。
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PREVIEW = join(here, 'preview');
const SCRIPTS = join(PREVIEW, 'scripts');
const SYNCWORK = join(PREVIEW, 'syncwork');
const REAL_COCOS = join(root, 'game', 'cocos', 'assets', 'scripts');
const SYNC_SRC = join(root, 'work', 'cocos_sync', 'sync_core3.mjs');
const TSC = join(root, 'game', 'node_modules', 'typescript', 'bin', 'tsc');
const MANIFEST = join(root, 'work', 'cocos_sync', 'core3', 'manifest.csv');

// 1. 复制真实 Cocos scripts 树（只读源）
rmSync(PREVIEW, { recursive: true, force: true });
cpSync(REAL_COCOS, SCRIPTS, { recursive: true });
mkdirSync(SYNCWORK, { recursive: true });
console.log(`[preview] 复制 ${REAL_COCOS} → ${SCRIPTS}`);

// 2. 复制同步器，只改 DST_ROOT / WORK_DIR 两个绝对路径
let syncText = readFileSync(SYNC_SRC, 'utf8');
const rep = (from, to) => {
  if (!syncText.includes(from)) throw new Error(`[preview] 同步器里找不到锚点：${from}`);
  syncText = syncText.replace(from, to);
};
const slash = (p) => p.replace(/\\/g, '/');
rep("const DST_ROOT = 'F:/sanguo/game/cocos/assets/scripts/core';", `const DST_ROOT = '${slash(SCRIPTS)}/core';`);
rep("const WORK_DIR = 'F:/sanguo/work/cocos_sync';", `const WORK_DIR = '${slash(SYNCWORK)}';`);
const runScript = join(PREVIEW, 'sync_preview.mjs');
writeFileSync(runScript, syncText, 'utf8');
console.log('[preview] 跑改写路径后的同步器（真写，只写 preview/scripts/core）');
execFileSync(process.execPath, [runScript], { stdio: 'inherit' });

// 3. 用真实 dry-run 的 manifest 校验预览产物的 sha16
const lines = readFileSync(MANIFEST, 'utf8').trim().split(/\r?\n/);
const header = lines[0].split(',');
const row = lines.slice(1).map((l) => l.split(',')).find((c) => c[0] === 'roster.ts');
if (!row) throw new Error('[preview] 真实 manifest 里没有 roster.ts 行');
const expectSha = row[header.indexOf('dst_sha16')];
const expectLines = Number(row[header.indexOf('dst_after_lines')]);
const gen = readFileSync(join(SCRIPTS, 'core', 'roster.ts'));
const gotSha = createHash('sha256').update(gen).digest('hex').slice(0, 16);
const gotLines = gen.toString('utf8').split('\n').length;
console.log(`[preview] roster.ts sha16=${gotSha}（dry-run 期望 ${expectSha}） 行=${gotLines}（期望 ${expectLines}）`);
if (gotSha !== expectSha) throw new Error('[preview] 预览产物与真实 dry-run 目标不一致，预览不可信');

// 4. Cocos 侧 tsc（预览树）
writeFileSync(
  join(PREVIEW, 'tsconfig.json'),
  JSON.stringify(
    {
      extends: '../../../game/cocos/tsconfig.check.json',
      include: ['scripts/**/*.ts', '../../../game/cocos/types/cc.engine.d.ts'],
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log('[preview] tsc -p preview/tsconfig.json');
execFileSync(process.execPath, [TSC, '-p', join(PREVIEW, 'tsconfig.json')], { stdio: 'inherit' });
console.log('[preview] OK：同步后 Cocos 侧 tsc exit 0');
