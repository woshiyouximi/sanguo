# -*- coding: utf-8 -*-
"""汇总 99 个音效的引用来源，产出 sfx_refs.json（不依赖 PowerShell 转义）。"""
import json
import os
import re

SOUND = r'F:\sanguo\extract\pak\SOUND'
EXE = (r'C:\Users\liutian\Downloads\sgqyzzwb_146364'
       r'\三国群英传2 修正版 1.05+\Sango2.exe')

names = sorted(os.path.splitext(f)[0].lower()
               for f in os.listdir(SOUND) if f.lower().endswith('.wav'))
nameset = set(names)


def text_of(path, enc='big5'):
    return open(path, 'rb').read().decode(enc, 'replace')


things = text_of(os.path.join(r'F:\sanguo\extract\pak', 'THINGS.INI'))
sources = {}


def add(n, s):
    sources.setdefault(n, set()).add(s)


# 1) THINGS.INI：$Token 形式
for m in re.finditer(r'\$([A-Za-z0-9_]+)', things):
    t = m.group(1).lower()
    if t in nameset:
        add(t, 'THINGS.INI $')

# 2) THINGS.INI：不带 $ 的裸 token（m000hit02 这种）
for m in re.finditer(r'\b(m\d{3}(?:snd|hit)\d{2})\b', things):
    t = m.group(1).lower()
    if t in nameset:
        add(t, 'THINGS.INI token')

# 3) MAGIC.SO / SYSTEM.SO：可打印 ASCII 串与音效名求交
pak = r'F:\sanguo\extract\pak\SCRIPT'
for fname, tag in (('MAGIC.SO', 'MAGIC.SO'), ('SYSTEM.SO', 'SYSTEM.SO')):
    path = os.path.join(pak, fname)
    if not os.path.exists(path):
        print('  ! 缺 %s' % path)
        continue
    data = open(path, 'rb').read()
    for raw in re.findall(rb'[ -~]{3,32}', data):
        t = raw.decode('ascii').strip().lower()
        if t in nameset:
            add(t, tag)

# 4) exe 里出现的名字（不要求紧跟 \0：有些是紧邻别的字符的表项）
exe = open(EXE, 'rb').read()
for n in names:
    if n.encode('ascii') in exe:
        add(n, 'Sango2.exe')

ref = {n: sorted(v) for n, v in sources.items()}
miss = [n for n in names if n not in ref]
groups = {}
for n in names:
    groups.setdefault('|'.join(ref.get(n, ['(无)'])), []).append(n)

print('被引用：%d / %d' % (len(ref), len(names)))
print('无引用：%d 个 -> %s' % (len(miss), ' '.join(miss)))
print('按来源分组：')
for k in sorted(groups, key=lambda x: -len(groups[x])):
    print('  %-28s %2d 个' % (k, len(groups[k])))

json.dump({'referenced': ref, 'unreferenced': miss},
          open(r'F:\sanguo\work\sfx_refs.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('-> F:\\sanguo\\work\\sfx_refs.json')
