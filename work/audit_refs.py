# -*- coding: utf-8 -*-
"""把 172 里所有 `xxx.ext:NNN` 的引用抓出来，打印被引用行的实际内容，供人工核。"""
import io
import re

DOC = r'F:\sanguo\project\172_对照表刷新.md'
ROOT = r'F:\sanguo\game'

txt = io.open(DOC, encoding='utf-8').read()
pat = re.compile(r'([A-Za-z0-9_./]+\.(?:ts|js|html|json)):(\d+)')
seen = set()
for m in pat.finditer(txt):
    path, ln = m.group(1), int(m.group(2))
    key = (path, ln)
    if key in seen:
        continue
    seen.add(key)
    cands = [ROOT + '\\' + path.replace('/', '\\'), ROOT + '\\web\\' + path, ROOT + '\\src\\core\\' + path]
    full = next((c for c in cands if __import__('os').path.exists(c)), None)
    if full is None:
        print('NOFILE %-40s :%d' % (path, ln))
        continue
    lines = io.open(full, encoding='utf-8').read().split('\n')
    body = lines[ln - 1].strip() if 0 < ln <= len(lines) else '<OUT OF RANGE>'
    print('%-34s :%-5d %s' % (path, ln, body[:120]))
print('refs=', len(seen))
