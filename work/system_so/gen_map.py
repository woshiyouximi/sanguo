# -*- coding: utf-8 -*-
"""SYSTEM.SO 39 个函数的地图生成器。

产出 work/system_so/map.md：每个函数的地址/名字/参数个数/字节数/指令数/
调用的 syscall（及其出现次数）/字符串字面量/文件内 CALL 关系，并给出
"在 2D 重制里复现它要做什么"的成本估计。

数据来源全部是磁盘上已有的导出物：
  extract/pak/SCRIPT/SYSTEM.SO        （原始字节码）
  export/script/system_so.dis.txt     （反汇编，本脚本不重读）
  export/script/syscall_table.json    （id -> EXE handler 地址）
解码逻辑复用 tools/smartscript.py 的 OPS 表（同一份 90 条 opcode）。
"""
import json
import os
import struct
import sys
from collections import Counter, OrderedDict

ROOT = r'F:\sanguo'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from smartscript import OPS, SOFile, slot_name  # noqa: E402

SO_PATH = os.path.join(ROOT, 'extract', 'pak', 'SCRIPT', 'SYSTEM.SO')
SYSCALL_JSON = os.path.join(ROOT, 'export', 'script', 'syscall_table.json')
OUT = os.path.join(ROOT, 'work', 'system_so', 'map.md')

# EXE handler 地址 -> 人话（来自 syscall_handlers.asm.txt 的逐条核对）
SYSCALL_NOTE = {
    0x0: 'NOP/常量', 0x1: 'RunById 运行脚本', 0x3: '排队回调',
    0x7: '载入图形资源 magic\\NNN\\*', 0x9: 'MoveCamera 移镜头',
    0xA: '读全局/引擎量', 0xB: '取当前施法单位句柄',
    0x10: '创建物件(res,x,y,z)', 0x11: '单位身上创建物件',
    0x12: '物件是否结束(0=活动)', 0x13: '移出活动列表',
    0x14: '设置物件像素坐标', 0x15: '设置方向+速度',
    0x17: '设置物件 x/y', 0x18: '设置存在帧数', 0x19: '设置动作号',
    0x23: '创建物件(2)', 0x24: '创建物件(3)', 0x25: '动作/帧',
    0x26: '设置单位移动', 0x27: '单位动作', 0x28: '物件轨迹', 0x29: '动作号',
    0x100: '设置目标格', 0x101: '单位列', 0x102: '单位行', 0x103: '列->像素 x',
    0x104: '行->像素 y', 0x105: '单位像素 x', 0x106: '单位像素 y',
    0x107: '单位像素 z', 0x108: '像素 x->列', 0x109: '像素 y->行',
    0x10C: '单位阵营', 0x10D: '活动物件遍历', 0x110: '屏幕闪白 关',
    0x111: '目标像素 x', 0x112: '目标像素 y', 0x113: '格上单位',
    0x115: '是否同阵营', 0x116: '单位状态字', 0x117: '读 HP',
    0x118: '设置 HP(不超过 maxHP)', 0x119: '召唤', 0x125: '加/减 HP',
    0x120: '视觉状态', 0x121: '视觉状态', 0x128: '视觉状态',
    0x129: '句柄归一化', 0x12A: '按单位创建物件', 0x12B: '按单位创建物件(2)',
    0x12D: '常量 71', 0x12E: '常量 0', 0x12F: '设置强度 0x48E520=min(v,0x10)',
    0x130: '读强度', 0x131: '屏幕闪白 开', 0x132: '常量 6824', 0x133: '常量 1008',
    0x134: '单位动作(带 0x10003)', 0x135: '单位帧', 0x136: '单位帧',
    0x138: '单位/物件状态',
    0x201: '定点乘', 0x202: '恒等', 0x203: '常量 160', 0x204: '常量 120',
    0x213: '取第二个参数', 0x300: '3D 音效(unit,name,vol)', 0x301: '音效(name,vol)',
    0x303: '随机数 rand(min,max)', 0x310: '按名字调用脚本(6 参)',
    0x311: '按名字调用脚本(7 参)', 0x312: '按名字调用脚本(8 参)',
    0x313: '按名字调用脚本(9 参)', 0x314: '按名字调用脚本(10 参)',
}


