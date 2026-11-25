/**
 * unit2_ai.mjs — AI 月动作对拍：web `game/web/ai_model.js` vs Cocos `assets/scripts/AiModel.ts`
 *
 * 真正的对拍逻辑不重写：复用 `work/cocos_ai84/parity.mjs`（同仓库已验证过的第二套手法），
 * 复制成 `_ai84_driver.mjs` 并只改三处：
 *   1. `COC_ENTRY` 指向 `_sim/cocos_ai/AiModel.js`（本目录自己编的产物）
 *   2. Cocos 侧改用 `createRequire` 装载（CJS 原生装载 + 可改导出常量做阴性对照）
 *   3. report 落 `_ai84_report.json`
 * 驱动本身覆盖：5 剧本 × 12 月，`prepareMonth → planMonth → executeMonth → 结算 → 灭亡 → 漂移`
 * 全链路逐字段比对（谁打谁、占哪座空城、内政动作种类与目标、兵力/资金/民忠…）。
 *
 * 阴性对照：`PARITY_NEGATIVE=1` 时驱动把 Cocos 侧 `TROOP_UNIT` 由 20 改成 21。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HERE, makeResult } from './build_sim.mjs';

const DRIVER = path.join(HERE, '_ai84_driver.mjs');
const REPORT = path.join(HERE, '_ai84_report.json');

export async function run({ negative = false } = {}) {
  const { compile } = await import('./build_sim.mjs');
  compile('tsconfig.ai.json');

  const res = makeResult('unit2-ai', '5 剧本 × 12 月 prepareMonth→planMonth→executeMonth→结算→灭亡→漂移');
  const env = { ...process.env };
  if (negative) env.PARITY_NEGATIVE = '1';
  else delete env.PARITY_NEGATIVE;

  let log = '';
  let code = 0;
  const t0 = Date.now();
  try {
    log = execFileSync(process.execPath, [DRIVER], { env, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    log = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    code = typeof e.status === 'number' ? e.status : 1;
  }
  res.extra.ms = Date.now() - t0;
  res.extra.driverExit = code;
  fs.writeFileSync(path.join(HERE, negative ? '_u2_negative.log' : '_u2.log'), log, 'utf8');

  const rep = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  const unitMiss = rep.unit?.mismatches ?? 0;
  const totMiss = rep.totals.mismatches + unitMiss;

  res.cases = rep.totals.entries;
  res.fields = rep.totals.fields + (rep.unit?.fields ?? 0);
  res.missesCount = totMiss;
  res.extra.totals = { ...rep.totals, unitFields: rep.unit?.fields ?? 0, unitMismatches: unitMiss };

  res.notes.push(`剧本 ${rep.totals.cases} / 月 ${rep.totals.months} / 城 ${rep.inputs.citiesPerScenario} / 路径 ${rep.inputs.pathsPerScenario}`);
  res.notes.push(`定点 API 检查（ADDR/ACT/RATE/COST/DRIFT/capOf/scoreTarget…）：字段 ${rep.unit?.fields ?? 0}，不一致 ${unitMiss}`);
  res.notes.push(`确定性自检（web 连跑两遍）：${rep.determinism.every((d) => d.mismatches === 0) ? '全部一致' : '有不一致'}`);
  for (const c of rep.cases) {
    res.notes.push(`  剧本${c.scenario} 玩家=${c.player} 条目${c.entries} 字段${c.fields} 不一致${c.mismatches} 野战${c.battles} 待战${c.incoming} 城池易手${c.citiesChanged}`);
  }

  const ds = [...(rep.mismatches ?? [])];
  for (const m of rep.unit?.sample ?? []) ds.unshift({ case: 'unit', ...m });
  res.misses = ds.slice(0, 24).map((m) => ({ path: `[${m.case}] ${m.path}`, web: m.web, cocos: m.cocos }));

  if (negative) {
    res.notes.push('阴性对照：驱动的 PARITY_NEGATIVE=1 把 Cocos 侧 TROOP_UNIT 由 20 改成 21（web 仍为 20）');
    res.notes.push(`阴性对照结论：${totMiss > 0 ? 'RED（按预期转红）' : 'GREEN —— 对拍恒真，无效！'}`);
    res.extra.negativeRed = totMiss > 0;
  }
  return res;
}

if (process.argv[1]?.endsWith('unit2_ai.mjs')) {
  const { report } = await import('./build_sim.mjs');
  const negative = process.argv.includes('--negative');
  const r = await run({ negative });
  report(r, { show: 20 });
  process.exitCode = negative ? (r.extra.negativeRed ? 0 : 1) : (r.missesCount === 0 ? 0 : 1);
}
