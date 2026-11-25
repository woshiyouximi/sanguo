#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""把 project/161 §2.2 里 23 处被正则锁死的调用点表换成真实行号版。"""
import io

P = r'F:\sanguo\project\161_Cocos渲染对齐3.md'

ROWS = [
    ('CampaignRoot.ts', 1453, "applyTextRole(this.labelTitle, 'title', 32)", ':190'),
    ('CampaignRoot.ts', 1455, "applyTextRole(this.labelMonarch, 'body', 18)", ':192'),
    ('CampaignRoot.ts', 1456, "applyTextRole(this.labelStats, 'body', 18)", ':193'),
    ('CampaignRoot.ts', 1457, "applyTextRole(this.labelMonth, 'num', 20)", ':191'),
    ('CampaignRoot.ts', 1459, "applyTextRole(this.labelItems, 'num', 20)", ':194'),
    ('CampaignRoot.ts', 1460, "applyTextRole(this.labelForces, 'num', 20)", ':194'),
    ('CampaignRoot.ts', 1467, "applyTextRoles(this.actionLabels, 'num', 20)", ':196'),
    ('CampaignRoot.ts', 1472, "applyTextRole(this.logTitle, 'head', 18)", ':195'),
    ('CampaignRoot.ts', 2208, "applyTextRole(label, 'body', CITY_LABEL_FONT)", ':201（另 :418 禁 label.color =）'),
    ('CityPanel.ts', 509, "applyTextRole(this.lblTitle, 'title', FONT.title)", ':259'),
    ('CityPanel.ts', 514, "applyTextRoles(this.hudNames, 'body', 16)", ':264'),
    ('CityPanel.ts', 515, "applyTextRoles(this.hudValues, 'num', 20)", ':265'),
    ('CityPanel.ts', 518, "applyTextRole(this.lblCmdTitle, 'head', 22)", ':261'),
    ('CityPanel.ts', 519, "applyTextRoles(this.cmdTags, 'head', 22)", ':262'),
    ('CityPanel.ts', 520, "applyTextRoles(this.cmdSubs, 'body', 16)", ':263'),
    ('CityPanel.ts', 525, "applyTextRoles(this.logLabels, 'body', 18)", ':266'),
    ('ItemsPanel.ts', 725, "applyTextRole(this.labelTitle, 'title', 32)", ':327'),
    ('ItemsPanel.ts', 751, "applyTextRoles(this.statNames, 'body', 11)", ':328'),
    ('ItemsPanel.ts', 752, "applyTextRoles(this.statVals, 'num', 13)", ':329'),
    ('ItemsPanel.ts', 760, "applyTextRole(this.labelActMain, 'head', 22)", ':330'),
    ('DeployRoot.ts', 676, "applyTextRole(this.labelTitle, 'title', 32)", ':390'),
    ('DeployRoot.ts', 684, "applyTextRoles(this.genLabels, 'body', 16)", ':392'),
    ('DeployRoot.ts', 691, "applyTextRoles(this.actionLabels, 'head', 18)", ':391'),
]

HEAD = (
    '| 文件:行 | 调用点 | 锁它的断言（`skin_nodes_assert.mjs` 行号） |\n'
    '|---|---|---|\n'
)

TAIL = ('\n这 23 处之外，另有 5 处虽没被正则逐字锁，但改字号会让版式跟着变，本轮也保持原值'
        '（`CampaignRoot.ts:1462` `labelLegend/tip12`、`:1465` `labelHint/tip15`、'
        '`:1469` `labelSubtitle/tip14`、`:1470` `actionSubs/badge13`、`:1473` `logTimeLabels/badge12`）——'
        '这 5 处换了 role 但 fontSize 沿用的是原值。\n')


def main():
    s = io.open(P, encoding='utf-8').read()
    start = s.index('| 文件 | 调用点（行号为改后源码）')
    end = s.index('| `DeployRoot.ts:1046`')
    end = s.index('\n', end) + 1
    body = HEAD + ''.join(
        '| `%s:%d` | `%s` | `%s` |\n' % (f, ln, call, rule) for f, ln, call, rule in ROWS
    ) + TAIL
    s = s[:start] + body + s[end:]
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
    print('replaced; rows =', len(ROWS), 'lines =', len(s.splitlines()))


main()
