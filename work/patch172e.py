# -*- coding: utf-8 -*-
import io

p = r'F:\sanguo\work\gen172.py'
lines = io.open(p, encoding='utf-8').read().split('\n')

# 303(1-based) 与 305 行整体替换
assert lines[302].strip().startswith("'`:264-272`"), lines[302][:60]
lines[302] = "       '`:264-272` 在 `canRecruit()` 里再判一次同样三档（给上层报错文案用，code 与 0x404344 对齐）。',"
assert lines[304].strip().startswith("'✅ 维持：硬门在掷骰之后"), lines[304][:60]
lines[304] = "     '✅ 维持：实现分两处（纯概率函数 + 决策函数）但规则一致，测试 11 条盖住 ④⑤ 两次掷骰'),"
lines[303] = "       '`:437-438` 招降落地忠≥50 折 2/3；`tests/capture.test.ts` 11 条（含 ④⑤ 两次掷骰）。'],"

io.open(p, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('patched5')
