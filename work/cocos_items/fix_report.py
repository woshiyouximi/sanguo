import io

path = r'F:\sanguo\project\70_Cocos物品页.md'
text = io.open(path, encoding='utf-8').read()
before = len(text)
for old, new in [('1506', '1483'), ('345 行', '319 行'), ('560 行', '546 行'), ('約 90 KB', '約 86 KB')]:
    text = text.replace(old, new)
io.open(path, 'w', encoding='utf-8', newline='\n').write(text)
print('rewritten', before, '->', len(text))
for needle in ('319 行', '546 行', '1483', '86 KB', '1506', '345 行', '560 行'):
    print(needle, text.count(needle))
