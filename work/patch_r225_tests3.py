# -*- coding: utf-8 -*-
"""R225：fnBody('update') 抓不到（方法签名带参数类型），改成整源正则断言。"""
import io

P = r'F:\sanguo\game\tests\cocos_p1_port.test.ts'
s = io.open(P, encoding='utf-8').read()

old = """  // 時鐘本體：update(dt) → stepClock → monthTick（每月一次結算）
  const upd = fnBody(src, 'update');
  assert.match(upd, /this\\.stepClock\\(this\\.clockSpeed\\)/);
  const step = fnBody(src, 'stepClock');
  assert.match(step, /this\\.clockT = Math\\.max\\(0, this\\.clockT - n\\);/);
  assert.match(step, /this\\.monthTick\\(\\)/);
  const tick = fnBody(src, 'monthTick');
  const a = tick.indexOf('GameState.advanceMonth(this.cities');
  const b = tick.indexOf('this.advanceArmiesMonth()');
  const c = tick.indexOf('this.runMapAi()');"""

new = """  // 時鐘本體：update(dt) → stepClock → monthTick（每月一次結算）
  assert.match(src, /update\\(dt: number\\): void \\{/);
  assert.match(src, /this\\.stepClock\\(this\\.clockSpeed\\)/);
  assert.match(src, /this\\.clockT = Math\\.max\\(0, this\\.clockT - n\\);/);
  assert.match(src, /private stepClock\\(n: number\\): void \\{/);
  assert.match(src, /private monthTick\\(\\): boolean \\{/);
  const tickStart = src.indexOf('private monthTick(): boolean {');
  assert.ok(tickStart > 0, '缺 monthTick()');
  const tick = src.slice(tickStart, src.indexOf('private enterInterior', tickStart));
  const a = tick.indexOf('GameState.advanceMonth(this.cities');
  const b = tick.indexOf('this.advanceArmiesMonth()');
  const c = tick.indexOf('this.runMapAi()');"""

assert old in s, 'anchor missing'
s = s.replace(old, new, 1)

# enterInterior 同样用整源正则
s = s.replace(
    """  const enter = fnBody(src, 'enterInterior');
  assert.ok(enter.length > 50, '缺 enterInterior()');
  assert.match(enter, /openCityPanel\\(/);""",
    """  assert.match(src, /private enterInterior\\(\\): void \\{/);
  assert.match(src, /openCityPanel\\(home\\);/);""",
    1,
)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('patched')
