# 从 diff_before.txt 的最后一个 hunk 反推「旧文件行数 / 新文件行数」，并与磁盘上的当前文件核对。
import os
import re

DIFF = r'F:\sanguo\work\cocos_core\diff_before.txt'
CORE = r'F:\sanguo\game\cocos\assets\scripts\core'


def count_lines(path):
    with open(path, encoding='utf-8', newline='') as fh:
        text = fh.read()
    if not text:
        return 0
    n = text.count('\n')
    return n if text.endswith('\n') else n + 1


cur = None
last = {}
order = []
for line in open(DIFF, encoding='utf-8'):
    m = re.match(r'^(DIFF|SAME|WEB-ONLY)\s+(\S+)', line)
    if m:
        cur = m.group(2)
        if cur not in last:
            order.append(cur)
        last[cur] = None
        continue
    m = re.match(r'^@@ -(\d+),(\d+) \+(\d+),(\d+) @@', line)
    if m and cur:
        a, al, b, bl = (int(x) for x in m.groups())
        last[cur] = (a + al - 1, b + bl - 1)

print('file\told_end\tnew_end\tdisk_lines\tcheck')
for f in order:
    v = last[f]
    path = os.path.join(CORE, f)
    disk = count_lines(path) if os.path.exists(path) else -1
    if v is None:
        print('%s\t-\t-\t%d\tSAME/WEBONLY' % (f, disk))
        continue
    old, new = v
    print('%s\t%d\t%d\t%d\t%s' % (f, old, new, disk, 'OK' if disk == new else 'MISMATCH'))
