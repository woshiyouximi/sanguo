# -*- coding: utf-8 -*-
"""
Regenerate every disassembly excerpt cited in F:\\sanguo\\project\\133_原作数值真值.md

用法（必须用这个 Python，不是 PATH 上的 python）：
  cd F:\\sanguo\\work\\orig_numbers
  $env:PYTHONIOENCODING='utf-8'
  C:\\Users\\liutian\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe verify.py

输入：原作 EXE（路径见 rd.py 的 EXE）、本目录的 text_dis.tsv（dump_all.py 生成）、
      F:\\sanguo\\extract\\json\\times*.json
输出：R9_excerpt.txt / R15_excerpt.txt / LEVEL_excerpt.txt / R20_excerpt.txt /
      BONUS_pop_events.txt / COUNTS.txt
"""
import io
import json
import os
import re
import sys

import rd
import q

HERE = os.path.dirname(os.path.abspath(__file__))
JSONDIR = r'F:\sanguo\extract\json'


def fmt(r):
    tg = ('  ; -> ' + r[4]) if r[4] else ''
    return '%08X  %-20s %-8s %-44s%s' % (r[0], r[1], r[2], r[3], tg)


def window(lo, hi, note=''):
    out = []
    if note:
        out.append('--- %s ---' % note)
    for r in q.ROWS:
        if lo <= r[0] < hi:
            out.append(fmt(r))
    out.append('')
    return out


def push_str(lo, hi):
    """把窗口内 push <imm> 且能解成字符串的注释出来（识别印字/文案）"""
    out = []
    for r in q.ROWS:
        if not (lo <= r[0] < hi) or r[2] != 'push':
            continue
        m = re.search(r'0x([0-9a-f]{6,8})', r[3])
        if not m:
            continue
        va = int(m.group(1), 16)
        s = rd.cstr_gb(va) or rd.cstr(va)
        if s:
            out.append('%08X  push %08X  %r' % (r[0], va, s))
    return out


def grep_lines(fn):
    buf = []
    with io.open(os.path.join(HERE, fn), 'w', encoding='utf-8') as f:
        for chunk in buf:
            f.write(chunk + '\n')


def write(fn, lines, header=''):
    with io.open(os.path.join(HERE, fn), 'w', encoding='utf-8') as f:
        if header:
            f.write(header.rstrip() + '\n\n')
        for ln in lines:
            f.write(ln + '\n')
    print('wrote %-26s %6d lines' % (fn, len(lines)))


# ============================================================ 共用小工具
def money_writers():
    """所有写 [reg+0x92]（city MONEY）的指令"""
    out = []
    for r in q.ROWS:
        if r[2].startswith('mov') and 'ptr' in r[3] and re.search(r'\[e[a-z]{2} \+ 0x92\],', r[3]):
            out.append(fmt(r))
    return out


def pop_writers():
    out = []
    for r in q.ROWS:
        if r[2].startswith('mov') and 'ptr' in r[3] and re.search(r'\[e[a-z]{2} \+ 0x8a\],', r[3]):
            out.append(fmt(r))
    return out


def def_writers():
    out = []
    for r in q.ROWS:
        if r[2].startswith('mov') and 'ptr' in r[3] and re.search(r'\[e[a-z]{2} \+ 0x8e\],', r[3]):
            out.append(fmt(r))
    return out


# ============================================================ R9
L = []
L += ['#' * 78,
      '# R9 開發（人口 +0x8A）與防禦（+0x8E）增量：原作指令級真值',
      '# 城池池 head 0x40546F；0x405499(city) = (city->[0x9E] == 2)；',
      '# 開發執行體 0x427A84(city, gen)；防禦執行體 0x427947(city, gen)；外殼 0x427B9E(city, gen)',
      '#' * 78, '']
L += window(0x40546F, 0x4054B0, '0x40546F city pool head / 0x405499 FLAGS==2 gate')
L += window(0x427947, 0x427A84, '0x427947 DEFENCE executor (rand()%12 + STR*0.4, 太守 INT pivot 70, cap 999)')
L += window(0x427A84, 0x427B9E, '0x427A84 POPULATION executor (rand()%3000 + INT*100, cap 1000000, recompute +0x82)')
L += window(0x427B9E, 0x427C10, '0x427B9E shell: calls both, prints 人口增加%d人 / 防禦力增加%d。')
L += window(0x4020D0, 0x402128, 'player command dispatcher 0x4020E1: if (cmd==2) call 0x427A84 + 0x427947  (NO gold involved)')
L += ['--- strings ---']
L += push_str(0x427A84, 0x427C10)
L += ['--- callers ---']
L += ['callers of 0x427A84 : %s' % ['%08X' % x for x in q.calls_to(0x427A84)]]
L += ['callers of 0x427947 : %s' % ['%08X' % x for x in q.calls_to(0x427947)]]
L += ['callers of 0x427B9E : %s' % ['%08X' % x for x in q.calls_to(0x427B9E)]]
L += ['callers of 0x405499 : %s' % ['%08X' % x for x in q.calls_to(0x405499)]]
L += ['']
L += ['--- every writer of city+0x8A (POPULATION) ---']
L += pop_writers()
L += ['', '--- every writer of city+0x8E (DEFENCE) ---']
L += def_writers()
write('R9_excerpt.txt', L,
      'R9 摘錄：由 verify.py 生成，逐行 = VA / bytes / mnemonic / operands / 解析後跳轉目標')

