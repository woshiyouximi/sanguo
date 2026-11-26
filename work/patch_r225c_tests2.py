# -*- coding: utf-8 -*-
"""R225c(2)：encounter 契约测试对齐「行軍逐幀」后的结构。"""
import io

P = r'F:\sanguo\game\tests\encounter_battle.test.ts'
s = io.open(P, encoding='utf-8').read()

s = s.replace("const ADVANCE = fnBody(COCOS, 'advanceArmiesMonth');",
              "const ADVANCE = fnBody(COCOS, 'advanceArmies');\nconst FRAME = fnBody(COCOS, 'stepArmiesFrame');",
              1)
s = s.replace("assert.ok(ADVANCE, '找不到 advanceArmiesMonth()');",
              "assert.ok(ADVANCE, '找不到 advanceArmies()');", 1)
s = s.replace("assert.match(ADVANCE, /battle:\\s*battleStarted/, 'advanceArmiesMonth() 回傳值缺少 battle 標記');",
              "assert.match(ADVANCE, /battle:\\s*battleStarted/, 'advanceArmies() 回傳值缺少 battle 標記');", 1)

old = """test('源码契约：monthTick() 遇戰立刻收手（不繼續跑剩餘月份/AI）', () => {
  assert.ok(MONTH_TICK, '找不到 monthTick()');
  assert.ok(MONTH_TICK.includes('moved.battle'), 'monthTick() 沒檢查 moved.battle');
  const atCheck = MONTH_TICK.indexOf('moved.battle');
  const atAi = MONTH_TICK.indexOf('this.runMapAi()');
  assert.ok(atCheck >= 0 && atAi >= 0, 'monthTick() 找不到 moved.battle 或 runMapAi');
  assert.ok(atCheck < atAi, 'moved.battle 早退必須排在 runMapAi() 之前');
});"""
new = """test('源码契约：[R225b] 行軍逐幀推進，遇戰由 stepArmiesFrame() 立刻收手', () => {
  // 行軍已從 monthTick 移到每 tick 的 stepArmiesFrame（原作 0x41AFAB 逐幀）
  assert.ok(MONTH_TICK, '找不到 monthTick()');
  assert.ok(!MONTH_TICK.includes('advanceArmies('), 'monthTick() 不應再推行軍（已移到 stepArmiesFrame）');
  assert.ok(FRAME, '找不到 stepArmiesFrame()');
  assert.ok(FRAME.includes('this.advanceArmies('), 'stepArmiesFrame() 沒推行軍');
  const atBattle = FRAME.indexOf('res.battle');
  const atRefresh = FRAME.indexOf('this.refresh()', atBattle);
  assert.ok(atBattle >= 0, 'stepArmiesFrame() 沒檢查 res.battle');
  assert.ok(atRefresh > atBattle, 'stepArmiesFrame() 遇戰必須先收手再刷新');
  assert.ok(FRAME.includes('this.clockPaused = true'), 'stepArmiesFrame() 遇戰要暫停時鐘');
  // 逐幀步長：一整段 marchMonths 個月（300 tick/月）攤到每 tick
  assert.match(FRAME, /months \\* 300/, 'stepArmiesFrame() 步長沒按 300 tick/月 折算');
});"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('encounter test patched')
