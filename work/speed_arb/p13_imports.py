# p13_imports.py -- 列 Sango2.exe 的导入表，重点找计时/限帧 API
import sys, pefile
EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
pe.parse_data_directories()
base = pe.OPTIONAL_HEADER.ImageBase
want = ('time', 'tick', 'sleep', 'query', 'performance', 'createtimer', 'settimer', 'gettick')
for d in pe.DIRECTORY_ENTRY_IMPORT:
    dll = d.dll.decode('latin1')
    rows = []
    for imp in d.imports:
        nm = (imp.name or b'').decode('latin1')
        if any(w in nm.lower() for w in want):
            rows.append('   %-28s IAT=0x%08X' % (nm, base + imp.address))
    if rows:
        print('== %s' % dll)
        print('\n'.join(rows))
print()
print('== 统计: 导入 DLL 数 =', len(pe.DIRECTORY_ENTRY_IMPORT))
