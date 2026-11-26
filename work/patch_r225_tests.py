# -*- coding: utf-8 -*-
"""R225：把两条「内政終了跑完一年」的旧契约测试改成原作时钟语义。"""
import io

P1 = r'F:\sanguo\game\tests\cocos_p1_port.test.ts'
s = io.open(P1, encoding='utf-8').read()

start = s.index("test('[F4] Cocos CampaignRoot")
end = s.index("test('[F4] Cocos 稅入預覽與 web annualTax 同口徑")
new = r"""test('[F4][R225] 時間由 update(dt) 的原作時鐘推進，不再按鈕跑完一年', () => {
  const src = cocos('CampaignRoot.ts');

  // 入口：advance 仍轉呼叫 endInterior()（原作 0x41BBF5 的那顆按鈕）
  const doAction = fnBody(src, 'doAction');
  assert.match(doAction, /kind === 'advance'[\s\S]{0,400}this\.endInterior\(\);/);

  // endInterior（原作 0x41BBF5）＝ 只把 T 重設 3600 + 恢復時鐘，**不跑模擬**
  const end = fnBody(src, 'endInterior');
  assert.ok(end.length > 100, 'CampaignRoot.ts 缺 endInterior()');
  assert.match(end, /this\.clockT = 3600;/);
  assert.match(end, /this\.clockPaused = false;/);
  assert.doesNotMatch(end, /for \(let i = 0; i < steps; i \+= 1\)/, 'endInterior() 不能再一次性跑 12 個月');

  // 時鐘本體：update(dt) → stepClock → monthTick（每月一次結算）
  const upd = fnBody(src, 'update');
  assert.match(upd, /this\.stepClock\(this\.clockSpeed\)/);
  const step = fnBody(src, 'stepClock');
  assert.match(step, /this\.clockT = Math\.max\(0, this\.clockT - n\);/);
  assert.match(step, /Math\.floor\(\(3600 - this\.clockT\) \/ 300\)/);
  assert.match(step, /this\.monthTick\(\)/);
  const tick = fnBody(src, 'monthTick');
  const a = tick.indexOf('GameState.advanceMonth(this.cities');
  const b = tick.indexOf('this.advanceArmiesMonth()');
  const c = tick.indexOf('this.runMapAi()');
  assert.ok(a > 0 && b > a && c > b, 'monthTick() 的順序必須是 advanceMonth → advanceArmiesMonth → runMapAi');
  // 原作常量：一年 3600 / 一月 300（0x41B849 / 0x41B855）
  assert.match(src, /private clockT = 3600;/);
  // T==0 → 進內政
  const enter = fnBody(src, 'enterInterior');
  assert.ok(enter.length > 50, '缺 enterInterior()');
  assert.match(enter, /openCityPanel\(/);

  // 按鈕文案仍是「內 政 終 了」
  assert.doesNotMatch(src, /title: '推進一月'/);
  assert.match(src, /title: '內 政 終 了'/);
});

"""
s = s[:start] + new + s[end:]
io.open(P1, 'w', encoding='utf-8', newline='\n').write(s)
print('patched', P1)

P2 = r'F:\sanguo\game\tests\encounter_battle.test.ts'
t = io.open(P2, encoding='utf-8').read()
old_name = "test('源码契约：endInterior() 遇戰立刻收手（不繼續跑剩餘月份/AI）', () => {"
assert old_name in t
i = t.index(old_name)
# 找到该 test 的结尾（下一个 test( 或文件尾）
j = t.find("\ntest(", i + 10)
if j < 0:
    j = len(t)
new2 = r"""test('源码契约：monthTick() 遇戰立刻收手（不繼續跑剩餘月份/AI）', () => {
  const tick = fnBody(COCOS, 'monthTick');
  assert.ok(tick, '找不到 monthTick()');
  assert.ok(tick.includes('moved.battle'), 'monthTick() 沒檢查 moved.battle');
  const atCheck = tick.indexOf('moved.battle');
  const atAi = tick.indexOf('this.runMapAi()');
  assert.ok(atCheck >= 0 && atAi >= 0, 'monthTick() 找不到 moved.battle 或 runMapAi');
  assert.ok(atCheck < atAi, 'moved.battle 的早退必須在 runMapAi() 之前');
});
"""
t = t[:i] + new2 + t[j:]
io.open(P2, 'w', encoding='utf-8', newline='\n').write(t)
print('patched', P2)