def decode_func(so, f, limit_off):
    """返回 (指令数, Counter(ops), Counter(syscall id), [字符串], [CALL 目标函数名])"""
    data = so.data
    pc = f['off']
    n = 0
    ops = Counter()
    syscalls = Counter()
    strings = []
    calls = []
    while pc + 4 <= limit_off:
        op = struct.unpack_from('<i', data, pc)[0]
        if op not in OPS:
            pc += 4
            n += 1
            ops['???'] += 1
            continue
        name, kinds, _ = OPS[op]
        ops[name] += 1
        n += 1
        p = pc + 4
        if kinds == 'YF':
            sid, flags = struct.unpack_from('<2i', data, p)
            p += 8
            syscalls[sid] += 1
        elif kinds == 'S':
            sidx = struct.unpack_from('<i', data, p)[0]
            p += 4
            if 0 <= sidx < len(so.names):
                strings.append(so.names[sidx])
        elif kinds == 'O':
            tgt = struct.unpack_from('<i', data, p)[0]
            p += 4
            if op == 0x04:
                tf = so.by_off.get(tgt)
                calls.append(tf['name'] if tf else '0x%X' % tgt)
        elif kinds in ('I', 'X'):
            p += 4
        elif kinds == 'CO':
            p += 8
        # 函数体在 RET/RETV 之后仍有对齐填充，这里不提前退出：
        # 用"下一个函数入口"当硬边界即可（SYSTEM.SO 每个函数都以 RET 结尾）。
        pc = p
    return n, ops, syscalls, strings, calls


