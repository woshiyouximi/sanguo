/**
 * 无头冒烟测试：真数据 + mock Canvas2D，验证"数据 → World → 绘制指令 → render"整条链。
 *
 * 用法：node web/smoke.mjs
 * 它不替代浏览器验收（像素/交互仍要人看），但能在 CI/无浏览器环境里抓住
 * import 路径、绘制指令结构、命中区、cast/settle 的低级错误。
 */
import { readFileSync } from 'node:fs';
import { cast, createWorld, settle, step, TICK_HZ } from '../dist/core/battle.js';
import { buildFrame, hitTest, makeSkillBar, render } from '../dist/view/battleView.js';
import { BTN_ASSAULT, START_BUTTON, skillSlotRect } from '../dist/view/layout.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

const data = Object.fromEntries(
  ['troops', 'formations', 'magics', 'wises', 'generals', 'terrains', 'items', 'scenarios'].map(
    (name) => [name, load(name)],
  ),
);

const calls = [];
const noop = (...args) => {
  calls.push(args);
};
const ctx = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 10 });
      if (prop in target) return target[prop];
      return noop;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  },
);

function check(cond, label) {
  if (!cond) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`ok   ${label}`);
  }
}

const world = createWorld({
  data,
  seed: 42,
  a: { troop: 2, formation: 0, soldiers: 100, morale: 60, general: { name: '關羽', str: 97, int: 75, level: 6 } },
  b: { troop: 10, formation: 3, soldiers: 100, morale: 60, general: { name: '張角', str: 70, int: 88, level: 5 } },
  aiSides: { B: true },
});

const skills = makeSkillBar(data);
check(skills.length >= 4, `技能栏 ${skills.length} 格`);
check(skills.every((s) => s.seq > 0 && s.name.length > 0), '技能栏有 seq/name');

const readyOpts = { mode: 'ready', skills, camX: 35, seed: 42 };
const readyHits = hitTest(world, readyOpts, START_BUTTON.x + 20, START_BUTTON.y + 20);
check(readyHits?.type === 'start', '待战遮罩命中「开战」');

const fightingOpts = { mode: 'fighting', skills, camX: 35, seed: 42 };
const skillHit = hitTest(world, fightingOpts, skillSlotRect(0).x + 10, skillSlotRect(0).y + 10);
check(skillHit?.type === 'skill' && skillHit.index === 0, '技能格 0 命中');
const assaultHit = hitTest(world, fightingOpts, BTN_ASSAULT.x + 10, BTN_ASSAULT.y + 10);
check(assaultHit?.type === 'assault', '突击按钮命中（预览未接）');

const frame = buildFrame(world, fightingOpts);
check(Array.isArray(frame) && frame.length > 300, `fighting 绘制指令 ${frame.length} 条`);
check(new Set(frame.map((c) => c.kind)).size >= 4, '绘制指令覆盖 4 种以上类型');

render(ctx, world, fightingOpts);
check(calls.length > 0, `render 实际调用了 Canvas2D ${calls.length} 次`);

// 跑到气力够，再放一次群攻；不等战斗自然结束（可能 200 秒）
let casted = null;
for (let i = 0; i < TICK_HZ * 40 && !world.over; i++) {
  step(world);
  if (i > TICK_HZ && !casted) {
    const r = cast(world, 'A', 104, 40, 6);
    if (r.ok) casted = r;
  }
}
check(casted !== null, `40 秒内成功施放一次 104（击杀 ${casted?.killed ?? 0}）`);

for (let i = 0; i < TICK_HZ * 240 && !world.over; i++) step(world);
const settled = settle(world);
check(['A', 'B', 'draw'].includes(settled.winner), `结算 winner=${settled.winner}`);
check(Number.isFinite(settled.kills) && Number.isFinite(settled.durationSec), '结算数值有限');
const settledFrame = buildFrame(world, { ...fightingOpts, mode: 'settled', settlement: settled });
check(settledFrame.length > 100, `结算画面绘制指令 ${settledFrame.length} 条`);

render(ctx, world, { ...fightingOpts, mode: 'settled', settlement: settled });
console.log(calls.length > 0 ? 'smoke done' : 'smoke done (no draw calls)');
