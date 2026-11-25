import subprocess, sys, os
PY = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
DIS = r"F:\sanguo\tools\sango_dis.py"
jobs = [
    ('magic_parser', 0x42F3C8, 420),
    ('times_loader', 0x43031D, 260),
    ('save_load', 0x43207C, 300),
    ('pak_init', 0x42FFC5, 110),
    ('things_loader', 0x441E61, 600),
    ('city_parser', 0x42C21E, 140),
]
for name, va, cnt in jobs:
    r = subprocess.run([PY, DIS, hex(va), str(cnt)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    out = r.stdout
    path = r'F:\sanguo\work\dis_%s.txt' % name
    with open(path, 'w', encoding='utf-8') as f:
        f.write(out)
    print(name, 'lines', len(out.splitlines()), r.stderr[:200])
