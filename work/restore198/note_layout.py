import re

p = r'F:\sanguo\game\src\view\layout.ts'
raw = open(p, 'rb').read()
s = raw.decode('utf-8', 'replace')

NOTE = """/*
 * ⚠ R198 事故说明（2026-11-25 19:23）
 *
 * 本文件的**代码部分完好**（tsc 通过、1544 测试通过、投影/命中数值未变），
 * 但 47 行**中文注释**在 19:23:25 被 `pwsh Set-Content`（PS 5.1 默认 ANSI/CP936）
 * 写坏成 U+FFFD。损坏只落在注释与字符串说明里，没有落在代码行（已逐行核对：
 * 含 FFFD 的 47 行全部是 `//`、`*`、`/*` 开头的注释行）。
 *
 * 处置：保留可运行代码，注释待重写。要读原始注释请看 `game/dist/view/layout.js`
 * （19:12:06 的编译产物，tsc 保留注释，是可读的干净副本），
 * 或 `project/193_透视投影.md` / `project/198_透视边界与相机.md`。
 */

"""

# 若已有说明就不重复加
if 'R198 事故说明' not in s:
    # 插到第一段注释之前（文件以 /** 开头）
    s = NOTE + s

open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('note added; bytes', len(s.encode('utf-8')))
print('fffd remaining', s.count('\ufffd'))
