import pefile, re, struct, collections

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)
data = open(EXE, "rb").read()

def rva2off(rva):
    return pe.get_offset_from_rva(rva)

# collect ascii strings len>=5
out = []
i = 0
n = len(data)
while i < n:
    c = data[i]
    if 32 <= c < 127:
        j = i
        while j < n and 32 <= data[j] < 127:
            j += 1
        if j - i >= 5:
            out.append((i, data[i:j].decode()))
        i = j
    else:
        i += 1

print("ascii strings:", len(out))
pat = re.compile(r"(\.SHP|\.PAK|\.INI|TLHS|SHLT|SYSCALL|SCRIPT|THINGS|MAGIC|SANGO|COMBINE|SOUND|SHAPE|FACE|TROOP|FORCE|MAJOR|MENU|MAP\b)", re.I)
hits = [o for o in out if pat.search(o[1])]
print("interesting:", len(hits))
for off, s in hits[:200]:
    print("  %08X %s" % (off, s[:100]))
