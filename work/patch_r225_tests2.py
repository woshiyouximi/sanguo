# -*- coding: utf-8 -*-
"""R225：恢复两个测试文件后做**最小**替换（不搬整段，避免误删相邻用例）。"""
import io
import subprocess

ROOT = r'F:\sanguo'


def restore(rel):
    data = subprocess.run(['git', 'show', 'HEAD:' + rel], cwd=ROOT,
                          capture_output=True).stdout
    io.open(ROOT + '\\' + rel.replace('/', '\\'), 'wb').write(data)
    return io.open(ROOT + '\\' + rel.replace('/', '\\'), encoding='utf-8').read()


# ---------- 1) cocos_p1_port.test.ts：只换 F4 用例体内的断言 ----------
P1 = 'game/tests/cocos_p1_port.test.ts'
s = restore(P1)

head_anchor = "test('[F4] Cocos CampaignRoot：doAction(\"advance\") 走 endInterior()，逐月結算不是月份 +12', () => {\n  const src = cocos('CampaignRoot.ts');\n"
assert head_anchor in s, 'F4 head anchor missing'
body_start = s.index(head_anchor) + len(head_anchor)
tail_anchor = "\n});\n\ntest('[F4] Cocos 稅入預覽與 web annualTax 同口徑"
body_end = s.index(tail_anchor)
new_body = r"""
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
  assert.match(step, /this\.monthTick\(\)/);
  const tick = fnBody(src, 'monthTick');
  const a = tick.indexOf('GameState.advanceMonth(this.cities');
  const b = tick.indexOf('this.advanceArmiesMonth()');
  const c = tick.indexOf('this.runMapAi()');
  assert.ok(a > 0 && b > a && c > b, 'monthTick() 的順序必須是 advanceMonth → advanceArmiesMonth → runMapAi');
  // 原作常量：一年 3600 tick（0x41B849）
  assert.match(src, /private clockT = 3600;/);
  // T==0 → 進內政（原作 0x41B6CF）
  const enter = fnBody(src, 'enterInterior');
  assert.ok(enter.length > 50, '缺 enterInterior()');
  assert.match(enter, /openCityPanel\(/);

  // 按鈕文案仍是「內 政 終 了」
  assert.doesNotMatch(src, /title: '推進一月'/);
  assert.match(src, /title: '內 政 終 了'/);
"""
s = s[:body_start] + new_body + s[body_end:]

# 用例标题也改成新语义（保留稳定的 'test(' 前缀，避免影响其它匹配）
s = s.replace(
    "test('[F4] Cocos CampaignRoot：doAction(\"advance\") 走 endInterior()，逐月結算不是月份 +12', () => {",
    "test('[F4][R225] 時間由 update(dt) 的原作時鐘推進（endInterior 只重設 T）', () => {",
)
io.open(ROOT + '\\' + P1.replace('/', '\\'), 'w', encoding='utf-8', newline='\n').write(s)
print('patched', P1)

# ---------- 2) encounter_battle.test.ts：只把 endInterior 契约挪到 monthTick ----------
P2 = 'game/tests/encounter_battle.test.ts'
t = restore(P2)
reps = [
    ("const END_INTERIOR = fnBody(COCOS, 'endInterior');",
     "const MONTH_TICK = fnBody(COCOS, 'monthTick');"),
    ("test('源码契约：endInterior() 遇戰立刻收手（不繼續跑剩餘月份/AI）', () => {",
     "test('源码契约：monthTick() 遇戰立刻收手（不繼續跑剩餘月份/AI）', () => {"),
    ("assert.ok(END_INTERIOR, '找不到 endInterior()');",
     "assert.ok(MONTH_TICK, '找不到 monthTick()');"),
    ("assert.ok(END_INTERIOR.includes('moved.battle'), 'endInterior() 沒檢查 moved.battle');",
     "assert.ok(MONTH_TICK.includes('moved.battle'), 'monthTick() 沒檢查 moved.battle');"),
    ("const atCheck = END_INTERIOR.indexOf('moved.battle');",
     "const atCheck = MONTH_TICK.indexOf('moved.battle');"),
    ("const atAi = END_INTERIOR.indexOf('this.runMapAi()');",
     "const atAi = MONTH_TICK.indexOf('this.runMapAi()');"),
    ("assert.ok(atCheck >= 0 && atAi >= 0, 'endInterior() 找不到 moved.battle 或 runMapAi');",
     "assert.ok(atCheck >= 0 && atAi >= 0, 'monthTick() 找不到 moved.battle 或 runMapAi');"),
]
for old, new in reps:
    if old not in t:
        print('MISS:', old[:60])
    t = t.replace(old, new)
io.open(ROOT + '\\' + P2.replace('/', '\\'), 'w', encoding='utf-8', newline='\n').write(t)
print('patched', P2)
