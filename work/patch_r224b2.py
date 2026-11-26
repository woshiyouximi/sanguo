import io

P = r'F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts'
s = io.open(P, encoding='utf-8').read()

old_imp = "import { CityPanel, CITY_EXTRAS_KEY } from './CityPanel';"
if old_imp not in s:
    raise SystemExit('import anchor not found')
s = s.replace(old_imp, old_imp + "\nimport { latchTap, tapLatched } from './InputLatch';", 1)

old_touch = ('  private onTouch(event: EventTouch): void {\n'
             '    // 【r224】全屏暗幕（城池一覽/勢力圖/存檔位/名冊）開著時，大地圖不吃任何點擊。')
new_touch = ('  private onTouch(event: EventTouch): void {\n'
             '    // 【r224 P0-1】同一幀的點擊已經被別的场景（出征编成頁）認領，大地圖不再處理：\n'
             '    // 否則「出征」那一擊會順帶打到「內政終了」，把剛開的局推過一年，並在換月鏈路裡炸掉輸入。\n'
             '    if (tapLatched()) return;\n'
             '    // 【r224】全屏暗幕（城池一覽/勢力圖/存檔位/名冊）開著時，大地圖不吃任何點擊。')
if old_touch not in s:
    raise SystemExit('onTouch anchor not found')
s = s.replace(old_touch, new_touch, 1)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('patched CampaignRoot.ts')
