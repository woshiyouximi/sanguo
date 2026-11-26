#!/usr/bin/env node
// scopes_selftest.mjs — 验证 check_parity.mjs 的 scope 判定（R215 / project/215_双端口径与调试开关.md §4）
//
// 用法：node work/parity/scopes_selftest.mjs
//
// 两条规定自测（临时矩阵写 work/parity/_tmp.json，跑完必删）：
//   ① 只有 web-debug 缺（web 有、Cocos 不搬的调试设施）⇒ 通过（exit 0，失败 0）
//   ② 有 scope=cocos 缺（web 有、Cocos 没有的正式功能）⇒ 失败（exit 1，失败 1）
// 两种情况矩阵形状相同，只有 scope 不同 —— 用来证明「红不红只看 scope」。
// 跑完额外核对 _tmp.json 不存在（自测不留垃圾）。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = 'F:/sanguo';
const GATE = path.join(ROOT, 'work/check_parity.mjs');
const TMP = path.join(ROOT, 'work/parity/_tmp.json');

let pass = 0;
const fails = [];
function ok(cond, label) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fails.push(label);
    console.log(`  ✗ ${label}`);
  }
}

function runGate(features) {
  fs.writeFileSync(TMP, `${JSON.stringify(features, null, 2)}\n`, 'utf8');
  const r = spawnSync(process.execPath, [GATE, '--json=work/parity/_tmp.json', '--no-core'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

try {
  console.log('[自测 ①] 只有 web-debug 缺 ⇒ 应通过');
  const a = runGate([
    {
      id: 'T-web-debug',
      what: '临时：web 有、Cocos 不搬',
      scope: 'web-debug',
      web: [{ file: 'game/web/main.js', re: 'createWorld' }],
      note: '自测用，跑完即删',
    },
  ]);
  ok(a.code === 0, '① exit 0');
  ok(/失败 0/.test(a.out), '① 总结「失败 0」');
  ok(/调试项（不判红）: 1 条/.test(a.out), '① 调试项行收到 1 条');
  ok(/✗ 1 处/.test(a.out), '① web-debug 的 ✗ 记进调试项行（1 处）');
  ok(/OK/.test(a.out), '① 结论 OK');

  console.log('\n[自测 ②] 有 cocos 缺 ⇒ 应失败');
  const b = runGate([
    {
      id: 'T-cocos',
      what: '临时：web 有、Cocos 缺',
      scope: 'cocos',
      cocos: [{ file: 'game/cocos/assets/scripts/CampaignRoot.ts', re: '__TMP_NEVER_MATCH_B__' }],
      web: [{ file: 'game/web/main.js', re: 'createWorld' }],
      note: '自测用，跑完即删',
    },
  ]);
  ok(b.code === 1, '② exit 1');
  ok(/失败 1/.test(b.out), '② 总结「失败 1」');
  ok(/Cocos 缺 1 处/.test(b.out), '② 总结「Cocos 缺 1 处」');
  ok(/FAIL/.test(b.out), '② 结论 FAIL');
  ok(!/调试项（不判红）/.test(b.out), '② 无 web-debug 条目时不打调试项行');
} catch (err) {
  ok(false, `自测执行异常：${String(err.message ?? err)}`);
} finally {
  fs.rmSync(TMP, { force: true });
}
ok(!fs.existsSync(TMP), '临时矩阵 work/parity/_tmp.json 已删除');

const total = pass + fails.length;
console.log(`\nscopes_selftest: ${pass}/${total} 过`);
if (fails.length > 0) {
  console.log(`失败项：${fails.join('；')}`);
  process.exit(1);
}
console.log('OK');
