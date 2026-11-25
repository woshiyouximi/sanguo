import pathlib, re, shutil
proj = pathlib.Path(r'F:\sanguo\project')
src = proj / '12_单位动作接入.md'
dst = proj / '16_单位动作接入.md'
if src.exists():
    shutil.move(str(src), str(dst))
    print('renamed ->', dst.name)
# 全仓引用修正（只改 md 里的文件名）
for p in list(proj.glob('*.md')) + [pathlib.Path(r'F:\sanguo\README.md')]:
    t = p.read_text(encoding='utf-8')
    n = t.replace('12_单位动作接入.md', '16_单位动作接入.md')
    if n != t:
        p.write_text(n, encoding='utf-8'); print('ref fixed', p.name)
