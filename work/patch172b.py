# -*- coding: utf-8 -*-
import io

p = r'F:\sanguo\work\gen172.py'
t = io.open(p, encoding='utf-8').read()

pairs = [
    ('`src/core/battle.ts:3022-3038`（ovHp/ovMp + hpCapOf/mpCapOf 重算）',
     '`src/core/battle.ts:3017-3028`（ovHp/ovMp + hpCapOf/mpCapOf 重算）'),
    ('`src/core/battle.ts:3040` learnedAtLevelUp',
     '`src/core/battle.ts:3031` learnedAtLevelUp'),
    ('`src/core/battle.ts:2817` levelFromExp',
     '`src/core/battle.ts:2808` levelFromExp'),
    ('`:2424` qiPowerPercentOf', '`:2415` qiPowerPercentOf'),
    # §3 表头加一句“行号会漂”的免责
    ("    A('表格約定：**工時 = 該行剩餘工時**（✅/⬜ 為 0）；「證據」一律給 `file:line` 或測試檔名，都是本機 grep/讀檔可復現的；備註裡的「旧 X → Y」是舊狀態列到本輪的翻轉記錄。')",
     "    A('表格約定：**工時 = 該行剩餘工時**（✅/⬜ 為 0）；「證據」一律給 `file:line` 或測試檔名，都是本機 grep/讀檔可復現的；備註裡的「旧 X → Y」是舊狀態列到本輪的翻轉記錄。')\n"
     "    A('')\n"
     "    A('> 行號說明：證據列的行號是 2026-11-25 15:3x 生成時的位置。`src/core/battle.ts`、`web/city_model.js` 當時仍有其他任務在改（`battle.ts` 在 30 分鐘內從 3078 行變成 3069 行），**行號會漂，以函數名/測試名 grep 為準**——每條證據都帶了符號名。')"),
]

for old, new in pairs:
    n = t.count(old)
    if n != 1:
        print('SKIP(%d): %s' % (n, old[:70]))
        continue
    t = t.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('patched2')
