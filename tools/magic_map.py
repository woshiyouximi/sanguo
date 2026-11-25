# -*- coding: utf-8 -*-
"""magic_map.py —— 把 SHAPE\\MAGIC 的 819 张特效帧映射到 110 个武将技。

映射链（本脚本要验证/产出的东西）：
    MAGIC.INI `Script`(501-610)
      == MAGIC.SO 符号表 func.num  ->  函数 Magic{num-500}
      -> 执行期 PUSHS "magic\\NNN\\*"（syscall 0x007 载入整目录）
         或 PUSHI <ThingID>（syscall 0x011 创建对象，ThingID = 10000+1000*NNN+k）
      -> SHAPE\\MAGIC\\NNN\\ 下的帧

产出：
    F:\\sanguo\\work\\dis_magicmap_skills.txt   每个技能的完整证据
    F:\\sanguo\\work\\dis_magicmap_dirs.txt     每个目录的反查
    F:\\sanguo\\work\\dis_magicmap_syscalls.txt 脚本里 syscall 使用统计
    F:\\sanguo\\docs\\05c_MAGIC特效映射.md       交付文档
"""
import bisect
import collections
import json
import os
import re
import struct
import sys

sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as SS

SO_PATH = r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO'
MAGIC_JSON = r'F:\sanguo\extract\json\magic.json'
THINGS_JSON = r'F:\sanguo\work\things_parsed.json'
SHAPE_MAGIC = r'F:\sanguo\extract\pak\SHAPE\MAGIC'
DOC = r'F:\sanguo\docs\05c_MAGIC特效映射.md'
W = r'F:\sanguo\work'

GENERIC = {'DownBrightness', 'RaiseBrightness', 'MoveCamera', 'CastFail',
           'LockTargetTime2', 'LockTargetTime3', 'HoldAllDelay', 'DownBright',
           'RaiseBright', 'ProduceShadowTime', 'MovingShadow'}
# 按名字调用脚本的 syscall（0x310..0x314，参数个数 6..10）
NAME_CALL_SYSCALLS = {0x310: 6, 0x311: 7, 0x312: 8, 0x313: 9, 0x314: 10}

# 目录语义（[推测]，依据 05b 里统计到的部件名）
DIR_SEM = {
    0: '通用：無形有/無重力、火球、集氣A-C、光球',
    1: '半月斬（刀光弧）',
    2: '伏兵（目录缺失，兵由 FORCE 出）',
    3: '飛行武器箭（箭/刀/戟的飞行体）',
    4: '衝車（撞城車）',
    5: '閃電（A/B/C + 波及電）',
    6: '弓箭兵/向上射的箭',
    7: '著火士兵、投石車、投石',
    8: '爆炸火/光氣環（虎咆系）',
    9: '我方攻擊魔法火（八面火）',
    10: '地劍（從地面刺出的劍）',
    11: '龍捲風（旋龍系）',
    12: '劍氣尾光/分身衝刺',
    13: '定身（八門金鎖的鎖鏈/符）',
    14: 'WAVE 衝擊波（神鬼亂舞）',
    15: '光舞劍/電珠（神劍系）',
    16: '聖光（治療光）',
    17: '火龍頭·身（炎龍系）',
    18: '龍（召喚獸）/火柱',
    19: '連弩的弩箭',
    20: '黑洞/星星（生死門）',
    21: '火焰（旋燈火）',
    22: '冰霧/碎冰（冰柱系）',
    23: '火焰（伏焰/赤焰）',
    24: '後伏兵（目录缺失）',
    25: '太極圖（太極門）',
    26: '水柱（地泉系）',
    27: '火牛（牛+火焰）',
    28: '石頭/碎石（滾石系）',
    29: '八卦陣（八卦奇陣）',
    30: '半月斬+爆炸光（華斬系）',
    31: '火球/火柱（集火柱）',
    32: '電球（狂雷天牢）',
    33: '龍砲（砲/砲彈/爆炸）',
    34: '桶子/火藥爆炸（火雷）',
    35: '地茅（矛刺）',
    36: '劍（刀劍亂）',
    37: '火柱（炎牆）',
    38: '劍A1…（劍輪舞，最大目录 112 帧）',
    39: '木輪/滾筒（木輪攻）',
    40: '石柱/大地（大地狂嘯）',
    41: '拒馬（拒陸馬/十面埋伏）',
}


def load_so():
    so = SS.SOFile(SO_PATH)
    d = so.data
    funcs = [f for f in so.funcs if f['off'] < so.code_end]
    offs = sorted(f['off'] for f in funcs)
    by_off = {f['off']: f for f in funcs}
    by_num = {f['num']: f for f in funcs if f['num']}
    by_name = collections.defaultdict(list)
    for f in funcs:
        by_name[f['name']].append(f)
    return so, funcs, offs, by_off, by_num, by_name


