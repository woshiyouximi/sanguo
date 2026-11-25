# -*- coding: utf-8 -*-
p = r'F:\sanguo\docs\04-脚本引擎SmartScript.md'
s = open(p, encoding='utf-8').read()
reps = [
("| 0x45 | `OP45` | — | 62 | 2 | 按名字查找/挂起等待（0 参数，与字符串回调机制 0x4658A0 相关；脚本中未出现） |",
 "| 0x45 | `WAITFOR` | — | 62 | 2 | 等待名为 name 的脚本结束：弹名字串，轮询活动 VM 列表直到同名函数消失（同步点） |"),
("| 0x46 | `OP46` | — | 0 | 0 | 按名字查找脚本对象并压入句柄（0 参数；脚本中未出现） |",
 "| 0x46 | `FINDVM` | — | 0 | 0 | 按名字查找活动 VM，压入其句柄（0/非 0）；脚本中未出现 |"),
("| `0x45`/`0x46` | 弹出名字串后走 `0x4658A0` / `0x465820` | 脚本中 0 次；与“按名字查找/等待”有关 |",
 "| `0x45` | `PUSHS \"MoveCamera\"; WAITFOR` | 弹名字串，调用 `0x4658A0`→`0x464D70(0x465820, name, 2)` 设置等待回调；`0x465820` 在活动 VM 列表 0x4A686C 中按“当前函数名”查找，找到就继续挂起，找不到才恢复执行 → 等待同名脚本结束（MAGIC 62 次、SYSTEM 2 次） |"),
("| `0x46` | 弹出名字串后走 `0x465820` | 脚本中 0 次；疑似“查找活动 VM” |" if False else None, None),
("2. **`0x45` / `0x46` / `0x4C` / `0x4D` / `0x11` / `0x19` 六条指令在脚本中从未出现**，语义仅由 handler 反汇编推测，缺少真实用例验证。",
 "2. **`0x46` / `0x4C` / `0x4D` / `0x11` / `0x19` 五条指令在脚本中从未出现**，语义仅由 handler 反汇编推测，缺少真实用例验证；`0x45 WAITFOR` 已有 64 个用例（等待同名脚本结束），但“同名脚本如何启动”仍依赖 `CALLS`/syscall 0x310–0x314 两条路径。"),
]
for a,b in reps:
    if a is None: continue
    if a not in s:
        print('MISS:', a[:60])
    else:
        s = s.replace(a, b)
open(p,'w',encoding='utf-8').write(s)
print('ok', len(s))
