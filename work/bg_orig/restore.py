# 复原 battleView.ts：文本曾被按 cp936 解码（UTF-8 -> 乱码），按反表还原字节，
# 用「UTF-8 前缀合法性 + 回溯」消掉 126 个多义字符的歧义。
import json
import sys

SRC = r'F:\sanguo\game\src\view\battleView.ts'
TABLE = r'F:\sanguo\work\bg_orig\cp936_table.json'
OUT = r'F:\sanguo\work\bg_orig\_restore.ts'

table = {int(k): [bytes.fromhex(h) for h in v] for k, v in json.load(open(TABLE, encoding='utf-8')).items()}
text = open(SRC, 'rb').read().decode('utf-8-sig')
chars = [ord(c) for c in text]
n = len(chars)


def scan(buf, start):
    """从 start 起扫描 UTF-8；返回 (已完整消费到的位置, 是否仍是合法前缀)。"""
    i = start
    m = len(buf)
    while i < m:
        b = buf[i]
        if b < 0x80:
            i += 1
            continue
        if 0xC2 <= b <= 0xDF:
            need = 1
        elif 0xE0 <= b <= 0xEF:
            need = 2
        elif 0xF0 <= b <= 0xF4:
            need = 3
        else:
            return i, False
        if i + need >= m:
            for j in range(i + 1, m):
                if not (0x80 <= buf[j] <= 0xBF):
                    return i, False
            return i, True  # 末尾是未完成但合法的序列
        for j in range(i + 1, i + need + 1):
            if not (0x80 <= buf[j] <= 0xBF):
                return i, False
        i += need + 1
    return i, True


def cjk_score(c, buf, start):
    """给候选字节打分：能让当前 UTF-8 序列解成一个像中文的字符者优先。"""
    trial = bytes(buf) + c
    nc, good = scan(trial, start)
    if not good:
        return -1
    seg = trial[start:nc]
    if not seg:
        return 0
    try:
        ch = seg.decode('utf-8')
    except Exception:
        return -1
    if not ch:
        return 0
    o = ord(ch[0])
    if 0x4E00 <= o <= 0x9FFF:
        return 3
    if 0x3000 <= o <= 0x303F or 0xFF00 <= o <= 0xFFEF or 0x2000 <= o <= 0x27BF:
        return 2
    if o < 0x80:
        return 1
    return 0


out = bytearray()
complete = 0
pos = 0
ci = 0
saved = []
steps = 0
while True:
    if pos >= n:
        break
    cp = chars[pos]
    cands = [bytes([cp])] if cp < 0x80 else []
    if cp < 0x80:
        # ASCII 也可能是 cp936 吞掉原始高字节后留下的 '?'，补上全部候选兜底
        extra = [b for b in table.get(cp, []) if b not in cands]
        if extra:
            extra.sort(key=lambda b: (-cjk_score(b, out, complete), b))
            cands.extend(extra)
    else:
        cands = table.get(cp) or cands
    ok = False
    while ci < len(cands):
        c = cands[ci]
        ci += 1
        L = len(out)
        C = complete
        out.extend(c)
        nc, good = scan(out, complete)
        steps += 1
        if good:
            saved.append((pos, ci, L, C))
            pos += 1
            ci = 0
            complete = nc
            ok = True
            break
        del out[L:]
        complete = C
    if ok:
        continue
    if not saved:
        print('backtrack exhausted at', pos)
        sys.exit(1)
    p, cidx, L, C = saved.pop()
    del out[L:]
    complete = C
    pos = p
    ci = cidx

raw = bytes(out)
try:
    fixed = raw.decode('utf-8')
except Exception as e:
    print('decode failed:', e)
    sys.exit(1)
for k in ['主将信息', '撤退中', '我軍主將', '突 擊', '車道', '武將']:
    print(k, fixed.count(k))
open(OUT, 'w', encoding='utf-8', newline='').write(fixed)
print('OK lines', fixed.count('\n'), 'bytes', len(raw), 'steps', steps, 'saved', len(saved))
