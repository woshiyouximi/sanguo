# -*- coding: utf-8 -*-
"""R225c：行军改逐帧后，更新三处源码契约测试（函数改名 + monthTick 不再推行军）。"""
import io

A = r'F:\sanguo\game\tests\cocos_p1_port.test.ts'
s = io.open(A, encoding='utf-8').read()

# monthTick 里不再推行军：顺序契约改成「stepArmiesFrame 里 advanceArmies，monthTick 只经济/AI」
old = """  const b = tick.indexOf('this.advanceArmiesMonth()');
  const c = tick.indexOf('this.runMapAi()');
  assert.ok(a > 0 && b > a && c > b, 'monthTick() 的順序必須是 advanceMonth → advanceArmiesMonth → runMapAi');"""
new = """  const b = tick.indexOf('this.runMapAi()');
  assert.ok(a > 0 && b > a, 'monthTick() 的順序必須是 advanceMonth → runMapAi（行軍已移到 stepArmiesFrame）');
  // [R225b] 行軍改成逐幀：stepClock 每 tick 先 stepArmiesFrame(n)，monthTick 只做經濟/AI
  assert.match(src, /const step = armyStep\\(scenario, army\\.pathIndex\\);/);
  assert.match(src, /private stepArmiesFrame\\(n: number\\): void \\{/);
  assert.match(src, /months \\* 300/);"""
assert s.count(old) == 1, 'p1p anchor missing'
s = s.replace(old, new, 1)
io.open(A, 'w', encoding='utf-8', newline='\n').write(s)

B = r'F:\sanguo\game\tests\encounter_battle.test.ts'
t = io.open(B, encoding='utf-8').read()
t = t.replace("const ADVANCE = fnBody(COCOS, 'advanceArmiesMonth');",
              "const ADVANCE = fnBody(COCOS, 'advanceArmies');", 1)
t = t.replace("assert.ok(ADVANCE, '找不到 advanceArmiesMonth()');",
              "assert.ok(ADVANCE, '找不到 advanceArmies()');", 1)
t = t.replace("assert.match(ADVANCE, /battle:\\s*battleStarted/, 'advanceArmiesMonth() 回傳值缺少 battle 標記');",
              "assert.match(ADVANCE, /battle:\\s*battleStarted/, 'advanceArmies() 回傳值缺少 battle 標記');", 1)

# monthTick 不再早退；早退改成 stepArmiesFrame 里的 res.battle 分支
old2 = """  const MONTH_TICK = fnBody(COCOS, 'monthTick');"""
assert old2 in t
t = t.replace(old2, """  const MONTH_TICK = fnBody(COCOS, 'monthTick');""", 1)

io.open(B, 'w', encoding='utf-8', newline='\n').write(t)
print('tests patched')
