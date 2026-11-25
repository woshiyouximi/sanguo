# -*- coding: utf-8 -*-
import sys, io, json, collections, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

tab = {}
for k, v in json.load(open(r'F:\sanguo\export\script\syscall_table.json', encoding='utf-8')).items():
    tab[int(k)] = v

agg = collections.defaultdict(lambda: {'n': 0, 'argc': set(), 'ret': set(), 'f': collections.Counter()})
for fn, label in [(r'F:\sanguo\export\script\magic_so.dis.txt', 'MAGIC'),
                  (r'F:\sanguo\export\script\system_so.dis.txt', 'SYSTEM')]:
    for line in open(fn, encoding='utf-8'):
        m = re.search(r'SYSCALL\s+0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)', line)
        if not m: continue
        sid = int(m.group(1), 16); fl = int(m.group(2), 16)
        a = agg[sid]; a['n'] += 1; a['argc'].add(fl & 0xffff); a['ret'].add(fl >> 16); a['f'][label] += 1

N = {
0x001:'以 MagicDef 对象 [+4] 的脚本号运行脚本（4 参数）',
0x003:'0x43483A(a,b,c) 后排队回调（动画节拍）',
0x006:'0x434885(a,b,c)（c≠0 时）',
0x007:'载入图形资源，名字如 "magic\\000\\*"（106 次）',
0x008:'资源/动画辅助（0x41F9F1，未细解）',
0x00A:'0x41FA3C（SYSTEM 常用，未细解）',
0x00B:'取当前脚本/单位句柄 [0x4A69A8]+0x24',
0x010:'在 (x,y,z) 创建对象/特效，返回句柄',
0x011:'以单位坐标为基准创建对象（unit, dx,dy,dz）',
0x012:'单位存在性检查',
0x013:'单位移除/死亡处理（校验 0x1234 魔数，遍历 0x4C2C04 链表）',
0x014:'0x422548(unit,a,b,c)',
0x015:'两单位+坐标 → 0x468990（线段/距离计算）',
0x016:'0x41FC36（6 参数，未细解）',
0x017:'0x41FD2B（3 参数，未细解）',
0x018:'0x422548(unit,a,b,c)',
0x019:'0x41FD98（3 参数，未细解）',
0x01A:'0x41FDE0（1 参数，返回 int）',
0x01B:'设置单位动画/帧（写 +0x5C、+0x60）',
0x01C:'0x41FE45（2 参数，未细解）',
0x01D:'0x41FE86（2 参数，未细解）',
0x01E:'0x41FEAC（2 参数，未细解）',
0x01F:'0x41FEFB（2 参数，未细解）',
0x020:'0x41FF21（2 参数，未细解）',
0x021:'0x41FF4A（2 参数，未细解）',
0x023:'0x41FF70（3 参数，返回 int）',
0x024:'0x420049（4 参数，返回 int）',
0x025:'0x420131（2 参数，未细解）',
0x026:'设置移动/动作指令：写 +0x8C=(a<<16)|b、+0x90=0x100000、+0x50=b，flags|=0x40000',
0x027:'0x42018F（2 参数，未细解）',
0x028:'0x4201B5（4 参数，未细解）',
0x029:'单位状态标志 |= arg（+0x30）',
0x02B:'0x420261（2 参数，未细解）',
0x02C:'写 [unit+0x98]',
0x02E:'0x4202E7（3 参数，未细解）',
0x02F:'0x42031A（2 参数，返回 int）',
0x031:'0x420377（2 参数，未细解）',
0x100:'设置脚本目标坐标（全局 0x4AC368/0x4AC370）',
0x101:'单位所在格 X（x/0x60）',
0x102:'单位所在格 Y（y/0x48）',
0x103:'格 X → 像素（i*0x60+0x30）',
0x104:'格 Y → 像素（i*0x48+0x24）',
0x105:'单位 X（定点 16.16，>>16）',
0x106:'单位 Y',
0x107:'单位 Z',
0x108:'像素 → 格 X（/0x60）',
0x109:'像素 → 格 Y（/0x48）',
0x10C:'0x43A795(side) 取阵营对象',
0x10D:'0x43A7AC(side) 遍历对象数组',
0x10E:'设置单位目标 [unitA+0x88] = unitB',
0x10F:'设置目标坐标 = 单位坐标 + 偏移',
0x110:'清 0x4A6660（战斗流程标志）',
0x111:'取目标 X',
0x112:'取目标 Y',
0x113:'0x43AFAA(a,b) → 对象 [+4] 句柄',
0x114:'清 0x4A6660/0x4A6670，0x48E520=0x10',
0x115:'阵营判断（比较 vtable 0x4A8A60 / 0x4B03A0）',
0x116:'取 word[obj+0x2E]（符号扩展）',
0x117:'取 word[obj+0x12]',
0x118:'设 word[obj+0x12] = min(arg, word[obj+0x10])',
0x119:'创建伏兵/对象数组元素，返回句柄（推测：说明文件称“召唤伏兵高级兵”，参数 x/y/类型）',
0x120:'0x421E1B(unit,val)',
0x121:'[unit+0x3C] += val*0x28',
0x122:'0x42074F（无参数，未细解）',
0x123:'0x420759（无参数，未细解）',
0x124:'0x444362（清标志）',
0x125:'0x43ED96(unit,a,b)',
0x127:'0x43EE09(unit,val)',
0x128:'写经 [unit+0x84] 取得对象的 [+0x40]+0x54',
0x129:'0x43B375（单位/对象查询，返回 int）',
0x12A:'0x43EEA9（5 参数，返回 int）',
0x12B:'0x43EEE8（6 参数，返回 int）',
0x12D:'0x420887（无参数，返回 int）',
0x12E:'0x420891（无参数，返回 int）',
0x12F:'置全局 0x48E520 = min(v,0x10)（亮度/强度）',
0x130:'读 0x48E520',
0x131:'置 0x4A6660 = 1',
0x132:'0x4208C0（无参数，返回 int）',
0x133:'0x4208CA（无参数，返回 int）',
0x134:'0x4208D4（1 参数，返回 int）',
0x135:'0x46D0A0 + 0x43A73C（显示模式相关）',
0x136:'0x43A750 + 0x46B2A0（显示模式相关）',
0x138:'0x4209B2（1 参数，未细解）',
0x139:'0x443CF5（1 参数，未细解）',
0x200:'参数原样返回（字符串/通用透传）',
0x201:'round(*(float*)addr * k)',
0x202:'round(*(float*)addr * k)（另一入口）',
0x203:'屏幕中心 X（320/2）',
0x204:'屏幕中心 Y（240/2）',
0x205:'0x40D8F7（屏幕坐标换算）',
0x206:'屏幕区域判定，返回 0/1/2',
0x209:'0x44ECC2（无参数，未细解）',
0x210:'0x44EDB4（无参数，未细解）',
0x211:'0x44EBE2（无参数，未细解）',
0x212:'读 [0x48CD28]',
0x213:'strcpy(dest, src) —— 向任意地址写字符串',
0x214:'读 u32（*(u32*)addr）',
0x215:'读 i16',
0x216:'读 i8',
0x217:'写 u32（*(u32*)addr = v）',
0x218:'写 u16',
0x219:'写 u8',
0x300:'0x420B26（3 参数，未细解）',
0x301:'播放音效(name, vol)（0x4699A0）',
0x303:'随机数 rand(min,max)（750 次，最常用）',
0x310:'按名字调用脚本，6 参数',
0x311:'按名字调用脚本，7 参数',
0x312:'按名字调用脚本，8 参数',
0x313:'按名字调用脚本，9 参数',
0x314:'按名字调用脚本，10 参数',
}

rows = []
for sid in sorted(agg):
    a = agg[sid]
    argc = ','.join(str(x) for x in sorted(a['argc']))
    ret = ','.join(str(x) for x in sorted(a['ret']))
    host = tab.get(sid)
    rows.append('| 0x%03X | %d | %s | %s | %s | %s | %s |' % (
        sid, a['n'], argc, ret, ('0x%X' % host) if host else '?', N.get(sid, '未解析'),
        '/'.join(k for k in ('MAGIC', 'SYSTEM') if a['f'][k])))
tbl = '\n'.join(rows)
open(r'F:\sanguo\export\script\_syscall_table.md', 'w', encoding='utf-8').write(tbl)
print('syscalls', len(rows), 'chars', len(tbl))
