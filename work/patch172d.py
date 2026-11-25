# -*- coding: utf-8 -*-
import io

p = r'F:\sanguo\work\gen172.py'
t = io.open(p, encoding='utf-8').read()

pairs = [
    # R12
    ('`web/city_model.js:673` prepStateOf / `:685` refillPrep；`src/core/levels.ts:148` cavalryCapOf',
     '`web/city_model.js:673` prepStateOf / `:685` refillPrep；`src/core/levels.ts:152` cavalryCapOf'),
    # R17 / R19
    ('`web/city_model.js:1371` searchPools；`tests/guard_r17.test.ts` 4',
     '`web/city_model.js:1377` searchPools；`tests/guard_r17.test.ts` 4'),
    ('`web/city_model.js:1371` searchPools 權重剔除；`tests/guard_r19.test.ts` 4',
     '`web/city_model.js:1377` searchPools 權重剔除；`tests/guard_r19.test.ts` 4'),
    # R18
    ('`web/city_model.js:1387` ONLYONE skip',
     '`web/city_model.js:1393` ONLYONE skip'),
    # R21 / R22
    ('`src/core/levels.ts:138` troopCapOf；`tests/level_troop.test.ts`',
     '`src/core/levels.ts:141` troopCapOf；`tests/level_troop.test.ts`'),
    ('`src/core/levels.ts:148` cavalryCapOf；`tests/level_troop.test.ts`',
     '`src/core/levels.ts:152` cavalryCapOf；`tests/level_troop.test.ts`'),
    # R46
    ('`src/core/battle.ts:1231` basicDamage；`tests/battle.test.ts`',
     '`src/core/battle.ts:1267` basicDamage；`tests/battle.test.ts`'),
    # R70
    ('`web/saves.js:40-43` v3、`:1148` 寫檔；`tests/saves_r70.test.ts` 30',
     '`web/saves.js:40-43` v3、`:1154` prepareSnapshot（寫檔入口）；`tests/saves_r70.test.ts` 30'),
    # R73
    ('`web/ai_model.js:1323` planMonth；`tests/ai_act.test.ts` 34',
     '`web/ai_model.js:2102` planMonth；`tests/ai_act.test.ts` 34'),
    # R53 证据与备注
    ("'`src/core/capture.ts:264-272`（三硬門）、`:274` rollRecruit；`tests/capture.test.ts` 11', 0, '硬門置於擲骰前（註釋記原作在擲骰後），RNG 消耗差 1 次，不影響「必不降」結論'),",
     "'`src/core/capture.ts:206-208` recruitChanceOf 三硬門（code 0x11/0x12/0x13）、`:264-272` canRecruit 同規則；`tests/capture.test.ts` 11', 0, '三檔合併等價於 L>50 恒 0，仍逐档判以對上原作 code'),"),
    # 交叉校验 R53 文字
    ('` :264-272` 三段逐档 return；注释明确「原作这三段在掷骰之后，只能恒 0」。代码把硬门放在 `:274 rollRecruit` 之前——结论等价，但少消耗一次 rand()（已在备注标为已知微差）。',
     '` :206-208` 在 `recruitChanceOf()` 里逐档 return 0（code 0x11/0x12/0x13，注释引 `cmp [g+0x3C],0x5A / jg`），`:264-272` 在 `canRecruit()` 里同规则再判一次给上层文案。'),
]

for old, new in pairs:
    n = t.count(old)
    if n != 1:
        print('SKIP(%d): %s' % (n, old[:70]))
        continue
    t = t.replace(old, new)

# 交叉校验 R53 的旧第一条（`:206-208` 与 `:265-272` 的措辞）
old_c1 = "'`src/core/capture.ts:206-208` 三段 `if (loyal > 90) return 0; // 0x404344 code 0x11` … `>70`、`>50`。',"
if old_c1 in t:
    t = t.replace(old_c1, "'`src/core/capture.ts:206-208`：`if (loyal > 90) return 0; // 0x404344 code 0x11`，接着 `>70`（code 0x12）、`>50`（code 0x13）。',")
else:
    print('note: c1 not found (ok if earlier text differs)')

io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('patched4')
