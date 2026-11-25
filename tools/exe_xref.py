"""在 Sango2.exe 里按文件偏移的字符串找到引用它的代码位置。"""
import pefile, struct, sys, re

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()


def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def find_str(s):
    b = s.encode('latin1') + b'\0'
    return [m.start() for m in re.finditer(re.escape(b), data)]


def refs(off):
    va = off2va(off)
    pat = struct.pack('<I', va)
    out = []
    for m in re.finditer(re.escape(pat), data):
        o = m.start()
        v = off2va(o)
        sec = [s[4] for s in SEC if s[2] <= o < s[2] + s[3]]
        out.append((o, v, sec[0] if sec else '?'))
    return va, out


if __name__ == '__main__':
    for s in sys.argv[1:]:
        offs = find_str(s)
        print('=== %r -> offs %s' % (s, [hex(x) for x in offs]))
        for o in offs:
            va, rs = refs(o)
            print('  strVA=%08X  refs=%s' % (va, [(hex(a), hex(b), c) for a, b, c in rs]))
