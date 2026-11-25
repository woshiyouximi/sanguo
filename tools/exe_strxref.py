"""Dump ASCII strings from Sango2.exe with VA, section, and code xrefs."""
import pefile, re, struct, os, sys, json

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE)
data = open(EXE, 'rb').read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
text = [s for s in SEC if s[4] == '.text'][0]
tstart, tend = text[2], text[2] + text[3]


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


strs = []
for vaddr, vsize, ptr, rsize, nm in SEC:
    if nm in ('.text',):
        continue
    blk = data[ptr:ptr + rsize]
    for m in re.finditer(rb'[\x20-\x7e]{4,200}', blk):
        va = IB + vaddr + m.start()
        strs.append((va, nm, m.group().decode('latin1')))

# code xrefs: scan .text for push imm32 / mov reg,imm32 pointing into string range
tb = data[tstart:tend]
xref = {}
for m in re.finditer(rb'\x68(....)', tb, re.S):
    v = struct.unpack('<I', m.group(1))[0]
    xref.setdefault(v, []).append(IB + text[0] + m.start())
for m in re.finditer(rb'[\xb8-\xbf](....)', tb, re.S):
    v = struct.unpack('<I', m.group(1))[0]
    xref.setdefault(v, []).append(IB + text[0] + m.start())

out = []
for va, sec, s in strs:
    xr = xref.get(va, [])
    out.append((va, sec, s, xr))

with open(r'F:\sanguo\work\strings_xref.tsv', 'w', encoding='utf-8') as f:
    for va, sec, s, xr in out:
        f.write('%08X\t%s\t%s\t%d\t%s\n' % (va, sec, s.replace('\t', ' '), len(xr),
                                            ','.join('%X' % x for x in xr[:6])))
print('strings', len(out), 'with xref', sum(1 for x in out if x[3]))
# summary of path-like strings
paths = [x for x in out if '\\' in x[2] or '/' in x[2]]
print('path-like', len(paths))
with open(r'F:\sanguo\work\string_paths.txt', 'w', encoding='utf-8') as f:
    for va, sec, s, xr in sorted(paths, key=lambda t: t[2]):
        f.write('%08X\t%-3s\t%s\n' % (va, sec, s))
