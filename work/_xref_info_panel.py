"""xrefs for the general-info-panel strings 0x48B53C (戰績 %d勝 %d敗), 0x48B580 (疲勞度 %d), 0x48B5A4 (士氣 %d),
and dump the reading instructions around each ref."""
import pefile, capstone, struct, re
EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False); data = open(EXE, "rb").read(); IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData, s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize): return ptr + (rva - vaddr)
text = [s for s in SEC if s[4] == '.text'][0]
tstart, tend, tva = text[2], text[2] + text[3], IB + text[0]
tb = data[tstart:tend]
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32); md.detail = True
def read_cstr(va, maxn=120):
    off = va2off(va); end = data.find(b"\0", off, off + maxn)
    raw = data[off:end]
    for enc in ("cp950", "ascii"):
        try: return raw.decode(enc)
        except UnicodeDecodeError: pass
    return None
def refs(t):
    out = []
    for m in re.finditer(re.escape(struct.pack("<I", t)), tb):
        o = m.start()
        for k in range(1, 16):
            st = o - k
            if st < 0: continue
            il = list(md.disasm(tb[st:st + 16], tva + st))
            if not il: continue
            ins = il[0]
            if ins.address <= tva + o and tva + o + 4 <= ins.address + ins.size:
                if any(op.type == capstone.x86.X86_OP_IMM and op.imm == t for op in ins.operands):
                    out.append(ins.address)
                break
    return out
for t in (0x48B53C, 0x48B580, 0x48B5A4, 0x48B574):
    hs = refs(t)
    print("%08X %-24r -> %s" % (t, read_cstr(t), ",".join("%X" % h for h in hs)))
    for h in hs:
        off = va2off(h - 0x50)
        print("   ---- around %X ----" % h)
        cnt = 0
        for ins in md.disasm(data[off:off + 0x60], h - 0x50):
            print("   %08X  %-7s %s" % (ins.address, ins.mnemonic, ins.op_str))
            cnt += 1
            if cnt > 14: break
