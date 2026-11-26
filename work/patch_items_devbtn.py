# -*- coding: utf-8 -*-
"""R224：把 ItemsPanel 的「全部解鎖 / 補滿背包」按 web 調試台設施处理——原生包（正式版）隐藏。

依 project/215_双端口径与调试开关.md：Cocos = 正式版，web = 調試台。
`game/web/items.html:199` 那顆按鈕本身就標了「調試」。
"""
import io, re

P = r'F:\sanguo\game\cocos\assets\scripts\ItemsPanel.ts'
s = io.open(P, encoding='utf-8').read()
orig = s

helper = '''/**
 * R224：`全部解鎖`（補滿背包）是 **web 調試台** 的設施（`game/web/items.html:199` 標了「調試」）。
 * 依 `project/215_双端口径与调试开关.md`「Cocos = 正式版」，原生包（`sys.isNative`）與 `?rel=1`
 * 發佈形態都不該出現；只在 web-mobile 預覽 / headless 驗證裡保留。
 */
function devToolsOn(): boolean {
  try {
    const g = globalThis as unknown as {
      cc?: { sys?: { isNative?: boolean } };
      location?: { search?: string };
    };
    if (g.cc && g.cc.sys && g.cc.sys.isNative) return false;
    const search = String(g.location?.search ?? '');
    if (/[?&]rel=1(?:&|$)/.test(search)) return false;
    return true;
  } catch {
    return true;
  }
}

'''

anchor = 'const SKIN_SLOTS: readonly SkinSlot[] = ['
if 'function devToolsOn()' not in s:
    s = s.replace(anchor, helper + anchor, 1)

if 'private devTools = true;' not in s:
    s = s.replace(
        '  private labelUnlockMain: Label | null = null;',
        '  /** R224：調試設施是否可見（原生包＝false，見 `devToolsOn()`）。 */\n'
        '  private devTools = true;\n\n'
        '  private labelUnlockMain: Label | null = null;',
        1,
    )

old = "    this.labelUnlockMain = this.makeLabel('ItemsUnlockMain', '全部解鎖', this.unlockMainRect(), 15, COLORS.text, 'center');"
new = ("    this.devTools = devToolsOn();\n"
       "    this.labelUnlockMain = this.makeLabel('ItemsUnlockMain', '全部解鎖', this.unlockMainRect(), 15, COLORS.text, 'center');\n"
       "    // R224：正式版藏掉「全部解鎖 / 補滿背包」（web 調試台設施），底板與命中一起收。\n"
       "    this.labelUnlockMain.node.active = this.devTools;")
if old in s:
    s = s.replace(old, new, 1)

old2 = "    this.labelUnlockSub = this.makeLabel('ItemsUnlockSub', '補滿背包', this.unlockSubRect(), 11, COLORS.textFaint, 'center');"
new2 = old2 + "\n    this.labelUnlockSub.node.active = this.devTools;"
if old2 in s and 'this.labelUnlockSub.node.active' not in s:
    s = s.replace(old2, new2, 1)

old3 = '      this.skinNodes.set(slot.name, node);\n    }'
new3 = ('      this.skinNodes.set(slot.name, node);\n    }\n'
        "    const unlockPlate = this.skinNodes.get('SkinUnlockPlate');\n"
        '    if (unlockPlate) unlockPlate.active = this.devTools;')
if old3 in s and 'unlockPlate.active' not in s:
    s = s.replace(old3, new3, 1)

old4 = '    this.addHit(LAYOUT.unlockBtn, () => this.unlockAll());'
new4 = '    if (this.devTools) this.addHit(LAYOUT.unlockBtn, () => this.unlockAll());'
if old4 in s:
    s = s.replace(old4, new4, 1)

old5 = "if (!this.bag.has(seq)) return '背包裡沒有這件（按「全部解鎖」可補滿）';"
new5 = ("if (!this.bag.has(seq)) return this.devTools\n"
        "      ? '背包裡沒有這件（按「全部解鎖」可補滿）'\n"
        "      : '背包裡沒有這件';")
if old5 in s:
    s = s.replace(old5, new5, 1)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('CHANGED', s != orig, 'LINES', len(s.splitlines()))
