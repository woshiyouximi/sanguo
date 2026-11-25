# -*- coding: utf-8 -*-
import io, sys

p = r'F:\sanguo\work\gen172.py'
t = io.open(p, encoding='utf-8').read()

pairs = [
    ('`web/city_model.js:908` develop（`:925`/`:928` 兩支）',
     '`web/city_model.js:914` develop（`:931`/`:934` 兩支）'),
    ('`web/city_model.js:1253` runAutonomy / `:1298` autonomyTick',
     '`web/city_model.js:1259` runAutonomy / `:1304` autonomyTick'),
    ('`web/city_model.js:194` SEARCH、`:968-1010` 入口',
     '`web/city_model.js:194` SEARCH、`:198` STAGE1、`:968` 入口'),
    ('`web/city_model.js:667` prepStateOf / `:679` refillPrep；`src/core/levels.ts:152` cavalryCapOf',
     '`web/city_model.js:673` prepStateOf / `:685` refillPrep；`src/core/levels.ts:148` cavalryCapOf'),
    ('`src/core/levels.ts:141` troopCapOf',
     '`src/core/levels.ts:138` troopCapOf'),
    ('`src/core/levels.ts:152` cavalryCapOf；`tests/level_troop.test.ts`',
     '`src/core/levels.ts:148` cavalryCapOf；`tests/level_troop.test.ts`'),
    ('`src/core/battle.ts:896` hpCapOf / `:913` mpCapOf',
     '`src/core/battle.ts:932` hpCapOf / `:949` mpCapOf'),
    ('`src/core/battle.ts:2986-3002`',
     '`src/core/battle.ts:3022-3038`'),
    ('`src/core/battle.ts:3004` learnedAtLevelUp',
     '`src/core/battle.ts:3040` learnedAtLevelUp'),
    ('`src/core/battle.ts:2781` levelFromExp',
     '`src/core/battle.ts:2817` levelFromExp'),
    ('`src/core/battle.ts:1674` formationBonus',
     '`src/core/battle.ts:1710` formationBonus'),
    ('`src/core/battle.ts:660` formationCells',
     '`src/core/battle.ts:672` formationCells'),
    ('`web/city_model.js:827` wiseOf',
     '`web/city_model.js:833` wiseOf'),
    ('`:1580` moraleTerm', '`:1615` moraleTerm'),
    ('`:2406` qiPowerPercentOf', '`:2424` qiPowerPercentOf'),
    ('`:1055` activeMaskOf', '`:1091` activeMaskOf'),
    ("'`src/core/capture.ts:206-208`、`:265-272`；`tests/capture.test.ts` 11', 0, ''),",
     "'`src/core/capture.ts:264-272`（三硬門）、`:274` rollRecruit；`tests/capture.test.ts` 11', 0, '硬門置於擲骰前（註釋記原作在擲骰後），RNG 消耗差 1 次，不影響「必不降」結論'),"),
    ('`src/core/capture.ts:411-442`', '`src/core/capture.ts:408-445`'),
    ("'`src/core/capture.ts:148`；`tests/capture.test.ts` 11', 0, ''),",
     "'`src/core/capture.ts:412` isKingOf；`tests/capture.test.ts` 11', 0, ''),"),
    ('`src/core/capture.ts:416`、`:438`；`tests/capture.test.ts` 11',
     '`src/core/capture.ts:419`（先扣）、`:437-438`（折 2/3）；`tests/capture.test.ts` 11'),
    ('`tests/battle.test.ts:180-205`（多目標 + fxTtl 57）、`tests/skill_kind.test.ts`',
     '`tests/battle.test.ts:176-206`（特效 57 tick）、`tests/skill_kind.test.ts`'),
    ('`web/deploy.html:512` 只列已學；`web/main.js:705` applyWise',
     '`web/deploy.html:546` 只列已學；`web/main.js:705` applyWise'),
    ("'`game/data/formations.json` 有 matrix；`src/core/battle.ts:1674 formationBonus` 返回 `data.formations.matrix[aForm]?.vs[bForm] ?? 0`。',",
     "'`game/data/formations.json` 有 matrix；`src/core/battle.ts:1710 formationBonus` 返回 `data.formations.matrix[aForm]?.vs[bForm] ?? 0`。',"),
    ("'`:804` formationCells 用于站位、`:2209` 每个 tick 写 `rt.formationBonus`，说明矩阵真的进了战力（`:1597` 五段加法里有一项）。',",
     "'`:672` formationCells 用于站位、`:1633`/`:2245` 写并消费 `rt.formationBonus`，说明矩阵真的进了战力。',"),
    ("'`:265-272` 在掷骰之后仍逐档 return（注释明确\"这三段在掷骰之后，不能表达成降低概率，只能恒 0\"）。',",
     "'`:264-272` 三段逐档 return；注释明确「原作这三段在掷骰之后，只能恒 0」。代码把硬门放在 `:274 rollRecruit` 之前——结论等价，但少消耗一次 rand()（已在备注标为已知微差）。',"),
]

miss = 0
for old, new in pairs:
    n = t.count(old)
    if n != 1:
        miss += 1
        print('SKIP(%d): %s' % (n, old[:80]))
        continue
    t = t.replace(old, new)

# 时间戳：改成生成时的真实时间
if '生成時間：2026-11-25 15:1x' in t:
    import datetime
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    t = t.replace('生成時間：2026-11-25 15:1x', '生成時間：%s' % now)

# 4.x -> 4.1..4.12
if "A('### 4.x %s（新判 %s）— 抽樣理由：%s' % (rid, st, why))" in t:
    old4 = "    for rid, st, why, steps, concl in CROSS:\n        A('### 4.x %s（新判 %s）— 抽樣理由：%s' % (rid, st, why))"
    new4 = "    for ci, (rid, st, why, steps, concl) in enumerate(CROSS, 1):\n        A('### 4.%d %s（新判 %s）— 抽樣理由：%s' % (ci, rid, st, why))"
    if old4 in t:
        t = t.replace(old4, new4)
    else:
        print('SKIP: 4.x block not found as expected')

# 37a 追加改为幂等：已存在 §十七 就先截断
old_append = "    with io.open(P37A, 'a', encoding='utf-8', newline='\\n') as f:"
new_append = ("    if os.path.exists(P37A):\n"
              "        old = io.open(P37A, encoding='utf-8').read()\n"
              "        k = old.find('## §十七')\n"
              "        if k >= 0:\n"
              "            with io.open(P37A, 'w', encoding='utf-8', newline='\\n') as f:\n"
              "                f.write(old[:k].rstrip('\\n') + '\\n')\n"
              "\n"
              "    with io.open(P37A, 'a', encoding='utf-8', newline='\\n') as f:")
if old_append in t:
    t = t.replace(old_append, new_append)
else:
    print('SKIP: append block not found')

io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('patched, missed=%d' % miss)
