import json, sys
from PIL import Image

PNG = r'F:\sanguo\work\saves70\map_forces.png'
im = Image.open(PNG).convert('RGB')
print('size', im.size)
px = im.load()

PAL = ['#6E8FBF', '#B98A3E', '#C9A82E', '#8E6BA8', '#4F8F8B', '#7C8A48', '#B14A3B', '#6B6F76', '#D0803C', '#4F9A6E', '#3F6E9A', '#8C6248', '#7A6FB0', '#5E7D5A']
GOLD = '#EFC978'
EDGE = '#080C10'
NEUTRAL = '#8A8478'
RESERVE = ['#4A8D9E', '#9E4F6E', '#6E8E3A', '#8A5FA0', '#3E6F5A', '#A0603A', '#5A6E8E', '#8E8A3A', '#6E4A6E', '#3A7F8E', '#8E6E4A', '#4A6E5A', '#7A4A4A', '#5A8A6E']

def rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

TOL = 10
def near(c, t):
    return all(abs(c[i] - t[i]) <= TOL for i in range(3))

w, h = im.size
counts = {c: 0 for c in PAL + RESERVE + [GOLD, NEUTRAL]}
for y in range(0, h, 1):
    for x in range(0, w, 1):
        c = px[x, y]
        for name in counts:
            if near(c, rgb(name)):
                counts[name] += 1
                break

tot = 0
for name, n in counts.items():
    if n:
        print(f'{name} {n}')
        tot += n
print('palette total hits', tot)

# 具体看几座城周围 24px 内出现的调色板颜色，判断环是否画出来了
S0 = json.load(open(r'F:\sanguo\game\data\scenarios.json', encoding='utf-8'))[0]
gar = json.load(open(r'F:\sanguo\game\data\garrison.json', encoding='utf-8'))[0]['cities']
owners = {}
for c in S0['cities']:
    g = gar.get(c['NAME'])
    owners[c['NAME']] = (g or {}).get('owner') or ''
from collections import Counter
print('owner counts', Counter(owners.values()).most_common())