# ============================================================ R15
L = []
L += ['#' * 78,
      '# R15 金錢：原作唯一金錢產出（年稅 0x423824）＋唯一消耗（0x41AF58 補預備兵）',
      '#' * 78, '']
L += window(0x423824, 0x4238D8, '0x423824 annual tax per city ; 0x4238AF year rollover ; 0x423885 settlement hook')
L += window(0x423681, 0x423830, '0x423885 settlement hook (order of the 5 sub-calls, gated by [0x4A6444])')
L += window(0x41B699, 0x41B700, 'month advance 0x41B699: [0x4C30E0]-- ; at 0 -> [0x4A64FC]=1 (year-cross pending)')
L += window(0x41AF58, 0x41AFB0, '0x41AF58(city): the ONLY money sink — money<100 return; prep>=cap return; prep++ ; money-=100')
L += window(0x40CF5C, 0x40CFE8, '0x40CF5C AI spends money*(rand()%10+5)/100 per month (AI side only)')
L += ['--- strings ---']
L += push_str(0x423800, 0x4238D8)
L += push_str(0x41B699, 0x41B720)
L += ['--- callers ---']
L += ['callers of 0x423824 (tax)      : %s' % ['%08X' % x for x in q.calls_to(0x423824)]]
L += ['callers of 0x423885 (settle)   : %s' % ['%08X' % x for x in q.calls_to(0x423885)]]
L += ['callers of 0x4238AF (rollover) : %s' % ['%08X' % x for x in q.calls_to(0x4238AF)]]
L += ['callers of 0x41B699 (month)    : %s' % ['%08X' % x for x in q.calls_to(0x41B699)]]
L += ['callers of 0x41AF58 (buy prep) : %s' % ['%08X' % x for x in q.calls_to(0x41AF58)]]
L += ['']
L += ['--- every writer of city+0x92 (MONEY) ---']
L += money_writers()
L += ['']
L += ['--- 寫 [0x4A64FC] (year-cross pending flag) 的指令 ---']
for r in q.ROWS:
    if 'ptr [0x4a64fc]' in r[3]:
        L += [fmt(r)]
L += ['', '--- 寫 [0x4A6444] (settlement suppress flag) 的指令 ---']
for r in q.ROWS:
    if 'ptr [0x4a6444]' in r[3]:
        L += [fmt(r)]
write('R15_excerpt.txt', L, 'R15 摘錄：由 verify.py 生成')

# ============================================================ LEVEL
def f(k):
    """0x409EE0: if (k>99) 9999999 else (((k-1)*137-34)*k)/2+17  (C 向零截斷)"""
    if k > 99:
        return 0x98967F
    num = ((k - 1) * 0x89 - 0x22) * k
    q_ = abs(num) // 2
    return (q_ if num >= 0 else -q_) + 0x11


def level_of(exp):
    """0x409F73: for(i=0;i<99;i++) if (exp < f(i)) return i-1; return 99"""
    for i in range(0x63):
        if exp < f(i):
            return i - 1
    return 0x63


L = []
L += ['#' * 78,
      '# 起始等級：原作沒有 STR+INT 公式，等級是由 BASEEXP 反推（載入器 0x42D1A3 段）',
      '#' * 78, '']
L += window(0x409EE0, 0x409F0F, '0x409EE0(k) = ((k-1)*137 - 34) * k / 2 + 17  (k>99 -> 0x98967F)')
L += window(0x409F73, 0x409FB6, '0x409F73(gen) = 由 gen->exp(+0x2A) 反推等級')
L += window(0x409FB6, 0x40A020, '0x409FB6(gen) = 讀 +0x2E 的等級（帶兵上限等在用）')
L += window(0x42D360, 0x42D3B0, 'loader: BASEEXP -> +0x2A ; 緊接 0x409F73 -> +0x2E ; 再 0x40A020 重算 HP')
L += window(0x4330B0, 0x4330F0, 'load game: 存盤段4 stride 0x11F, SAV+0x4E -> gen+0x2E (level)')
L += ['--- strings ---']
for va in (0x48C530, 0x48C538):
    L += ['%08X  %r' % (va, rd.cstr(va) or rd.cstr_gb(va))]
