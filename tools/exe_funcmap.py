"""Build a coarse function map of Sango2.exe: prologue scan + string/import refs."""
import pefile, re, struct, os, sys, json

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE)
data = open(EXE, 'rb').read()
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
tsec = [s for s in SEC if s[4] == '.text'][0]
TVA, TVS, TPTR, TRS = TVA if False else tsec[0], tsec[1], tsec[2], tsec[3]
tb = data[TPTR:TPTR + TRS]
TEND = IB + TVA + len(tb)

iat = {}
for d in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in d.imports:
        if imp.name:
            iat[imp.address] = imp.name.decode() + '@' + d.dll.decode()


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def read_cstr(va, maxn=120):
    off = va2off(va)
    if off is None:
        return None
    end = data.find(b'\0', off, off + maxn)
    if end < 0:
        return None
    raw = data[off:end]
    if not (3 <= len(raw) <= maxn - 1):
        return None
    try:
        s = raw.decode('ascii')
    except UnicodeDecodeError:
        return None
    if sum(1 for c in s if 32 <= ord(c) < 127) != len(s):
        return None
    return s


# candidate function starts: 55 8B EC (push ebp; mov ebp,esp) or 6A xx 68 (push/push) MSVC, or 83 EC xx
cands = []
for m in re.finditer(rb'\x55\x8b\xec', tb):
    cands.append(IB + TVA + m.start())
for m in re.finditer(rb'\x6a\xff\x68', tb):
    cands.append(IB + TVA + m.start())
cands = sorted(set(cands))

funcs = []
for i, va in enumerate(cands):
    end = cands[i + 1] if i + 1 < len(cands) else TEND
    if end - va < 16 or end - va > 0x4000:
        continue
    funcs.append((va, end))

strs = []
for vaddr, vsize, ptr, rsize, nm in SEC:
    if nm == '.text':
        continue
    blk = data[ptr:ptr + rsize]
    for m in re.finditer(rb'[\x20-\x7e]{4,200}', blk):
        strs.append((IB + vaddr + m.start(), m.group().decode('latin1')))
smap = dict(strs)

rows = []
for va, end in funcs:
    o = va2off(va)
    e = va2off(end)
    body = data[o:e]
    ss = []
    imps = []
    for m in re.finditer(rb'\x68(....)', body, re.S):
        v = struct.unpack('<I', m.group(1))[0]
        if v in smap:
            ss.append(smap[v])
        elif v in iat:
            imps.append(iat[v])
    for m in re.finditer(rb'[\xb8-\xbf](....)', body, re.S):
        v = struct.unpack('<I', m.group(1))[0]
        if v in smap:
            ss.append(smap[v])
        elif v in iat:
            imps.append(iat[v])
    # FF 15 xx xx xx xx  call dword ptr [IAT]   /   FF 25 jmp
    for m in re.finditer(rb'\xff\x15(....)', body, re.S):
        v = struct.unpack('<I', m.group(1))[0]
        if v in iat:
            imps.append(iat[v])
    # 8B 0D / 8B 15 / 8B 1D / 8B 05 / A1  mov reg,[IAT]
    for m in re.finditer(rb'(?:\x8b[\x05\x0d\x15\x1d\x35\x3d]|\xa1)(....)', body, re.S):
        v = struct.unpack('<I', m.group(1))[0]
        if v in iat:
            imps.append(iat[v])
    rows.append((va, end - va, '|'.join(ss[:8]), '|'.join(sorted(set(imps))[:8])))

with open(r'F:\sanguo\work\funcmap.tsv', 'w', encoding='utf-8') as f:
    for va, size, ss, imps in rows:
        f.write('%08X\t%6d\t%s\t%s\n' % (va, size, ss.replace('\t', ' '), imps.replace('\t', ' ')))
print('funcs', len(rows))
big = sorted(rows, key=lambda r: -r[1])[:25]
for va, size, ss, imps in big:
    print('%08X %6d %s %s' % (va, size, ss[:80], imps[:60]))
