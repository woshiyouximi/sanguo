import pefile
EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
pe = pefile.PE(EXE, fast_load=True)
pe.parse_data_directories()
print('ImageBase=0x%X' % pe.OPTIONAL_HEADER.ImageBase)
print('SizeOfImage=0x%X' % pe.OPTIONAL_HEADER.SizeOfImage)
for s in pe.sections:
    print('  %-8s VA=0x%06X vsz=0x%06X ptr=0x%06X rsz=0x%06X' %
          (s.Name.rstrip(b'\x00').decode('latin1'), s.VirtualAddress, s.Misc_VirtualSize,
           s.PointerToRawData, s.SizeOfRawData))
for d in pe.DIRECTORY_ENTRY_IMPORT:
    print(d.dll.decode('latin1'), 'FirstThunk RVA=0x%X' % d.struct.FirstThunk,
          'name RVA=0x%X' % d.struct.Name)
    for imp in d.imports:
        nm = (imp.name or b'').decode('latin1')
        if any(w in nm.lower() for w in ('time', 'tick', 'sleep')):
            print('     %-24s address=0x%X' % (nm, imp.address))