L += ['--- callers ---']
L += ['callers of 0x409F73 : %s' % ['%08X' % x for x in q.calls_to(0x409F73)]]
L += ['callers of 0x409EE0 : %s' % ['%08X' % x for x in q.calls_to(0x409EE0)]]
L += ['']
L += ['--- every writer of gen+0x2E (LEVEL) ---']
for r in q.ROWS:
    if r[2].startswith('mov') and 'ptr' in r[3] and re.search(r'\[e[a-z]{2} \+ 0x2e\],', r[3]):
        L += [fmt(r)]
L += ['']
L += ['--- exp 門檻表 f(k) 與 level_of(exp) 對照 ---']
L += ['%3s %10s   %s' % ('k', 'f(k)', 'level_of(f(k)) / level_of(f(k)-1)')]
for k in range(0, 21):
    L += ['%3d %10d   %d / %d' % (k, f(k), level_of(f(k)), level_of(f(k) - 1))]
L += ['']
L += ['--- extract/json/times*.json 的 base_exp 分佈 ---']
try:
    stat = {}
    for fn in sorted(os.listdir(JSONDIR)):
        if not re.match(r'times\d+\.json$', fn):
            continue
        raw = json.load(io.open(os.path.join(JSONDIR, fn), encoding='utf-8-sig'))
        rows = raw if isinstance(raw, list) else (raw.get('generals') or raw.get('rows') or raw.get('data') or [])
        for row in rows:
            if not isinstance(row, dict):
                continue
            for k, v in row.items():
                if 'exp' in k.lower():
                    stat.setdefault((fn, k), {}).setdefault(int(v), 0)
                    stat[(fn, k)][int(v)] += 1
    for (fn, k), d in sorted(stat.items()):
        L += ['%s  key=%s  values: %s' % (fn, k, ', '.join('%d x%d -> Lv%d' % (v, c, level_of(v)) for v, c in sorted(d.items())))]
except Exception as e:                                    # noqa: BLE001
    L += ['(json scan failed: %r)' % (e,)]
write('LEVEL_excerpt.txt', L, '起始等級摘錄：由 verify.py 生成')

# ============================================================ R20
L = []
L += ['#' * 78,
      '# R20 亂數：原作只有一條全域流（自製 rotate 雙字 LCG 變體），srand 只在新開局呼叫 2 次',
      '#' * 78, '']
L += window(0x4500E7, 0x450117, 'srand(seed_lo, seed_hi) 0x4500E7 -> [0x4922FC] / [0x492300]')
L += window(0x450117, 0x450132, 'rand()%n 0x450117')
L += window(0x450132, 0x4501D0, 'rand() 0x450132  (A+1, B-1, B=ror(B,A&31), A=rol(A,B&31), return A+B)')
L += window(0x450410, 0x450460, '0x450410 seed helper -> GetTickCount')
L += window(0x40B580, 0x40B5A0, 'srand call site #1 0x40B58E')
L += window(0x40B678, 0x40B698, 'srand call site #2 0x40B687')
L += ['--- callers ---']
L += ['callers of 0x4500E7 (srand) : %s' % ['%08X' % x for x in q.calls_to(0x4500E7)]]
L += ['callers of 0x450410 (tick)  : %s' % ['%08X' % x for x in q.calls_to(0x450410)]]
L += ['count callers of 0x450132 (rand)    : %d' % len(q.calls_to(0x450132))]
L += ['count callers of 0x450117 (rand%%n) : %d' % len(q.calls_to(0x450117))]
L += ['']
L += ['--- 所有寫 RNG 狀態 [0x4922FC] / [0x492300] 的指令 ---']
for r in q.ROWS:
    if '0x4922fc]' in r[3] or '0x492300]' in r[3]:
        if r[2].startswith('mov') and 'ptr [0x492' in r[3]:
            L += [fmt(r)]
L += ['']
L += ['--- 搜索掉落函數 0x426D8C（416 B）與 0x426B44 的 rand 呼叫 ---']
L += window(0x426D8C, 0x426EA0, '0x426D8C search drop: 0x450117(count+2) / 0x450117(count+1)')
L += window(0x426B44, 0x426C69, '0x426B44: 0x450117(0x1E) -> exp on gen+0x2A')
L += ['--- GetTickCount import ---']
for dll, name, iat in rd.imports():
    if name.lower() in ('gettickcount', 'timegettime', 'rand', 'srand'):
        L += ['%s!%s  IAT=%08X' % (dll, name, iat)]
