import fs from 'node:fs';
const p = 'F:/sanguo/game/tests/audio_bus.test.ts';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replaceAll('300 tick', '1200 tick');
s = s.replace('for (let i = 0; i < 300 && !world.over; i++) {', 'for (let i = 0; i < 1200 && !world.over; i++) {');
s = s.replace(
  "describe('战场路径不转发 sink（151 次双播的根因）', () => {",
  "// tick 预算：R158 起移动改成原作「每 40 帧行动一次、一次一格」（`0x43B574`/`0x43BF26`），\n// 40v40 从列阵到接触要 ≈500+ tick，300 tick 的窗口里一次命中都不会有；\n// 这里放宽到 1200 tick，断言口径不变（战场事件只进日志、不直推 sink）。\ndescribe('战场路径不转发 sink（151 次双播的根因）', () => {",
);
if (s !== before) fs.writeFileSync(p, s);
console.log('remaining 300:', JSON.stringify(s.match(/.{0,16}300.{0,16}/g) ?? []));
