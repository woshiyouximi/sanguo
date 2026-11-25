# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as ss

cnt = {}
for line in open(r'F:\sanguo\export\script\_opcounts.txt', encoding='utf-8'):
    a = line.split()
    cnt[int(a[0], 16)] = (int(a[1]), int(a[2]))

OPDESC = {
0x00: ('空操作', 'NOP'),
0x01: ('函数返回并带回返回值；n = 调用者压入的参数个数（用于清栈）', 'retval -> caller'),
0x02: ('函数返回（无返回值）；n = 参数个数', ''),
0x03: ('压 n 个 0，为局部变量预留槽位', 'stack += n'),
0x04: ('调用脚本内函数，target 为 .SO 文件内绝对偏移', 'call'),
0x05: ('调用宿主 API（syscall）；id 为 0..0x3FF，flags 低 16 位=参数个数，高 16 位=返回处理（0 无/1,2 整数/3 字符串）', 'host call'),
0x06: ('压入 32 位立即数（整数）', 'push imm'),
0x07: ('压入字符串表中的第 idx 个字符串（新建字符串对象）', 'push str'),
0x08: ('读局部槽（frame+idx）；若为字符串则克隆一份再压栈', 'push slot'),
0x09: ('读脚本全局槽 idx（0..120）', 'push global'),
0x0A: ('读引擎全局整型数组 0x4A6878[idx]（idx 0..0x3F）', 'push engine[idx]'),
0x0B: ('弹出值写入局部槽 frame+idx', 'slot = pop'),
0x0C: ('弹出值写入脚本全局槽 idx', 'global[idx] = pop'),
0x0D: ('弹出值写入引擎全局数组 0x4A6878[idx]', 'engine[idx] = pop'),
0x0E: ('弹出并丢弃栈顶（字符串则释放）', 'pop'),
0x0F: ('整数加：b + a', 'push b+a'),
0x10: ('浮点加', 'push b+a'),
0x11: ('字符串比较辅助（脚本中未出现）', ''),
0x12: ('整数减：b - a', 'push b-a'),
0x13: ('浮点减', 'push b-a'),
0x14: ('整数乘', 'push b*a'),
0x15: ('浮点乘', 'push b*a'),
0x16: ('整数除：b / a（商）', 'push b/a'),
0x17: ('浮点除', 'push b/a'),
0x18: ('整数取余：b % a', 'push b%a'),
0x19: ('未实现/占位：弹两个值后固定压 0（脚本中未出现）', 'push 0'),
0x1A: ('整数取负', 'push -a'),
0x1B: ('浮点取负', 'push -a'),
0x1C: ('按位取反', 'push ~a'),
0x1D: ('局部槽 idx 自增（字符串槽跳过）', 'slot[idx]++'),
0x1E: ('脚本全局槽 idx 自增', 'global[idx]++'),
0x1F: ('引擎全局数组 idx 自增（idx < 0x40）', 'engine[idx]++'),
0x20: ('局部槽 idx 自减', 'slot[idx]--'),
0x21: ('脚本全局槽 idx 自减', 'global[idx]--'),
0x22: ('引擎全局数组 idx 自减', 'engine[idx]--'),
0x23: ('按位与', 'push b&a'),
0x24: ('按位或', 'push b|a'),
0x25: ('按位异或', 'push b^a'),
0x26: ('整数相等比较，结果 0/1', 'push b==a'),
0x27: ('同 0x26（编译器产生的重复表项）', 'push b==a'),
0x28: ('字符串相等比较（非字符串操作数先转字符串）', 'push strcmp==0'),
0x29: ('整数不等', 'push b!=a'),
0x2A: ('同 0x29（重复表项）', 'push b!=a'),
0x2B: ('字符串不等', 'push strcmp!=0'),
0x2C: ('整数大于：b > a', 'push b>a'),
0x2D: ('浮点大于', 'push b>a'),
0x2E: ('字符串大于', 'push strcmp>0'),
0x2F: ('整数大于等于', 'push b>=a'),
0x30: ('浮点大于等于', 'push b>=a'),
0x31: ('字符串大于等于', 'push strcmp>=0'),
0x32: ('整数小于', 'push b<a'),
0x33: ('浮点小于', 'push b<a'),
0x34: ('字符串小于', 'push strcmp<0'),
0x35: ('整数小于等于', 'push b<=a'),
0x36: ('浮点小于等于', 'push b<=a'),
0x37: ('字符串小于等于', 'push strcmp<=0'),
0x38: ('逻辑非：非 0 → 0，0 → 1', 'push !a'),
0x39: ('逻辑与：两操作数均非 0 → 1', 'push a&&b'),
0x3A: ('逻辑或', 'push a||b'),
0x3B: ('无条件跳转；target 为 .SO 文件内绝对偏移', 'pc = target'),
0x3C: ('条件跳转：弹出条件，为 0 时跳转', 'if(!pop) pc=target'),
0x3D: ('条件跳转：弹出条件，非 0 时跳转', 'if(pop) pc=target'),
0x3E: ('左移：b << a', 'push b<<a'),
0x3F: ('算术右移：b >> a', 'push b>>a'),
0x40: ('switch 分支：弹出值，若等于 imm 则跳到 target，否则把值压回供下一个 CASE 比较', 'case v: goto target'),
0x41: ('空操作（重复表项）', ''),
0x42: ('等待 n 帧：挂起本 VM，n 递减到 0 再继续（动画节奏）', 'wait n'),
0x43: ('空操作（重复表项）', ''),
0x44: ('空操作（重复表项）', ''),
0x45: ('按名字查找/挂起等待（0 参数，与字符串回调机制 0x4658A0 相关；脚本中未出现）', ''),
0x46: ('按名字查找脚本对象并压入句柄（0 参数；脚本中未出现）', 'push handle'),
0x47: ('按名字调用另一脚本函数，带 4 个参数：name, a, b, c, d（name 最先压栈）', 'call name(a,b,c,d)'),
0x48: ('整数转浮点', 'push (float)a'),
0x49: ('整数转字符串对象', 'push itoa(a)'),
0x4A: ('浮点转整数（截断）', 'push (int)a'),
0x4B: ('浮点转字符串对象', 'push ftoa(a)'),
0x4C: ('弹出值并释放（字符串），然后压 0（脚本中未出现）', 'push 0'),
0x4D: ('同 0x4C（重复表项，脚本中未出现）', 'push 0'),
0x4E: ('读局部字符串槽 idx，克隆后压栈', 'push clone(slot[idx])'),
0x4F: ('读脚本全局字符串槽 idx，克隆后压栈', 'push clone(global[idx])'),
0x50: ('引擎数组按下标读：先弹 idx，再取 base，读 0x4A6878[base+idx]（无边界检查）', 'push engine[base+idx]'),
0x51: ('局部槽按下标写：弹值、base、idx，写 frame+base+idx', 'slot[base+idx]=v'),
0x52: ('脚本全局槽按下标写', 'global[base+idx]=v'),
0x53: ('引擎数组按下标写', 'engine[base+idx]=v'),
0x54: ('局部槽按下标自增', 'slot[base+idx]++'),
0x55: ('脚本全局槽按下标自增', 'global[base+idx]++'),
0x56: ('引擎数组按下标自增', 'engine[base+idx]++'),
0x57: ('局部槽按下标自减', 'slot[base+idx]--'),
0x58: ('脚本全局槽按下标自减', 'global[base+idx]--'),
0x59: ('引擎数组按下标自减', 'engine[base+idx]--'),
}

rows = []
for op in range(0x5A):
    name, kinds, delta = ss.OPS[op]
    fmt = {'': '—', 'I': 'imm32', 'O': 'offset', 'S': 'str#', 'X': 'slot', 'YF': 'id, flags', 'CO': 'val, target'}[kinds]
    m, s = cnt.get(op, (0, 0))
    desc = OPDESC[op][0]
    rows.append('| 0x%02X | `%s` | %s | %d | %d | %s |' % (op, name, fmt, m, s, desc))
tbl = '\n'.join(rows)
open(r'F:\sanguo\export\script\_opcode_table.md', 'w', encoding='utf-8').write(tbl)
print('rows', len(rows), 'chars', len(tbl))
