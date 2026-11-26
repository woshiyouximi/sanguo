#!/usr/bin/env node
/**
 * check_devtools.mjs — 正式包「不要漏出调试功能」门禁
 *
 * 背景：R224 用户发现原生包里物品页还带着 web 调试台的「全部解鎖 / 補滿背包」。
 * 那次是「web 调试台的按钮被原样搬进 Cocos」。这个脚本把已知的调试痕迹列成清单，
 * 逐条断言它在正式包里不可能被玩家碰到，防止以后又搬一次。
 *
 * 判据（三选一，按 DEV_ENTRIES 里每条的 mode）：
 *   guard   —— 该串所在文件里必须有 `devToolsOn(` 的调用（原生/rel=1 下返回 false 隐藏）
 *   query   —— 该串只能出现在 `?xxx=1` 这类 URL 开关里（原生包没有 URL ⇒ 不可达）
 *   fidelity—— 原作二进制里就有的调试 syscall / 数据字段，保留属保真，不算漏
 *
 * 用法：
 *   node work/check_devtools.mjs            # 全量
 *   node work/check_devtools.mjs --json     # 机器可读
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'F:/sanguo';
const SCRIPT_DIR = join(ROOT, 'game/cocos/assets/scripts');

/** 已知调试痕迹登记表。每次发现新的「web 调试件被搬进 Cocos」就往这里加一条。 */
const DEV_ENTRIES = [
  {
    id: 'items-unlock-all',
    what: '物品页「全部解鎖 / 補滿背包」按钮',
    files: ['ItemsPanel.ts'],
    needles: ['全部解鎖', '補滿背包', 'unlockAll'],
    mode: 'guard',
    note: 'web items.html#unlock 的调试按钮；2.8 起由 devToolsOn() 隐藏',
  },
  {
    id: 'query-unlimited',
    what: '?unlimited=1 不限行动次数',
    files: ['CityModel.ts'],
    needles: ['UNLIMITED_HINT', 'unlimited=1'],
    mode: 'query',
    note: '仅 web 调试台传参；Cocos 侧没有调用方',
  },
  {
    id: 'query-autoenc',
    what: '?autoenc=1 遭遇战掷骰结算',
    files: ['CampaignRoot.ts'],
    needles: ['autoEncounterOn', "'autoenc'"],
    mode: 'query',
    note: '正式版必须真打，只有调试开关才允许掷骰',
  },
  {
    id: 'query-taunt',
    what: '?taunt=0 关闭开场叫阵',
    files: ['BattleRoot.ts'],
    needles: ["queryValue('taunt')"],
    mode: 'query',
    note: '给对拍录像用的开关',
  },
  {
    id: 'skinlab',
    what: '?skinlab=1 九宫皮肤验证页',
    files: ['SkinLab.ts', 'BootRoot.ts'],
    needles: ['skinlab'],
    mode: 'query',
    note: '整页只在带参数时自己激活；原生无 URL ⇒ 不显示',
  },
  {
    id: 'syso-test01',
    what: '原作 Test01() 打 10000 伤害（0x4554 调试 syscall）',
    files: ['core/syso_host.ts'],
    needles: ['Test01'],
    mode: 'fidelity',
    note: '原作二进制自带；只有脚本显式调用才触发，保留属保真',
  },
  {
    id: 'city-debug-level',
    what: '调试用等级注入（web 的 ?lv=）',
    files: ['CityModel.ts'],
    needles: ['除錯用：generals.json 沒有等級欄位'],
    mode: 'query',
    note: 'Cocos 侧只有注释提到，无实现',
  },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const allFiles = walk(SCRIPT_DIR).map((p) => relative(SCRIPT_DIR, p).replace(/\\/g, '/'));
const cache = new Map();
function text(rel) {
  if (!cache.has(rel)) cache.set(rel, readFileSync(join(SCRIPT_DIR, rel), 'utf8'));
  return cache.get(rel);
}

const problems = [];
const rows = [];

for (const entry of DEV_ENTRIES) {
  const present = [];
  for (const f of entry.files) {
    if (!allFiles.includes(f)) {
      rows.push({ ...entry, file: f, verdict: 'MISSING', detail: '文件不存在（改名了？登记表要跟着改）' });
      problems.push(`${entry.id}: 登记的文件 ${f} 不存在`);
      continue;
    }
    const src = text(f);
    const hitLines = entry.needles
      .map((n) => src.split('\n').findIndex((l) => l.includes(n)))
      .filter((i) => i >= 0);
    if (!hitLines.length) continue;
    present.push({ file: f, lines: hitLines.map((i) => i + 1) });
  }

  if (!present.length) {
    rows.push({ ...entry, file: entry.files.join(','), verdict: 'GONE', detail: '代码里已无痕迹' });
    continue;
  }

  let ok = true;
  let detail = '';
  if (entry.mode === 'guard') {
    for (const p of present) {
      if (!text(p.file).includes('devToolsOn(')) {
        ok = false;
        detail += `${p.file} 无 devToolsOn() 守卫；`;
      }
    }
    detail = detail || 'devToolsOn() 守卫在（原生 isNative ⇒ false）';
  } else if (entry.mode === 'query') {
    // 只要痕迹都出现在带 `?` 的 URL 开关附近或注释里，就算不可达
    for (const p of present) {
      const lines = text(p.file).split('\n');
      const bad = p.lines.filter((ln) => {
        const l = lines[ln - 1] ?? '';
        return !/^\s*(\*|\/\/)/.test(l) && !l.includes('?') && !l.includes('queryValue') && !l.includes('HINT');
      });
      if (bad.length) {
        ok = false;
        detail += `${p.file}:${bad.join(',')} 不在 URL 开关/注释里；`;
      }
    }
    detail = detail || '仅 URL 开关/注释中出现 ⇒ 原生包不可达';
  } else {
    detail = '原作自带，保留';
  }
  rows.push({ ...entry, file: present.map((p) => p.file).join(','), verdict: ok ? 'OK' : 'LEAK', detail });
  if (!ok) problems.push(`${entry.id}（${entry.what}）：${detail}`);
}

const json = process.argv.includes('--json');
if (json) {
  console.log(JSON.stringify({ rows, problems }, null, 2));
} else {
  console.log('== 正式包调试痕迹门禁 ==');
  for (const r of rows) {
    const tag = r.verdict === 'LEAK' ? 'FAIL' : r.verdict === 'MISSING' ? 'WARN' : 'ok  ';
    console.log(`${tag} ${r.id.padEnd(20)} ${r.what}`);
    console.log(`     ${r.detail}`);
  }
  console.log(`\ndevtools: ${rows.length} 条 · 漏出 ${problems.length} · ${problems.length ? 'FAIL' : 'OK'}`);
  for (const p of problems) console.log(`  ! ${p}`);
}
process.exit(problems.length ? 1 : 0);
