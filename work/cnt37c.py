import pathlib
lines = pathlib.Path(r'F:\sanguo\project\37a_逻辑对照.md').read_text(encoding='utf-8').splitlines()
want = {'R4','R8','R22','R25','R28','R53','R54','R60','R61','R62'}
for l in lines:
    if not l.startswith('| R'): continue
    cells = [c.strip() for c in l.split('|')]
    if cells[1] in want:
        stat = next((c for c in cells if any(k in c for k in ('✅','🟡','❌','⚠️'))), '?')
        print(f'{cells[1]:5} {stat[:26]:28} {"已修" if "已修" in l else ""}')
