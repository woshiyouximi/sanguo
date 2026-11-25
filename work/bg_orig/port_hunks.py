# 从被写坏的 battleView.ts 里抽「代码是 ASCII、可安全复用」的缺口 hunk，给 lead 反搬用。
import re

SRC = r'F:\sanguo\work\backup\battleView.corrupt-0359.ts'
OUT = r'F:\sanguo\work\bg_orig\port_hunks.md'
lines = open(SRC, encoding='utf-8-sig').read().split('\n')


def find(pat, start=0):
    for i in range(start, len(lines)):
        if re.search(pat, lines[i]):
            return i
    return -1


def block(i, maxlines=400):
    """从 i 开始按花括号配平取一个块（先跳到首个 '{' 再开始计数）。"""
    depth = 0
    opened = False
    for k in range(i, min(i + maxlines, len(lines))):
        depth += lines[k].count('{') - lines[k].count('}')
        if not opened and depth > 0:
            opened = True
        if opened and depth <= 0:
            return lines[i:k + 1]
    return lines[i:i + maxlines]


out = ['# battleView.ts 缺口 hunk（代码为 ASCII，可直接抄；注释里的中文是乱码，请重写）\n']
targets = [
    ('ViewOptions.units 字段', r'^\s*units\?:'),
    ('import unitFrames', r"from '\./unitFrames\.ts'"),
    ('drawActors 调用点（buildFrame 内）', r'drawActors\(out, world, camX'),
    ('function drawActors', r'^function drawActors'),
    ('function drawSoldier', r'^function drawSoldier'),
    ('function pushSpriteFrames', r'^function pushSpriteFrames'),
    ('function drawGeneral', r'^function drawGeneral'),
]
used = set()
for name, pat in targets:
    i = find(pat)
    if i < 0:
        out.append('\n## %s\n\n（未找到：%s）\n' % (name, pat))
        continue
    if name.startswith('ViewOptions') or name.startswith('import') or 'buildFrame' in name:
        blk = lines[i:i + 3]
    else:
        blk = block(i)
    out.append('\n## %s  （corrupt 第 %d 行起，共 %d 行）\n\n```ts\n' % (name, i + 1, len(blk)))
    out += blk
    out.append('```\n')
    used.add(i)

# 弓兵 attack_back 例外：drawSoldier 里可能还有一处提到 attack_back
for i in range(len(lines)):
    if 'attack_back' in lines[i] and i not in used:
        out.append('\n## attack_back 相关行（第 %d 行）\n\n```ts\n%s\n```\n' % (i + 1, lines[i]))

open(OUT, 'w', encoding='utf-8', newline='').write('\n'.join(out))
print('written', OUT, len('\n'.join(out)), 'chars')
