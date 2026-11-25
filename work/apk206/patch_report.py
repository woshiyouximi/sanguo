# -*- coding: utf-8 -*-
"""把 206 报告里 1.1 的旧数字/旧哈希改成 1.2 的，并给「versionName 仍是 1.0」那句加更正。"""
import io

P = r'F:\sanguo\project\206_APK启动失败修复.md'
s = io.open(P, encoding='utf-8').read()
orig = s

PAIRS = [
    ('DE357206190165BEF4EE861CDFDFCB610DABB46A43E701837DAF4821D21CFD1D',
     '04E3A5805064BD3AB2085DB3AD308E7E2D8F523B408E4A7F247FC3218912B911'),
    ('D34A2B528C33047E092049E67DB977BD28D2DD0ED0221994821B1EAB8DE80758',
     '40366A68CC7552DBD21013C9B620CB70DB2DB3054805382A6446513E962C10A8'),
    ('`classes.dex` 40,316 B', '`classes.dex` 40,704 B'),
    ("versionCode='1' versionName='1.0-smoke'", "versionCode='2' versionName='1.2-smoke'"),
    ("versionCode='1' versionName='1.0'", "versionCode='2' versionName='1.2'"),
]
for a, b in PAIRS:
    n = s.count(a)
    if n:
        s = s.replace(a, b)
    print('%-60s x%d' % (a[:60], n))

lines = s.split('\n')
for i, l in enumerate(lines):
    if 'versionName' in l and '仍是' in l:
        print('加更正到第 %d 行' % (i + 1))
        lines[i] = l.rstrip() + '　**（1.2 更正：清单已升到 `versionCode=2` / `versionName=1.2`，'
        lines[i] += '烟雾包 `1.2-smoke`；下面的属性结论本身不变。用 `adb shell dumpsys package '
        lines[i] += 'com.sanguo.webview | findstr versionName` 可确认设备上装的是哪一版。）**'
        break
s = '\n'.join(lines)

anchor = '`40366A68CC7552DBD21013C9B620CB70DB2DB3054805382A6446513E962C10A8` |'
if anchor in s and 'zipalign 对齐' not in s:
    s = s.replace(anchor, anchor + '\n\n> 上表是 **1.2（最终交付）**。1.1 的两组旧哈希（`DE3572…` / `D34A2B…`）已被覆盖；'
                                  '两次构建字节数恰好相同，是 zipalign 4 字节对齐 + 素材总量固定造成的，'
                                  '内容并不相同（哈希、`versionCode`、`classes.dex` 都变了）。', 1)

if s != orig:
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
    print('已写回，%d 行' % len(s.split('\n')))
else:
    print('没有变化！')