write('R20_excerpt.txt', L, 'R20 摘錄：由 verify.py 生成')

# ============================================================ BONUS: 人口減少事件
L = []
L += ['#' * 78,
      '# 額外發現（R9 相鄰）：原作人口不只增加 —— 還有兩條 rand 人口減少公式',
      '# 0x40F607: pop -= pop * (500 + rand()%200) * 2 / 10000   ≈ -10.0% .. -13.98%',
      '# 0x40F727: pop -= pop * (1500 + rand()%500) * 2 / 10000  ≈ -30.0% .. -39.98%',
      '# 呼叫端：0x40FE5F（←0x4115F9）與 0x410199（←0x41AD06，緊接「戰鬥結束...」文案塊）',
      '#' * 78, '']
L += window(0x40F607, 0x40F692, '0x40F607 pop loss A')
L += window(0x40F727, 0x40F7B0, '0x40F727 pop loss B (inside 0x40F692)')
L += window(0x410199, 0x410260, '0x410199 event applier (calls 0x40F692 at 0x410267? and 0x40F607 at 0x41021A)')
L += window(0x41ACE1, 0x41AD20, '0x41AD06: right after 「戰鬥結束...」 text block (0x48982C)')
L += window(0x4115D1, 0x411601, '0x4115F9: gated on [0x4A79C8] & 2')
L += ['--- strings ---']
L += push_str(0x41ACE1, 0x41AD20)
L += push_str(0x4115D1, 0x411601)
L += ['--- callers ---']
for t in (0x40F607, 0x40F692, 0x40FE5F, 0x410199):
    L += ['callers of %08X : %s' % (t, ['%08X' % x for x in q.calls_to(t)])]
write('BONUS_pop_events.txt', L, '額外發現摘錄：由 verify.py 生成')

# ============================================================ COUNTS / 零命中證據
L = []
L += ['#' * 78,
      '# 零命中 / 計數證據（搜索命令與範圍都寫在每條前面）',
      '# 範圍：text_dis.tsv = 原作 EXE .text 全段線性反解（0x401000..0x47E38E，166143 條）',
      '#' * 78, '']


def count_op(pat, label, flags=0):
    n = 0
    hit = []
    for r in q.ROWS:
        if re.search(pat, r[3], flags):
            n += 1
            if len(hit) < 12:
                hit.append('%08X  %s %s' % (r[0], r[2], r[3]))
    L.append('%s : %d' % (label, n))
    for h in hit:
        L.append('    ' + h)
    L.append('')


def count_imm(imm):
    """同一個立即數在三種語法下的命中數：整串出現 / cmp / push"""
    s = '0x%x' % imm
    tot = [('%08X' % r[0], r[2], r[3]) for r in q.ROWS if re.search(r'\b' + s + r'\b', r[3])]
    cmps = [x for x in tot if x[1] == 'cmp']
    push = [x for x in tot if x[1] == 'push']
    L.append('imm %-10s (%-9d) 出現在運算元 : %d 條（其中 cmp %d 條 / push %d 條）'
             % (s, imm, len(tot), len(cmps), len(push)))
    for va, mn, op in (cmps + push)[:10]:
        L.append('    %s  %s %s' % (va, mn, op))
    L.append('')


for imm in (0xBB8, 0xC, 0xF4240, 0x3E7, 0x2710, 0x8CA, 0x4B, 0x46, 0x12C, 0x64):
    count_imm(imm)

count_op(r'^0xbb8$', 'grep op ^0xbb8$   (即 push 0xBB8 = 3000)')
count_op(r'^0xc$', 'grep op ^0xc$     (即 push 0xC = 12)')
count_op(r'^0xf4240$', 'grep op ^0xf4240$ (即 push 0xF4240 = 1,000,000)')
count_op(r'^0x3e7$', 'grep op ^0x3e7$   (即 push 0x3E7 = 999)')
count_op(r'^0x2710$', 'grep op ^0x2710$  (即 push 0x2710 = 10000)')
count_op(r'^0x8ca$', 'grep op ^0x8ca$   (即 push 0x8CA = 2250)')
count_op(r'^0x4b$', 'grep op ^0x4b$    (即 push 0x4B = 75)')
L += ['legacy MSVC6 rand LCG 常數 0x343FD / 0x269EC3 在整份 .text 的出現次數：']
L += ['  0x343FD  : %d' % sum(1 for r in q.ROWS if '0x343fd' in r[3])]
L += ['  0x269EC3 : %d' % sum(1 for r in q.ROWS if '0x269ec3' in r[3])]
L += ['']
write('COUNTS.txt', L, '零命中/計數證據：由 verify.py 生成')

print('\nALL DONE. EXE =', rd.EXE)