def main():
    syscalls_addr = {}
    try:
        raw = json.load(open(SYSCALL_JSON))
        syscalls_addr = {int(k): v for k, v in raw.items()}
    except Exception as e:  # pragma: no cover
        print('warn: syscall_table.json 读取失败', e)

    so = SOFile(SO_PATH)
    funcs = sorted(so.funcs, key=lambda f: f['off'])
    offs = [f['off'] for f in funcs] + [so.code_end]

    # 文件内调用图：谁 CALL 了谁
    callers = OrderedDict((f['idx'], []) for f in funcs)
    rows = []
    for i, f in enumerate(funcs):
        n, ops, syscalls, strings, calls = decode_func(so, f, offs[i + 1])
        for c in calls:
            for g in funcs:
                if g['name'] == c:
                    callers[g['idx']].append(f['name'])
        rows.append({
            'idx': f['idx'], 'name': f['name'], 'off': f['off'], 'argc': f['argc'],
            'num': f['num'], 'size': offs[i + 1] - f['off'], 'insns': n,
            'syscalls': syscalls, 'strings': strings, 'calls': calls,
        })

    lines = []
    A = lines.append
    A('# SYSTEM.SO 39 个函数地图')
    A('')
    A('> 生成器：`work/system_so/gen_map.py`（读 `extract/pak/SCRIPT/SYSTEM.SO` +')
    A('> `export/script/syscall_table.json`，解码表与 `tools/smartscript.py` 共用同一份 90 条 opcode）。')
    A('> 重跑：`python.exe work/system_so/gen_map.py`。')
    A('')
    A('## 0. 结论摘要')
    A('')
    total_bytes = sum(r['size'] for r in rows)
    total_insns = sum(r['insns'] for r in rows)
    A('- 函数 **%d** 个，代码 **0x%X..0x%X**（%d 字节），共 **%d** 条指令；字符串表 %d 条。'
      % (len(rows), so.code_start, so.code_end, total_bytes, total_insns, len(so.names)))
    A('- 只有 4 个函数直接发声（`AllRush`→Rush01、`ChildGenTalkNew`→SUCCESS、'
      '`LoadingBattleMap`→BG03A/BG04A/BG08A/BG09A、`MajorDeath`→VICTORY），'
      '战报/招降台词走文字表而不是语音。')
    A('- 和 MAGIC.SO 完全不同：SYSTEM.SO 里**没有**物件/特效创建调用'
      '（0x10/0x11/0x23/0x24 一次都没出现），它是"战役流程 + 菜单 + 文字"层。')
    A('- 代价最低的 5 个（纯引擎侧可复现、不需要新美术资源）见 §3。')
    A('')
    A('## 1. 证据来源')
    A('')
    A('| 证据 | 路径 | 用途 |')
    A('| --- | --- | --- |')
    A('| 字节码 | `extract/pak/SCRIPT/SYSTEM.SO`（%d B） | 函数表/字符串表/指令 |' % os.path.getsize(SO_PATH))
    A('| 反汇编 | `export/script/system_so.dis.txt`（183687 B） | 逐条人工核对 |')
    A('| handler 反汇编 | `export/script/syscall_handlers.asm.txt` | syscall 语义 |')
    A('| id→host | `export/script/syscall_table.json` | 本表 syscall 列 |')
    A('| 符号语义 | `docs/04d_AI与脚本引擎.md` §2.3/§2.4 | 名字/参数个数交叉验证 |')
    A('')
    A('## 2. 39 个函数全表')
    A('')
    A('列说明：**地址**=代码偏移；**参数**=argc（脚本 CALL 压的参数个数）；'
      '**字节/指令**=函数体规模；**syscall**=调到的宿主函数（`id×次数`）；'
      '**字符串**=PUSHS 引用的字面量；**文件内被调用**=SYSTEM.SO 内部 CALL 它的函数。')
    A('')
    A('| # | 名字 | 地址 | 参数 | 字节 | 指令 | syscall | 字符串 | 文件内被调用 | 语义（推断） |')
    A('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for r in rows:
        sc = ' '.join('`0x%X`×%d' % (k, v) for k, v in sorted(r['syscalls'].items())) or '—'
        st = ' / '.join('`%s`' % s for s in r['strings'][:4]) or '—'
        if len(r['strings']) > 4:
            st += ' …(+%d)' % (len(r['strings']) - 4)
        by = ', '.join(callers[r['idx']]) or '—'
        A('| %d | `%s` | 0x%X | %d | %d | %d | %s | %s | %s | %s |'
          % (r['idx'], r['name'], r['off'], r['argc'], r['size'], r['insns'], sc, st, by,
             SEMANTIC.get(r['name'], '')))
    A('')
    A('## 3. 最便宜的 5 个（本任务实装）')
    A('')
    A(('挑选判据：① 函数体小（≤120 字节）；② 只调已经实现、语义确定的 syscall；'
       '③ 产出的可见效果在 2D 客户端里已有承载物（亮度/音效/文字），不需要新美术。'))
    A('')
    A('| 函数 | 依据 | 本任务落到哪里 |')
    A('| --- | --- | --- |')
    for name, why, where in CHEAP:
        A('| `%s` | %s | %s |' % (name, why, where))
    A('')
    A('## 4. 其余 34 个为什么不实装')
    A('')
    for name, why in NOT_CHEAP:
        A('- `%s`：%s' % (name, why))
    A('')
    A('## 5. 未解问题（留给后续）')
    A('')
    A('- 0x12F/0x130/0x131/0x110 背后的 `0x4442d4 / 0x4442f4 / 0x4442fe / 0x44430d` 四个小函数')
    A('  只从调用点确认了"带一个参数的 setter / 无参 getter / 无参 set 1 / 无参 clear"的形状，')
    A('  具体写的全局（0x48E520 亮度、0x4A6660 闪白）来自 `tools/ss_systable.py` 的反汇编注释，')
    A('  仍属**推测**；0x131 与 0x110 各 46 次成对出现（`grep SYSCALL` 计数），这一点支持"开/关"解释。')
    A('- SYSTEM.SO 的 39 个函数在 EXE 里没有直接 CALL 者——它们是 `CALLS`（按名字）调用的目标。')
    A('  按名字调用的静态调用方需要扫全部 .SO 的 `CALLS` 字符串，本任务未做。')
    A('- 招降台词（strings 27-29）与战报台词（36-43）用 `%S1% %S2% %k% %e% %K% %E%` 占位符，')
    A('  替换规则（谁填 S1/S2、k/e 与 K/E 的大小写差异）未从代码里确认。')
    A('')
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    print('wrote', OUT, len(lines), 'lines')
    for r in rows:
        print('%2d %-24s 0x%-4X argc=%d size=%4d insns=%3d  %s' % (
            r['idx'], r['name'], r['off'], r['argc'], r['size'], r['insns'],
            ' '.join('0x%X' % k for k in sorted(r['syscalls']))))


SEMANTIC = {
    'GetByte_Old': '读宿主内存字节（0x4A6878 基址+偏移）',
    'GetByte_Signed_Old': '同上，带符号',
    'GetShort_Old': '读宿主内存 short（4 字节对齐分支）',
    'GetShort_Signed_Old': '同上，带符号',
    'GetInt_Old': '读宿主内存 dword',
    'SetInt_Old': '写宿主内存 dword',
    'SetShort_Old': '写宿主内存 short',
    'SetByte_Old': '写宿主内存字节',
    'SetString_Old': '写宿主字符串',
    'MoveCamera': '镜头移动到格子坐标',
    'CheckGround': '查地形/地面类型',
    'WeatherObjectDeath': '天气物件销毁（雨/雪/雾收尾）',
    'ProduceRain': '下雨',
    'ProduceSnow': '下雪',
    'ProduceFog': '起雾',
    'Battle2': '战役流程 2（战斗主循环入口）',
    'EnterWar4': '进入战斗形态 4',
    'EnterWar5': '进入战斗形态 5',
    'EnterWar7': '进入战斗形态 7',
    'LoadingBattleMap': '载入战场地图 + 底噪（BG03A/04A/08A/09A）',
    'BattleYield': '战场撤退/投降（7 参）',
    'StartBattle': '开战（设定阵营/初始阵型）',
    'AllRush': '全军突击（Rush01 + 台词）',
    'BattleEndTalk': '战后对话',
    'ReportResult': '战报（8 种结局台词选一）',
    'SearchTalk': '探索结果（找到/找不到）',
    'ChildGenTalkNew': '武将对话（SUCCESS/FAILURE2 音效）',
    'KillGeneral': '武将阵亡处理',
    'FreeGeneral': '释放武将对象',
    'YieldGeneral': '招降判定（2 参）',
    'DownBrightness': '降低亮度（t 帧内渐变）',
    'RaiseBrightness': '提高亮度（t 帧内渐变）',
    'Test01': '调试用',
    'EnterMapMoveCamera': '大地图镜头移动（3 参）',
    'MajorDeath': '大将阵亡（Yell03/Horse02/VICTORY）',
    'EnterWarprep': '进入战前准备菜单',
    'EnterBattle': '进入战斗',
    'EnterMapmode': '进入大地图模式',
    'EnterPolicy': '进入内政菜单',
}

CHEAP = [
    ('LoadingBattleMap', 'a=1；只做 4 次 `0x301` 音效 + 载一张 .SHP；本任务已有 `audio.js` 的 amb/bgm 通道', '`syscalls.ts` 0x00C 同族：把 4 个地形底噪送进 `audio_bus`'),
    ('AllRush', 'num=59；函数体里只有 `0x301(Rush01)` + 一句台词', '`audio_bus` 播 `rush01`（index.json 里有）'),
    ('ReportResult', 'a=1；纯字符串选择，8 条台词已在 strings 36-43', '`syscalls.ts` 新 case：`0x301(VICTORY)` + 战报文本'),
    ('DownBrightness', 'a=2；一次 `0x12F` 写入强度', '`audio_bus` 的 brightness 通道（R52 同一根管子）'),
    ('RaiseBrightness', 'a=2；同上', '同上'),
]

NOT_CHEAP = [
    ('GetByte_Old / GetByte_Signed_Old / GetShort_Old / GetShort_Signed_Old / GetInt_Old / SetInt_Old / SetShort_Old / SetByte_Old / SetString_Old',
     '这 9 个直接解引用原作 EXE 的数据段基址 0x4A6878（脚本里是 PUSHI 4876408），'
     '读的是宿主进程内存；重制版没有这块内存，语义无法对齐，只能全部返 0'),
    ('MoveCamera / EnterMapMoveCamera', '需要镜头系统；竖版重制的战场没有可移动镜头（`layout.ts` 固定视口）'),
    ('ProduceRain / ProduceSnow / ProduceFog / WeatherObjectDeath', '需要粒子天气层，属于新的渲染工作，不是"接线"'),
    ('Battle2 / EnterWar4 / EnterWar5 / EnterWar7 / StartBattle / EnterBattle',
     '战役流程状态机入口，`campaign.html` + `city_model.js` 是别的 agent 的地盘，本任务不碰'),
    ('BattleYield / KillGeneral / FreeGeneral / YieldGeneral / MajorDeath',
     '改写武将生死/招降状态，落在 `battle.ts`（不在本任务授权范围）'),
    ('BattleEndTalk / SearchTalk / ChildGenTalkNew', '对话系统（打字/占位符替换），`campaign.html` 侧'),
    ('EnterWarprep / EnterMapmode / EnterPolicy', '菜单切换，`MENU\\*.SHP` 资源未导出'),
    ('CheckGround', '读地形表；`world.terrain` 已有等价物，但调用点全在战役层'),
    ('Test01', '调试函数，无调用者'),
]

if __name__ == '__main__':
    main()
