# -*- coding: utf-8 -*-
"""核对 172 表里证据列的 file:line 是否真的落在对应符号上。"""
import io

ROOT = r'F:\sanguo\game'

CLAIMS = [
    ('src/core/levels.ts', 114, 'startLevelOf'),
    ('src/core/levels.ts', 138, 'troopCapOf'),
    ('src/core/levels.ts', 148, 'cavalryCapOf'),
    ('src/core/levels.ts', 168, 'troopCapSumOf'),
    ('src/core/levels.ts', 177, 'troopColumnsOf'),
    ('src/core/battle.ts', 932, 'hpCapOf'),
    ('src/core/battle.ts', 949, 'mpCapOf'),
    ('src/core/battle.ts', 1091, 'activeMaskOf'),
    ('src/core/battle.ts', 1267, 'basicDamage'),
    ('src/core/battle.ts', 2415, 'qiPowerPercentOf'),
    ('src/core/battle.ts', 2808, 'levelFromExp'),
    ('src/core/battle.ts', 1710, 'formationBonus'),
    ('src/core/battle.ts', 672, 'formationCells'),
    ('src/core/battle.ts', 1615, 'moraleTerm'),
    ('src/core/battle.ts', 3021, 'ovHp'),
    ('src/core/battle.ts', 3031, 'learnedAtLevelUp'),
    ('web/city_model.js', 914, 'develop'),
    ('web/city_model.js', 931, '0x427A84'),
    ('web/city_model.js', 934, '0x427947'),
    ('web/city_model.js', 1259, 'runAutonomy'),
    ('web/city_model.js', 1304, 'autonomyTick'),
    ('web/city_model.js', 673, 'prepStateOf'),
    ('web/city_model.js', 685, 'refillPrep'),
    ('web/city_model.js', 1377, 'searchPools'),
    ('web/city_model.js', 1393, 'ONLYONE'),
    ('web/city_model.js', 833, 'wiseOf'),
    ('web/city_model.js', 198, 'STAGE1'),
    ('web/city_model.js', 968, 'searchSeq'),
    ('web/city_model.js', 282, 'SEARCH_NONCE_KEY'),
    ('web/deploy.html', 546, '軍師技'),
    ('src/core/capture.ts', 265, 'loyal > 90'),
    ('src/core/capture.ts', 268, 'loyal > 70'),
    ('src/core/capture.ts', 271, 'loyal > 50'),
    ('src/core/capture.ts', 274, 'rollRecruit'),
    ('src/core/capture.ts', 412, 'isKingOf'),
    ('src/core/capture.ts', 419, 'constancy) * 2'),
    ('src/core/capture.ts', 437, '0x40EEAA'),
    ('src/core/capture.ts', 438, '2) / 3'),
    ('tests/battle.test.ts', 204, 'fxTtlOf'),
    ('tests/battle.test.ts', 205, '57'),
    ('tests/syso.test.ts', 57, 'SYSTEM_SO_FUNCTIONS.length'),
    ('tests/script_instances.test.ts', 10, '0x312'),
    ('tests/smartscript.test.ts', 185, '>='),
    ('src/core/roster.ts', 293, 'applyPostBattle'),
    ('src/core/roster.ts', 567, 'surrenderCandidates'),
    ('src/core/roster.ts', 634, 'applySurrender'),
    ('src/core/strategy.ts', 250, 'STRATEGY_TABLE'),
    ('src/core/strategy.ts', 456, 'planStrategy'),
    ('src/core/strategy.ts', 685, 'runStrategy'),
    ('src/core/strategy.ts', 1055, 'planReinforceGroups'),
    ('web/monarch_model.js', 340, 'extinguish'),
    ('web/monarch_model.js', 386, 'kingDeath'),
    ('web/campaign.html', 1996, 'forceExtinct'),
    ('web/ai_model.js', 2028, 'ACT_IMPL'),
]

bad = 0
for path, ln, tok in CLAIMS:
    full = ROOT + '\\' + path.replace('/', '\\')
    lines = io.open(full, encoding='utf-8').read().split('\n')
    hit = None
    for i in range(max(0, ln - 12), min(len(lines), ln + 12)):
        if tok in lines[i]:
            hit = i + 1
            break
    if hit is None:
        bad += 1
        print('FAIL %-32s :%d  %s' % (path, ln, tok))
print('checked=%d fail=%d' % (len(CLAIMS), bad))
