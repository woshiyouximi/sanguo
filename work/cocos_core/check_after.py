# 同步后的复核：把 web 真源（只做「导入去 .ts」+ LF 归一）与 Cocos 侧当前文件逐行比较，
# 剩下的差异应当**只有** KEEP_PATCHES 那 6 处。输出 diff_after.txt。
import difflib
import os
import re

SRC = r'F:\sanguo\game\src\core'
DST = r'F:\sanguo\game\cocos\assets\scripts\core'
OUT = r'F:\sanguo\work\cocos_core\diff_after.txt'

TS_IMPORT = re.compile(r"(\bfrom\s+')(\.\.?/[^']*?)\.ts(')")
TS_SIDE = re.compile(r"(\bimport\s+')(\.\.?/[^']*?)\.ts(')")


def normalize(text):
    text = text.replace('\r\n', '\n')
    text = TS_IMPORT.sub(r'\1\2\3', text)
    text = TS_SIDE.sub(r'\1\2\3', text)
    return text


web_files = []
for root, _dirs, names in os.walk(SRC):
    for name in sorted(names):
        if name.endswith('.ts') and not name.endswith('.d.ts'):
            full = os.path.join(root, name)
            web_files.append(os.path.relpath(full, SRC).replace('\\', '/'))
web_files.sort()

parts = []
same = 0
diff_files = []
for rel in web_files:
    src_text = normalize(open(os.path.join(SRC, rel), encoding='utf-8', newline='').read())
    dst_path = os.path.join(DST, rel)
    if not os.path.exists(dst_path):
        parts.append('MISSING   %s' % rel)
        continue
    dst_text = normalize(open(dst_path, encoding='utf-8', newline='').read())
    if src_text == dst_text:
        same += 1
        continue
    diff_files.append(rel)
    parts.append('=' * 78)
    parts.append('AFTER-DIFF  %s   （下面只应出现 KEEP_PATCHES 的差异）' % rel)
    parts.append('=' * 78)
    body = list(difflib.unified_diff(
        src_text.split('\n'), dst_text.split('\n'),
        fromfile='web/' + rel, tofile='cocos/' + rel, lineterm='', n=3))
    parts.extend(body)
    parts.append('')

parts.append('---- 汇总 ----')
parts.append('web 源文件 %d 个；同步后与 web **完全一致** %d 个；有残留差异 %d 个：%s'
             % (len(web_files), same, len(diff_files), ', '.join(diff_files) or '无'))
open(OUT, 'w', encoding='utf-8').write('\n'.join(parts) + '\n')
print('\n'.join(parts[-2:]))
print('写入', OUT)
