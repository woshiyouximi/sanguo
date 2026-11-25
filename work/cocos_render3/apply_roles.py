# -*- coding: utf-8 -*-
"""w9-render3：把既有 role 调用改到新增的 tip / badge 两级（语义收敛，不动字号）。

规则：
  · 只改 applyTextRole/applyTextRoles 调用里的 role 字面量，字号参数原样保留；
  · 每处替换要求在原文件里**恰好出现一次**，否则整份脚本不写盘（避免误伤被断言锁死的行）；
  · 用字节级读写 + utf-8，绝不经过 PowerShell 的默认编码（本项目 GBK/BOM 坑）。
"""
import io
import sys

ROOT = r'F:\sanguo\game\cocos\assets\scripts'

# (文件, 原串, 新串, 说明)
EDITS = [
    # ---- 大地圖 CampaignRoot ----
    ('CampaignRoot.ts', "applyTextRoles(this.labelLegend, 'body', 12);",
     "applyTextRoles(this.labelLegend, 'tip', 12);", '圖例三色說明 = tip'),
    ('CampaignRoot.ts', "applyTextRole(this.labelHint, 'body', 15);",
     "applyTextRole(this.labelHint, 'tip', 15);", '底欄提示 = tip'),
    ('CampaignRoot.ts', "applyTextRole(this.labelSubtitle, 'body', 14);",
     "applyTextRole(this.labelSubtitle, 'tip', 14);", '頁頭副標 = tip'),
    ('CampaignRoot.ts', "applyTextRoles(this.actionSubs, 'body', 13);",
     "applyTextRoles(this.actionSubs, 'badge', 13);", '月令按鈕角標 = badge'),
    ('CampaignRoot.ts', "applyTextRoles(this.logTimeLabels, 'body', 12);",
     "applyTextRoles(this.logTimeLabels, 'badge', 12);", '戰報月份 = badge'),
    ('CampaignRoot.ts', "applyTextRoles(this.logTextLabels, 'body', 13);",
     "applyTextRoles(this.logTextLabels, 'tip', 13);", '戰報正文 = tip'),
    ('CampaignRoot.ts', "applyTextRole(this.logEmpty, 'body', 13);",
     "applyTextRole(this.logEmpty, 'tip', 13);", '戰報空態 = tip'),
    ('CampaignRoot.ts', "applyTextRole(this.logPrev, 'num', 13);",
     "applyTextRole(this.logPrev, 'badge', 13);", '戰報翻頁 = badge'),
    ('CampaignRoot.ts', "applyTextRole(this.logNext, 'num', 13);",
     "applyTextRole(this.logNext, 'badge', 13);", '戰報翻頁 = badge'),
    # ---- 內政 CityPanel ----
    ('CityPanel.ts', "applyTextRole(this.lblLogState, 'num', 15);",
     "applyTextRole(this.lblLogState, 'badge', 15);", '紀錄「最近 5 條」= badge'),
    ('CityPanel.ts', "applyTextRole(this.lblHint, 'body', 16);",
     "applyTextRole(this.lblHint, 'tip', 16);", '頁尾提示 = tip'),
    ('CityPanel.ts', "applyTextRole(this.lblBandTip, 'body', 14);",
     "applyTextRole(this.lblBandTip, 'tip', 14);", '朝堂紀要第三行 = tip'),
    # ---- 物品 ItemsPanel ----
    ('ItemsPanel.ts', "applyTextRole(this.labelSub, 'body', 14);",
     "applyTextRole(this.labelSub, 'tip', 14);", '頁頭統計副標 = tip'),
    ('ItemsPanel.ts', "applyTextRole(this.labelGenCity, 'body', 13);",
     "applyTextRole(this.labelGenCity, 'tip', 13);", '武將卡「所在」= tip'),
    ('ItemsPanel.ts', "applyTextRoles(this.slotKeys, 'body', 13);",
     "applyTextRoles(this.slotKeys, 'badge', 13);", '四槽鑰匙 = badge'),
    ('ItemsPanel.ts', "applyTextRoles(this.pickLabels, 'body', 11);",
     "applyTextRoles(this.pickLabels, 'badge', 11);", '武將格名字 = badge'),
    ('ItemsPanel.ts', "applyTextRoles(this.rowDescs, 'body', 11);",
     "applyTextRoles(this.rowDescs, 'badge', 11);", '列表行說明 = badge'),
    ('ItemsPanel.ts', "applyTextRoles(this.rowMetas, 'num', 10);",
     "applyTextRoles(this.rowMetas, 'badge', 10);", '列表行右側注 = badge'),
    ('ItemsPanel.ts', "applyTextRole(this.labelPage, 'num', 12);",
     "applyTextRole(this.labelPage, 'badge', 12);", '「第 x/8 頁」= badge'),
    ('ItemsPanel.ts', "applyTextRole(this.labelDetType, 'body', 11);",
     "applyTextRole(this.labelDetType, 'badge', 11);", '詳情「兵器 — Lv1」= badge'),
    ('ItemsPanel.ts', "applyTextRole(this.labelDetFoot, 'body', 11);",
     "applyTextRole(this.labelDetFoot, 'tip', 11);", '詳情底注 = tip'),
    ('ItemsPanel.ts', "applyTextRole(this.labelDesc, 'body', 11);",
     "applyTextRole(this.labelDesc, 'tip', 11);", '詳情說明 = tip'),
    ('ItemsPanel.ts', "applyTextRole(this.labelPreview, 'body', 11);",
     "applyTextRole(this.labelPreview, 'tip', 11);", '「裝上後…」= tip'),
    ('ItemsPanel.ts', "applyTextRole(this.labelFieldKeys, 'body', 10);",
     "applyTextRole(this.labelFieldKeys, 'badge', 10);", '原作欄位名 = badge'),
    ('ItemsPanel.ts', "applyTextRole(this.labelFieldVals, 'num', 11);",
     "applyTextRole(this.labelFieldVals, 'badge', 11);", '原作欄位值 = badge'),
    ('ItemsPanel.ts', "applyTextRole(this.labelActSub, 'body', 12);",
     "applyTextRole(this.labelActSub, 'badge', 12);", '底欄按鈕角標 = badge'),
    ('ItemsPanel.ts', "applyTextRole(this.labelUnlockSub, 'body', 11);",
     "applyTextRole(this.labelUnlockSub, 'badge', 11);", '「背包 12 件」= badge'),
    ('ItemsPanel.ts', "applyTextRole(this.labelHint, 'body', 11);",
     "applyTextRole(this.labelHint, 'tip', 11);", '頁底兩行說明 = tip'),
]

by_file = {}
for name, old, new, why in EDITS:
    by_file.setdefault(name, []).append((old, new, why))

fail = False
plan = {}
for name, items in by_file.items():
    path = ROOT + '\\' + name
    with open(path, 'rb') as fh:
        text = fh.read().decode('utf-8')
    for old, new, why in items:
        n = text.count(old)
        if n != 1:
            print('[FAIL] %s: %d 次  %s' % (name, n, old))
            fail = True
            continue
        # 已經改過的話跳過（可重跑）
        if text.count(new) == 1 and old not in text:
            print('[SKIP] %s 已改: %s' % (name, why))
            continue
        text = text.replace(old, new)
        print('[ok] %s  %s' % (name, why))
    plan[name] = text

if fail:
    print('有替換沒對上，全部不寫盤')
    sys.exit(1)

for name, text in plan.items():
    with open(ROOT + '\\' + name, 'wb') as fh:
        fh.write(text.encode('utf-8'))
print('已寫入 %d 個檔' % len(plan))
