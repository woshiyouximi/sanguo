import pathlib

p = pathlib.Path(r'F:\sanguo\project\README.md')
lines = p.read_text(encoding='utf-8').split('\n')
if any('25_与原作差距' in l for l in lines):
    print('already there')
else:
    idx = None
    for i, l in enumerate(lines):
        if l.startswith('| `23_'):
            idx = i
    if idx is None:
        # 兜底：插到 "## 专项文档" 段里最后一行的后面
        for i, l in enumerate(lines):
            if l.startswith('| `2') :
                idx = i
    assert idx is not None, 'no anchor row'
    lines.insert(idx + 1, '| `25_与原作差距对照.md` | 内容 vs 生效逐项对照、8 条流程不一致、还差 40–55 人日、建议顺序 |')
    p.write_text('\n'.join(lines), encoding='utf-8')
    print('inserted after line', idx + 1)