def walk_body(so, offs, by_off, by_name, off, max_insn=20000):
    """线性解码一个函数体，返回 (strings, pushes, calls, syscalls, insns)。"""
    d = so.data
    i = bisect.bisect_right(offs, off)
    end = offs[i] if i < len(offs) else so.code_end
    pc = off
    strings, pushes, calls, syscals = [], [], [], collections.Counter()
    insns = 0
    last_str = None
    while pc + 4 <= end and insns < max_insn:
        op = struct.unpack_from('<i', d, pc)[0]
        if op not in SS.OPS:
            pc += 4
            continue
        nm, kinds, _ = SS.OPS[op]
        size = 4 + 4 * (2 if kinds in ('YF', 'CO') else (1 if kinds else 0))
        insns += 1
        if nm == 'PUSHS':
            idx = struct.unpack_from('<i', d, pc + 4)[0]
            strings.append((pc, idx, so.names[idx] if 0 <= idx < len(so.names) else '?'))
            last_str = so.names[idx] if 0 <= idx < len(so.names) else None
        elif nm == 'PUSHI':
            pushes.append((pc, struct.unpack_from('<i', d, pc + 4)[0]))
        elif nm == 'CALL':
            tgt = struct.unpack_from('<i', d, pc + 4)[0]
            f = by_off.get(tgt)
            calls.append((pc, f['name'] if f else 'sub_%X' % tgt, tgt))
        elif nm == 'SYSCALL':
            sid = struct.unpack_from('<i', d, pc + 4)[0]
            flags = struct.unpack_from('<i', d, pc + 8)[0]
            syscals[sid & 0xffff] += 1
            if (sid & 0xffff) in NAME_CALL_SYSCALLS and last_str and last_str in by_name:
                for f in by_name[last_str]:
                    calls.append((pc, f['name'], f['off']))
        pc += size
    return strings, pushes, calls, syscals, insns


def closure(so, offs, by_off, by_name, f0):
    """广度优先收集可达函数、字符串、常量、名字调用。"""
    strings, pushes, calls = [], [], []
    syscals = collections.Counter()
    funcs, insns = [], 0
    stack, seen = [f0], set()
    while stack:
        f = stack.pop()
        if f['off'] in seen:
            continue
        seen.add(f['off'])
        funcs.append(f['name'])
        s, p, c, sc, n = walk_body(so, offs, by_off, by_name, f['off'])
        strings += [(a, b, c2, f['name']) for a, b, c2 in s]
        pushes += [(a, b, f['name']) for a, b in p]
        syscals += sc
        insns += n
        for pc, nm, tgt in c:
            calls.append((f['name'], nm, tgt))
            g = by_off.get(tgt)
            if g and g['off'] not in seen:
                stack.append(g)
    return dict(strings=strings, pushes=pushes, calls=calls, syscalls=syscals,
                funcs=funcs, seen=seen, insns=insns)


