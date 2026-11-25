import re, json, sys

src = open(r'F:\sanguo\work\cocos_sync\sync_core3.mjs', encoding='utf-8').read()

# Find the PATCHES array region and parse object literals carrying id/file/from/to.
ids = re.findall(r"id:\s*'([^']+)'", src)
print('ids:', len(ids), ids)

# file: appears maybe as 'battle.ts' with dir prefix
files = re.findall(r"file:\s*'([^']+)'", src)
print('files:', sorted(set(files)))

# locate PATCHES start
m = re.search(r'(const|let)\s+PATCHES\s*=\s*\[', src)
print('PATCHES at', m.start() if m else None)
if m:
    print(src[m.start():m.start()+400])
