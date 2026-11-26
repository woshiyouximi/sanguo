import io

ROOT = r'F:\sanguo\game\cocos\assets\scripts'


def patch(path, pairs):
    p = ROOT + '\\' + path
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f'NOT FOUND in {path}: {old[:70]!r}')
        s = s.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)


patch('DeployRoot.ts', [
    ("import { addOutline, addVeil, ArtBg, ArtSprite, loadFrame } from './ArtLayer';",
     "import { addOutline, addVeil, ArtBg, ArtSprite, loadFrame } from './ArtLayer';\n"
     "import { latchTap } from './InputLatch';"),
    ("      if (button.kind === 'back') {\n        director.loadScene('Campaign');",
     "      if (button.kind === 'back') {\n        latchTap();\n        director.loadScene('Campaign');"),
    ("      if (button.kind === 'go') {\n        this.persistQueue();\n        this.march();",
     "      if (button.kind === 'go') {\n        latchTap();\n        this.persistQueue();\n        this.march();"),
])

patch('CityPanel.ts', [
    ('      bag: this.bag.slice(),',
     '      bag: Array.isArray(this.bag) ? this.bag.slice() : [],'),
    ('    this.bag = M.parseItemsSave(this.readBagRaw()).bag;',
     '    const parsedBag = M.parseItemsSave(this.readBagRaw()).bag;\n'
     '    // 空背包的存档会解析出 null / undefined（R224 P0-1 崩溃点之一），统一收敛成空数组\n'
     '    this.bag = Array.isArray(parsedBag) ? parsedBag : [];'),
])

patch('CampaignRoot.ts', [
    ('  private onTouch(event: EventTouch): void {\n'
     "    // 【r224】全屏暗幕（城池一覽/勢力圖/存檔位/名冊）開著時，大地圖不吃任何點擊。",
     '  private onTouch(event: EventTouch): void {\n'
     '    // 【r224 P0-1】同一幀的點擊已經被別的场景（出征编成頁）認領，大地圖不再處理：\n'
     '    // 否則「出征」那一擊會順帶打到「內政終了」，把剛開的局推過一年並炸掉輸入鏈。\n'
     '    if (tapLatched()) return;\n'
     '    // 【r224】全屏暗幕（城池一覽/勢力圖/存檔位/名冊）開著時，大地圖不吃任何點擊。'),
    ("import { addOutline, addVeil, ArtBg, ArtSprite, loadFrame } from './ArtLayer';",
     "import { addOutline, addVeil, ArtBg, ArtSprite, loadFrame } from './ArtLayer';\n"
     "import { latchTap, tapLatched } from './InputLatch';"),
])