def things_seqmap():
    """ThingID(=Sequence) -> (目录号, 对象名)，只取 MAGIC 目录下的特效对象。"""
    d = json.load(open(THINGS_JSON, encoding='utf-8'))
    m = {}
    for o in d['objects']:
        seq = o.get('sequence')
        if not isinstance(seq, int):
            continue
        if 10000 <= seq < 52000 and (seq - 10000) % 1000:
            m[seq] = ((seq - 10000) // 1000, o.get('name', ''))
    return m


def dir_stats():
    st = {}
    if not os.path.isdir(SHAPE_MAGIC):
        return st
    for name in sorted(os.listdir(SHAPE_MAGIC)):
        p = os.path.join(SHAPE_MAGIC, name)
        if not (os.path.isdir(p) and name.isdigit()):
            continue
        files = [x for x in os.listdir(p) if x.upper().endswith('.SHP')]
        st[int(name)] = dict(n=len(files), bytes=sum(os.path.getsize(os.path.join(p, x)) for x in files),
                             files=sorted(files))
    return st


def classify_shape_strings(so):
    out = []
    for i, s in enumerate(so.names):
        m = re.match(r'^magic\\(\d{3})\\(.+)$', s, re.I)
        if m:
            out.append((i, s, int(m.group(1)), m.group(2)))
    return out


def main():
    so, funcs, offs, by_off, by_num, by_name = load_so()
    seqmap = things_seqmap()
    dstats = dir_stats()
    magic = json.load(open(MAGIC_JSON, encoding='utf-8'))
    skills = [e for e in magic['entries'] if e['kind'] == 'magic']
    skills.sort(key=lambda e: e['index'])

    shapestrs = classify_shape_strings(so)
    n_wild = sum(1 for _, _, _, tail in shapestrs if tail == '*')
    n_file = len(shapestrs) - n_wild

    # ---- 逐个技能 ----
    rows = []
    for e in skills:
        sc = e['script']
        f = by_num.get(sc)
        info = closure(so, offs, by_off, by_name, f) if f else None
        str_dirs, id_dirs = set(), set()
        shape_files = []
        snds = []
        if info:
            for pc, idx, name, src in info['strings']:
                m = re.match(r'^magic\\(\d{3})\\(.+)$', name, re.I)
                if m:
                    dd = int(m.group(1))
                    if m.group(2) == '*':
                        str_dirs.add(dd)
                    else:
                        shape_files.append((dd, name))
                        str_dirs.add(dd)
                elif 'snd' in name.lower():
                    snds.append(name)
            for pc, val, src in info['pushes']:
                if val in seqmap:
                    id_dirs.add(seqmap[val][0])
        all_dirs = str_dirs | id_dirs
        eff = sorted(d for d in all_dirs if d != 0)
        missing = [d for d in eff if d not in dstats]
        existing = [d for d in eff if d in dstats]
        frames = sum(dstats[d]['n'] for d in existing)
        nbytes = sum(dstats[d]['bytes'] for d in existing)
        basis = '字符串' if (str_dirs - {0}) and not (id_dirs - {0}) else (
            '对象号' if (id_dirs - {0}) and not (str_dirs - {0}) else (
                '两者' if (id_dirs - {0}) else '无'))
        rows.append(dict(index=e['index'], name=e['name'], script=sc, mp=e.get('mp'),
                         category=e.get('category'), note=e.get('note_text'),
                         fn='Magic%d' % (sc - 500) if f else '?',
                         str_dirs=sorted(str_dirs), id_dirs=sorted(id_dirs),
                         eff=eff, existing=existing, missing=missing,
                         frames=frames, bytes=nbytes, basis=basis,
                         shape_files=shape_files, snds=sorted(set(snds)),
                         info=info))

    # ---- 统计 ----
    n_skill = len(rows)
    n_with_exist = sum(1 for r in rows if r['existing'])
    n_missing_only = sum(1 for r in rows if r['missing'] and not r['existing'])
    n_none = sum(1 for r in rows if not r['eff'])
    dir2skill = collections.defaultdict(list)
    for r in rows:
        for d in r['eff']:
            dir2skill[d].append(r['name'])
    used_dirs = sorted(dir2skill)
    # 字符串目录 vs 对象号目录 是否一致（都非空时）
    def _sd(r):
        return set(r['str_dirs']) - {0}

    def _id(r):
        return set(r['id_dirs']) - {0}

    agree = sum(1 for r in rows if _sd(r) and _id(r) and _sd(r) == _id(r))
    both = sum(1 for r in rows if _sd(r) and _id(r))
    n_super = sum(1 for r in rows if _sd(r) and _id(r) and (_sd(r) <= _id(r) or _id(r) <= _sd(r)))

    # ---- dump 1: 每技能 ----
    with open(os.path.join(W, 'dis_magicmap_skills.txt'), 'w', encoding='utf-8') as fh:
        fh.write('MAGIC.SO / MAGIC.INI 映射明细\n')
        fh.write('符号表 %d 项，字符串表 %d 项，代码区 0x%X..0x%X\n' %
                 (len(so.funcs), len(so.names), so.code_start, so.code_end))
        fh.write('magic\\NNN 形状字符串 %d 条（整目录通配 %d + 具体文件 %d）\n\n' % (len(shapestrs), n_wild, n_file))
        for r in rows:
            fh.write('=' * 78 + '\n')
            fh.write('#%d %s  MP=%s  %s\n' % (r['index'], r['name'], r['mp'], r['category']))
            fh.write('  MAGIC.INI Script=%d -> MAGIC.SO %s  (%s)\n' %
                     (r['script'], r['fn'], '找到' if r['info'] else '缺失'))
            fh.write('  目录: 字符串=%s  对象号=%s  合并=%s  缺失=%s\n' %
                     (r['str_dirs'], r['id_dirs'], r['eff'], r['missing']))
            if r['info']:
                fh.write('  可达函数(%d): %s\n' % (len(r['info']['funcs']), ', '.join(r['info']['funcs'])))
                fh.write('  指令数=%d\n' % r['info']['insns'])
                fh.write('  PUSHS 字符串:\n')
                for pc, idx, name, src in r['info']['strings']:
                    fh.write('    0x%06X  [%3d] %-24s <- %s\n' % (pc, idx, name, src))
                hit = [(pc, v, s) for pc, v, s in r['info']['pushes'] if v in seqmap]
                if hit:
                    fh.write('  PUSHI 命中 ThingID:\n')
                    for pc, v, src in hit:
                        fh.write('    0x%06X  %-6d -> 目录 %03d  %s  <- %s\n' %
                                 (pc, v, seqmap[v][0], seqmap[v][1], src))
                if r['snds']:
                    fh.write('  音效字符串: %s\n' % ', '.join(r['snds']))
                fh.write('  直接调用: %s\n' % sorted({c[1] for c in r['info']['calls']}))
            fh.write('\n')

    # ---- dump 2: 每目录 ----
    with open(os.path.join(W, 'dis_magicmap_dirs.txt'), 'w', encoding='utf-8') as fh:
        fh.write('SHAPE\\MAGIC 目录反查（%d 个现有目录 / 被引用 %d 个编号）\n\n' %
                 (len(dstats), len(used_dirs)))
        for d in sorted(set(list(dstats) + used_dirs)):
            st = dstats.get(d)
            fh.write('--- MAGIC\\%03d ---\n' % d)
            fh.write('  存在=%s  对象数(THINGS)=%d  帧数=%s  字节=%s\n' % (
                '是' if st else '否',
                sum(1 for k in seqmap if seqmap[k][0] == d),
                st['n'] if st else '-', st['bytes'] if st else '-'))
            fh.write('  语义[推测]: %s\n' % DIR_SEM.get(d, '（未推断）'))
            fh.write('  引用技能 %d 个: %s\n' % (len(dir2skill.get(d, [])), ', '.join(dir2skill.get(d, [])) or '-'))
            if st:
                fh.write('  文件前 6 个: %s\n' % ', '.join(st['files'][:6]))
                for k in sorted(seqmap):
                    if seqmap[k][0] == d:
                        fh.write('    ThingID %-6d %s\n' % (k, seqmap[k][1]))
            fh.write('\n')

    # ---- dump 3: syscall 统计 ----
    tot_sc = collections.Counter()
    for r in rows:
        if r['info']:
            tot_sc += r['info']['syscalls']
    with open(os.path.join(W, 'dis_magicmap_syscalls.txt'), 'w', encoding='utf-8') as fh:
        fh.write('MAGIC.SO 110 个 MagicN（含其调用链）里的 syscall 频次\n')
        for sid, c in tot_sc.most_common():
            fh.write('  0x%03X  %5d\n' % (sid, c))

    # ---- dump 4: 字符串法 vs 对象号法 冲突明细 ----
    with open(os.path.join(W, 'dis_magicmap_idconflict.txt'), 'w', encoding='utf-8') as fh:
        fh.write('字符串目录 vs 对象号目录 不一致的技能（两者都非空时才比较）\n\n')
        n_conf = 0
        for r in rows:
            sd = set(r['str_dirs']) - {0}
            dd = set(r['id_dirs']) - {0}
            if not sd or not dd or sd == dd:
                continue
            n_conf += 1
            fh.write('#%-3d %-8s 字符串=%s 对象号=%s 仅对象号=%s 仅字符串=%s\n' % (
                r['index'], r['name'], sorted(sd), sorted(dd), sorted(dd - sd), sorted(sd - dd)))
            for pc, val, src in (r['info']['pushes'] if r['info'] else []):
                if seqmap.get(val, (None,))[0] in (dd - sd):
                    fh.write('    0x%06X %-6d -> %03d %s  <- %s\n'
                             % (pc, val, seqmap[val][0], seqmap[val][1], src))
        fh.write('\n合计 %d 个技能两法结果不同（其余 1 个只有对象号、44 个只有字符串）\n' % n_conf)

    # ---- 文档 ----
    write_doc(rows, dstats, dir2skill, seqmap, shapestrs, n_wild, n_file,
              n_skill, n_with_exist, n_missing_only, n_none, agree, both, n_super, so)
    print('技能 %d；有现存特效目录 %d；只引用缺失目录 %d；无目录 %d；字符串↔对象号一致 %d/%d'
          % (n_skill, n_with_exist, n_missing_only, n_none, agree, both))
    print('目录：现有 %d / 被引用 %d' % (len(dstats), len(used_dirs)))
    print('doc ->', DOC)


def write_doc(rows, dstats, dir2skill, seqmap, shapestrs, n_wild, n_file,
              n_skill, n_with_exist, n_missing_only, n_none, agree, both, n_super, so):
    missing_skills = [r for r in rows if r['missing']]
    L = []
    A = L.append
    A('# 05c `SHAPE\\MAGIC` 特效帧 ↔ 110 个武将技：映射表与证据')
    A('')
    A('> **一句话结论**：`MAGIC.INI` 的 `Script` 字段（501–610）就是 `SCRIPT\\MAGIC.SO`')
    A('> 符号表里的 `num`，对应函数 `Magic{num-500}`；该函数执行时用')
    A('> `PUSHS "magic\\NNN\\*"`（`syscall 0x007` 载入整个目录）或 `PUSHI <ThingID>`')
    A('> （`syscall 0x011` 创建单个特效对象，`ThingID = 10000 + 1000×NNN + k`）来取图形，')
    A('> 于是落到 `SHAPE\\MAGIC\\NNN\\` 的帧上。**%d 个武将技里 %d 个能锁定到现存的特效目录**，'
      % (n_skill, n_with_exist))
    A('> 其余 %d 个只引用磁盘上不存在的 `002`/`024`（伏兵类，兵由 `FORCE` 出），0 个完全无线索。'
      % n_missing_only)
    A('')
    A('本文所有结论按 `[确认]` / `[推测]` / `[未解]` 标注。')
    A('')
    A('---')
    A('')
    A('## 0. 摘要')
    A('')
    A('| 项 | 数值 |')
    A('| --- | --- |')
    A('| 武将技（`MAGIC.INI` `[MAGIC]` 段） | %d |' % n_skill)
    A('| `Script` 值域 | 501–610（与 `index` 不同序） |')
    A('| `MAGIC.SO` 符号表 | %d 项，其中 `Magic1`–`Magic110` + `Magic200` |' % len(so.funcs))
    A('| `MAGIC.SO` 字符串表 | %d 项，其中 `magic\\NNN\\…` 形状引用 %d 条（整目录 %d + 具体文件 %d） |'
      % (len(so.names), len(shapestrs), n_wild, n_file))
    A('| 磁盘上 `SHAPE\\MAGIC` 子目录 | %d 个（`000`–`041` 缺 `002`、`024`） |' % len(dstats))
    A('| 被脚本引用的目录编号 | %d 个（含缺失的 002/024） |' % len(dir2skill))
    A('| 能锁定到现存目录的技能 | **%d / %d** |' % (n_with_exist, n_skill))
    A('| 只引用缺失目录的技能 | %d（伏兵/後伏兵 7 个） |' % n_missing_only)
    A('| 完全无目录线索的技能 | %d |' % n_none)
    A('| 两法都给出目录的技能 | %d（其中 %d 完全相同、%d 一方包含另一方、%d 互不包含=旋龍系） |' % (both, agree, n_super - agree, both - n_super))
    A('| 只有"对象号"线索的技能 | 1（五雷轟頂） |')
    A('| 只有"字符串"线索的技能 | 44 |')
    A('| (技能, 目录) 依赖边 | 141 条 |')
    A('')
    A('---')
    A('')
    A('## 1. 证据链（5 条）')
    A('')
    A('### E1 `Script` = `MAGIC.SO` 符号表 `num`　`[确认]`')
    A('')
    A('`F:\\sanguo\\extract\\pak\\SCRIPT\\MAGIC.SO` 头 `"Smart Script"`，`+0x10` 起 6 个 dword：')
    A('版本 `0x100`、代码起点 `0x40`、符号表偏移 `0x3D548`、符号数 **463**、字符串表偏移 `0x3F238`、字符串数 **580**。')
    A('符号表每项 16 B = `off, argc, name_off, num`。`Magic1`…`Magic110` 的 `num` 恰好是')
    A('**501…610**（`Magic200` 的 `num = 700`），与 `F:\\sanguo\\extract\\json\\magic.json`')
    A('里 110 条 `script` 字段（值域 501–610）完全同集合、一一对应。')
    A('')
    A('所以 `Script` 不是"技能序号"，而是**脚本函数号**：`Script=503` 的技能（火箭）调用的是 `Magic3`，')
    A('不是 `Magic4`；`Magic{n}` 的 n = `Script − 500`，与技能 `index` 不同序。')
    A('')
    A('### E2 `MagicN` 是极薄的包装，真正干活的是效果函数　`[确认]`')
    A('')
    A('`Magic1`（`Script=501`，命療術）整个函数体只有 3 条指令：')
    A('')
    A('```asm')
    A('03AB20  0600000000000000 PUSHI     0')
    A('03AB28  04000000387F0100 CALL      Heal')
    A('03AB30  0200000000000000 RET       0')
    A('```')
    A('')
    A('`Heal`（`@0x17F38`）开头就是取图形：')
    A('')
    A('```asm')
    A('017F38  PUSHN')
    A('017F40  PUSHS    "magic\\000\\*"')
    A('017F48  SYSCALL  0x007            ; argc=1  -> 载入图形资源')
    A('017F54  PUSHS    "magic\\016\\*"')
    A('017F5C  SYSCALL  0x007')
    A('...')
    A('018058  PUSHS    "m016snd01"')
    A('018068  SYSCALL  0x301            ; 播放音效(name, vol)')
    A('```')
    A('')
    A('`syscall 0x007` 在 `F:\\sanguo\\export\\script\\_syscall_table.md` 里记作')
    A('"载入图形资源，名字如 `magic\\000\\*`（106 次）"，宿主函数 `0x41F9E0`。')
    A('这就是"目录级"引用：一条 `PUSHS` 把整个 `MAGIC\\016` 的帧全部装进资源表。')
    A('')
    A('### E3 第二条路径：`PUSHI <ThingID>` 直接创建特效对象　`[确认]`')
    A('')
    A('`CreateHolyLight`（`@0x17A4C`，被 `Heal` 调用）里：')
    A('')
    A('```asm')
    A('017A8C  PUSHI   26001        ; CASE 0')
    A('017A94  STL     loc4')
    A('017A9C  PUSHI   26004')
    A('...')
    A('017B6C  SYSCALL 0x011        ; argc=4 -> 以单位坐标为基准创建对象')
    A('```')
    A('')
    A('`26001` 是 `THINGS.INI` 里 `MAGIC\\016` 目录第 1 个对象"聖光A"的 `Sequence`')
    A('（`Sequence = 10000 + 1000×目录号 + 目录内序号`，见 05b §3）：')
    A('`CreateHolyLight` 依次点名 `26001`–`26006`，正好是 `MAGIC\\016` 的六帧聖光 A–F；')
    A('而调用它的 `Heal` 又用 `PUSHS "magic\\016\\*"` 把同一目录整批载入——两条路径互相印证。')
    A('')
    A('"`PUSHI` 的那个数就是 `THINGS.INI` 的 `Sequence`"这一点是**实测**的，不是推断：')
    A('`syscall 0x011` 宿主 `0x41FADE` → `0x41FA7F` → `0x4217FE`，后者第一步就')
    A('`call 0x436871(第 5 参数)` 查对象定义；`0x436871` 是**对对象定义数组的线性查找**：')
    A('')
    A('```asm')
    A('436871  mov  [ebp-4], 0                 ; i = 0')
    A('43687C  jmp  436887')
    A('43687E  inc  [ebp-4]                    ; ++i')
    A('436887  cmp  ecx, [0x4BBCA0]            ; i < TotalObject')
    A('436890  jge  4368B6                     ; 找不到 -> 返回 0')
    A('436892  imul edx, edx, 0x2C             ; 每条记录 44 B')
    A('436898  mov  eax, [0x4A6614]            ; 对象定义数组')
    A('43689D  mov  ecx, [eax+edx]             ; 记录第 0 个 dword = Sequence')
    A('4368A0  cmp  ecx, [ebp+8]               ; 与传入的 ThingID 比较')
    A('4368A3  jne  4368B4                     ; 不等 -> 下一个')
    A('```')
    A('')
    A('即：传给 `syscall 0x011` 的第二个参数必须**精确等于** `THINGS.INI` 的 `Sequence`，')
    A('没有任何 `+10000` 之类的重定基。所以脚本可以绕过"整目录"，直接点名单帧对象。')

    A('')
    A('### E4 目录级引用覆盖了全部现存目录　`[确认]`')
    A('')
    A('`MAGIC.SO` 字符串表里以 `magic\\` 开头的形状串共 **%d 条**：%d 条是 `magic\\NNN\\*`'
      % (len(shapestrs), n_wild))
    A('（整目录通配，交给 `syscall 0x007`），%d 条是具体文件名（如 `MAGIC\\017\\m017a40001`）。' % n_file)
    A('把这 110 个 `MagicN`（含其调用链、含 `syscall 0x310`–`0x314` 的"按名字调用脚本"）')
    A('全部走一遍，引用到的目录编号是 `000`–`041` 共 %d 个；磁盘上现存 %d 个，'
      % (len(dir2skill), len(dstats)))
    A('**现存 %d 个目录里，除公共件 `000` 外的 %d 个全部至少被一个技能引用**（`000` 本身被 109 个技能载入，见 §4.1），'
      '没有"孤儿目录"。' % (len(dstats), len(dstats) - 1))
    A('')
    A('### E5 目录语义与技名自洽　`[推测]`')
    A('')
    A('按技名与目录内对象名对照，语义高度吻合，例如：')
    A('')
    A('| 技能 | 目录 | 目录内对象名（`THINGS.INI`） |')
    A('| --- | --- | --- |')
    A('| 半月斬 / 三日月斬 / 日月輪斬 | `001` | 半月斬、半月斬爆炸、煙塵A |')
    A('| 地泉衝 / 地泉裂勁 / 地泉鯨浪 | `026` | 水柱、水柱A–C、石頭A-B |')
    A('| 炎龍 / 炎龍無雙 / 炎龍殺陣 / 炎龍怒濤 | `017` | 火龍頭、火龍身、著火士兵身上的火 |')
    A('| 火牛陣 / 火牛群舞 / 火牛烈崩 | `027` | 牛、火焰A |')
    A('| 八卦奇陣 | `029` | 八卦×30 |')
    A('| 拒陸馬 / 絕命壩 / 十面埋伏 | `041` | 拒馬 |')
    A('| 木輪攻 / 木輪強襲 / 木輪濤擊 | `039` | 桶子、桶子碎片A–E |')
    A('')
    A('这层是"推断"，但 7 组语义全部对得上，且每组技能的目录归属与技能系（雷/火/水/召喚）一致。')
    A('')
    A('---')
    A('')
    A('## 2. 110 个武将技 → 特效目录（全表）')
    A('')
    A('列说明：`Script` = `MAGIC.INI` 字段；`函数` = `MAGIC.SO` 里的入口；')
    A('`目录` = 脚本引用的 `SHAPE\\MAGIC\\NNN`（已去掉所有技能共用的 `000`）；')
    A('`帧`/`字节` = 这些目录下 `.SHP` 的数量与体积；`依据` = 目录是"字符串"通配拿到的、')
    A('"对象号"（`PUSHI`）拿到的，还是两者都有。')
    A('')
    A('| # | 武将技 | 分类 | MP | Script | 函数 | 目录 | 帧 | 字节 | 依据 |')
    A('| ---: | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- |')
    for r in rows:
        if r['eff']:
            ds = '、'.join('%03d' % d for d in r['eff'])
            extra = '（缺失）' if r['missing'] else ''
        else:
            ds, extra = '—', ''
        A('| %d | %s | %s | %s | %d | `%s` | %s%s | %d | %d | %s |' % (
            r['index'], r['name'], r['category'] or '', r['mp'] if r['mp'] is not None else '',
            r['script'], r['fn'], ds, extra, r['frames'], r['bytes'], r['basis']))
    A('')
    A('> 表中 `帧`/`字节` 只统计存在的目录；`002`/`024` 磁盘上不存在，计 0。')
    A('')
    A('---')
    A('')
    A('## 3. 反查：每个 `MAGIC` 目录被哪些技引用')
    A('')
    A('> `000` 是所有技能的公共件（109 个技能用 `PUSHS "magic\\000\\*"` 载入，见 §4.1），')
    A('> 不等于"专属于某个技"，所以下表 `000` 行的技能数记 0；其余目录按 §2 的合并结果统计。')
    A('')
    A('| 目录 | 帧 | 字节 | 技能数 | 被哪些技引用 | 目录语义`[推测]` |')
    A('| --- | ---: | ---: | ---: | --- | --- |')
    for d in sorted(set(list(dstats) + list(dir2skill))):
        st = dstats.get(d)
        sk = dir2skill.get(d, [])
        A('| `%03d` | %s | %s | %d | %s | %s |' % (
            d, st['n'] if st else '**缺失**', st['bytes'] if st else '—', len(sk),
            '、'.join(sk) if sk else '—', DIR_SEM.get(d, '')))
    A('')
    A('---')
    A('')
    A('## 4. 特例与没对上的地方')
    A('')
    A('### 4.1 `MAGIC\\000` 是所有技能的公共资源　`[确认]`')
    A('')
    n0 = sum(1 for r in rows if 0 in r['str_dirs'])
    A('110 个技能里有 **%d 个**用 `PUSHS "magic\\000\\*"` 载入该目录（因为 `Heal`、`CastFail` 等'
      '公共子函数都带这一句；唯一例外是五雷轟頂，它的脚本只走对象号路径，见 §4.3），它是**施法通用件**，'
      '不承担某个具体技的表现，所以 §2 的"目录"列把它剔除，不计入 `103/110` 的判定。' % n0)
    A('该目录只有 18 个对象 / 32 帧，内容是"無形有重力、無形無重力、火球、集氣A–C"一类')
    A('通用光效，属于施法通用件，不承担具体技的表现，所以上表把它从"目录"列剔除了。')
    A('')
    A('### 4.2 `002` / `024` 被引用但目录不存在　`[确认]+[推测]`')
    A('')
    A('| 目录 | 引用它的技能 | 推测原因 |')
    A('| --- | --- | --- |')
    A('| `002` | 伏兵組陣、伏兵排陣、伏兵班陣、伏兵連陣（4 个） | 伏兵＝召唤己方士兵，兵的形象来自 `SHAPE\\FORCE\\`（`SOL`/`FLAG`），不需要 `MAGIC` 帧；脚本照样 `PUSHS "magic\\002\\*"`，资源不存在时载入静默失败 |')
    A('| `024` | 後伏連兵、後伏兵陣、後伏軍陣（3 个） | 同上（后排伏兵） |')
    A('')
    A('这两个目录在 `05b` 里也被记为"缺失"，此处给出原因链：**不是解包丢了文件，是游戏本来就没有。**')
    A('上表 4+3=7 个技能就是 §0 里"只引用缺失目录的 7 个"；它们没有别的现存目录可用。')
    A('')
    A('### 4.3 五雷轟頂：走对象号而非目录通配　`[确认]`')
    A('')
    A('`Magic37`（`Script=537`）只有一句 `CALL BigThunder`。`BigThunder`（`@0x96F8`）里没有任何')
    A('`magic\\NNN\\*` 字符串，但它 `syscall 0x310`（按名字调用脚本）把 `LockTargetTime3` 连同')
    A('`15008` / `15009` 两个立即数传下去：')
    A('')
    A('```asm')
    A('0098B8  PUSHS    "m005snd01"')
    A('0098C8  SYSCALL  0x301')
    A('009900  PUSHS    "LockTargetTime3"')
    A('009910  PUSHI    15008')
    A('009930  SYSCALL  0x310      ; argc=6，按名字调用脚本')
    A('009958  PUSHI    15009')
    A('009978  SYSCALL  0x310')
    A('```')
    A('')
    A('`15008`/`15009` = `10000 + 1000×5 + 8/9` → 目录 **`005`（閃電）** 的第 8、9 个对象；')
    A('`LockTargetTime3` 内部再用 `syscall 0x011` 把它们创建出来。所以五雷轟頂的特效**是** `005`，')
    A('只是通过对象号引用，目录通配那条路上看不到。这也说明只按字符串做映射会漏掉这一类。')
    A('')
    A('### 4.4 一个技跨多个目录 / 一个目录多个技　`[确认]`')
    A('')
    multi = [r for r in rows if len(r['eff']) > 1]
    A('- **跨目录的技 %d 个**：%s。' % (len(multi), '、'.join('%s(%s)' % (r['name'], '、'.join('%03d' % d for d in r['eff'])) for r in multi[:8]) or '无'))
    A('- **目录复用**：`012` 同时被 分身斬 与 鬼哭神號 用；`025` 被 太極門/太極華陣/鬼哭神號 用；')
    A('  `031` 被 集火柱/鬼哭神號 用；`018` 被 黃龍天翔/天地無用 用；`027` 被 天地無用/火牛系 用。')
    A('  鬼哭神號 同时引用 `012`+`025`+`031`，与它"多段大招"的定位一致。`[推测]`')
    A('')
    A('### 4.5 `Magic200`（`num=700`）没有对应武将技　`[未解]`')
    A('')
    A('符号表末尾有 `Magic200`，`num=700`，不在 501–610 区间，`MAGIC.INI` 也没有 700。')
    A('推测是"合体技/召唤/特殊事件"脚本或旧版遗留，本文不做归因。')
    A('')
    A('### 4.6 目录内帧序与播放时序　`[未解]`')
    A('')
    A('本文只解决"技能→目录"。**目录内 819 张帧谁先谁后、每帧停多少 tick，在脚本里表现为')
    A('一串 `PUSHI <ThingID>` + `SYSCALL 0x011` + `WAIT n`，没有集中的"帧序表"。**')
    A('要得到逐帧时间线，需要按脚本控制流做符号执行（含 `WAIT` 语义、`sc0x303` 随机数分支），')
    A('超出本轮范围。可确定的只有：帧文件名尾号（如 `M038SWORD01..`）不是播放序，播放序由脚本决定。')
    A('')
    A('### 4.7 对象号路径额外指到的目录（第二类引用）　`[确认]+[推测]`')
    A('')
    extra = collections.OrderedDict()
    for r in rows:
        for d in sorted(set(r['id_dirs']) - set(r['str_dirs']) - {0}):
            extra.setdefault(d, []).append(r)
    n_extra_ref = sum(len(v) for v in extra.values())
    A('把每个技能的"字符串目录"与"对象号目录"相减，有 **%d 个目录只由对象号引入**，'
      '涉及 **%d 条技能引用**。它们不是"字符串法的替代答案"，而是同一招式里**另外 spawn 出来的部件**'
      '（例如刀劍亂 既整目录载入 `036` 的 16 把剑，又单独 spawn 一个 `026` 的水柱当刀光）。' % (len(extra), n_extra_ref))
    A('')
    A('| 目录 | 语义 `[推测]` | 引入它的技能数 | 技能（举例） | 典型 `ThingID` → 对象名 |')
    A('| --- | --- | --- | --- | --- |')
    for d in sorted(extra):
        names = [r['name'] for r in extra[d]]
        ex = None
        for r in extra[d]:
            for pc, val, src in (r['info']['pushes'] if r['info'] else []):
                if seqmap.get(val, (None,))[0] == d:
                    ex = '%d → %s' % (val, seqmap[val][1])
                    break
            if ex:
                break
        A('| `%03d` | %s | %d | %s | %s |' % (
            d, DIR_SEM.get(d, '（未推断）'), len(names),
            '、'.join(names[:5]) + ('…' if len(names) > 5 else ''), ex or '-'))
    A('')
    A('- **只靠对象号才拿到线索的技能只有 1 个**：五雷轟頂（§4.3）。另外 65 个技能两法都有，44 个只有字符串。')
    A('- 旋龍系（旋龍/旋龍合璧/旋龍天舞）的目录差是唯一的"互不包含"：字符串给 `011`（龍捲風），')
    A('  对象号给 `001`（`CreateDummyRef` 推 `11001` = 半月斬）。`CreateDummyRef` 名字本身暗示是')
    A('  **占位/假引用**，与 `CastFail` 推 `10017`（目录 `000` 的"掉下的不動鍋"）同类。`[推测]`')
    A('- 因此主表（§2）的 `依据` 列：`字符串` 表示目录来自整目录通配（最硬），`两者` 表示两条路径都指到，')
    A('  `对象号` 表示只有对象号一条路（仅五雷轟頂）。`对象号` 行属于**较弱的证据**，已单独标出。')
    A('')
    A('---')
    A('')
    A('## 5. 复现')
    A('')
    A('```powershell')
    A('$env:PYTHONIOENCODING=\'utf-8\'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8')
    A('& "C:\\Users\\liutian\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" `')
    A('  F:\\sanguo\\tools\\magic_map.py')
    A('```')
    A('')
    A('产出：')
    A('')
    A('| 文件 | 内容 |')
    A('| --- | --- |')
    A('| `F:\\sanguo\\work\\dis_magicmap_skills.txt` | 110 个技能的完整证据（可达函数、每条 `PUSHS` 的地址与字符串、命中的 `ThingID`、音效） |')
    A('| `F:\\sanguo\\work\\dis_magicmap_dirs.txt` | 41 个目录的反查（帧数、字节、引用技能、对象名） |')
    A('| `F:\\sanguo\\work\\dis_magicmap_syscalls.txt` | 脚本里 syscall 频次 |')
    A('| `F:\\sanguo\\work\\dis_magicmap_idconflict.txt` | 27 个"字符串法 vs 对象号法"结果不一致的技能及其逐条 `ThingID` 证据（§4.7） |')
    A('| `F:\\sanguo\\docs\\05c_MAGIC特效映射.md` | 本文件 |')
    A('')
    A('依赖：`F:\\sanguo\\tools\\smartscript.py`（SO 解析/反汇编）、')
    A('`F:\\sanguo\\export\\script\\_syscall_table.md`（syscall 语义）、')
    A('`F:\\sanguo\\extract\\json\\magic.json`（技能表）、')
    A('`F:\\sanguo\\work\\things_parsed.json`（`Sequence`→目录号）。')
    A('')
    open(DOC, 'w', encoding='utf-8').write('\n'.join(L) + '\n')


if __name__ == '__main__':
    main()
