import fs from 'node:fs';
const p = 'F:/sanguo/game/tests/weather.test.ts';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replaceAll('300 tick', '1200 tick');
s = s.replace('for (let i = 0; i < 300 && !w.over; i++) step(w);', 'for (let i = 0; i < 1200 && !w.over; i++) step(w);');
s = s.replace(
  "describe('R39 聚合端到端：天气越差，1200 tick 内命中越少', () => {",
  "// tick 预算：R158 起移动改成原作「每 40 帧行动一次、一次一格」（`0x43B574`/`0x43BF26`），\n// 24v24 从列阵到接触实测 ≈535 tick，旧的 300 tick 样本里根本没有接战，\n// 所以这里把采样窗口放宽到 1200 tick（口径仍是「命中率单调」，不是总量）。\ndescribe('R39 聚合端到端：天气越差，1200 tick 内命中越少', () => {",
);
if (s !== before) fs.writeFileSync(p, s);
console.log('remaining 300:', JSON.stringify(s.match(/.{0,16}300.{0,16}/g) ?? []));
