import fs from 'node:fs';
const p = 'F:/sanguo/game/tests/smartscript_audio.test.ts';
let s = fs.readFileSync(p, 'utf8');
const before = s;
s = s.replace(
  "test('R80 真跑一场战斗：六类里至少命中/格挡/阵亡/受击都出现', () => {",
  "// tick 预算：R158 起移动改成原作「每 40 帧行动一次、一次一格」（`0x43B574`/`0x43BF26`），\n// 60v60 实测要 1397 tick 才打完（旧连续速度模型约 1/3.6）；1200 会截断在战斗中段，\n// 所以放宽到 2600 tick，断言口径不变（六类事件都真的出现过、战场事件不进 sink）。\ntest('R80 真跑一场战斗：六类里至少命中/格挡/阵亡/受击都出现', () => {",
);
s = s.replace('for (let i = 0; i < 1200 && !world.over; i++) {', 'for (let i = 0; i < 2600 && !world.over; i++) {');
s = s.replace("assert.ok(world.over, '战斗应在 1200 tick 内结束');", "assert.ok(world.over, '战斗应在 2600 tick 内结束（60v60 实测 1397）');");
if (s !== before) fs.writeFileSync(p, s);
console.log('remaining 1200:', JSON.stringify(s.match(/.{0,16}1200.{0,16}/g) ?? []));
