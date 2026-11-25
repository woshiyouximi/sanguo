# Smart Script probe: find strings/xrefs in Sango2.exe and dump SO tail structures.
import pefile, struct, sys, os

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()

def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None

def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None

def find_str(s):
    out = []
    pos = 0
    b = s.encode('latin1')
    while True:
        pos = data.find(b, pos)
        if pos < 0: break
        out.append(pos)
        pos += 1
    return out

print("sections:")
for vaddr, vsize, ptr, rsize, nm in SEC:
    print("  %-8s VA %08X vsize %X raw %08X rsize %X" % (nm, IB+vaddr, vsize, ptr, rsize))

for s in ["Smart Script", "Can't open script", "Can't find Script file",
          "Allocate MagicDef", "-SOUNDOFF", "-SOUND", "SYSCALL", "MAGIC.SO", "SYSTEM.SO"]:
    print("string %r:" % s)
    for off in find_str(s):
        va = off2va(off)
        print("   file %08X  va %s" % (off, ("%08X" % va) if va else "?"))
        if va:
            # find push imm32 references
            packed = struct.pack('<I', va)
            refs = []
            p = 0
            while True:
                p = data.find(packed, p)
                if p < 0: break
                # check preceding byte is 0x68 (push imm32) and inside text
                if p >= 1 and data[p-1] == 0x68:
                    rva = off2va(p-1)
                    if rva: refs.append(rva-1)
                p += 1
            for r in refs[:20]:
                print("      push ref at %08X" % r)
