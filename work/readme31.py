import pathlib

p = pathlib.Path(r'F:\sanguo\project\README.md')
lines = p.read_text(encoding='utf-8').split('\n')
if any('31_还原清单' in l for l in lines):
    print('already')
else:
    idx = None
    for i, l in enumerate(lines):
        if l.startswith('| `2') or l.startswith('| `3'):
            idx = i
    assert idx is not None
    lines.insert(idx + 1, '| `31_还原清单.md` | **验收基线**：13 处取巧逐条在修、24 个系统状态、每轮必须跑的三件套 |')
    p.write_text('\n'.join(lines), encoding='utf-8')
    print('inserted at', idx + 1)
