"""Export MAGIC.SO bytecode + symbol table into game/data for the TS VM.

Reuses tools/smartscript.py parsing (do not re-reverse-engineer the layout).
Outputs:
  game/data/magic_so.bin            raw bytes (verbatim copy of MAGIC.SO)
  game/data/magic_so.symbols.json   functions/strings/code range/globals + stats
"""
import json
import os
import shutil
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import smartscript as ss  # noqa: E402

SRC = os.path.join(ROOT, 'extract', 'pak', 'SCRIPT', 'MAGIC.SO')
OUT_BIN = os.path.join(ROOT, 'game', 'data', 'magic_so.bin')
OUT_SYM = os.path.join(ROOT, 'game', 'data', 'magic_so.symbols.json')

so = ss.SOFile(SRC)
lines, stats, unknown, total = ss.disassemble(so)
if unknown:
    raise SystemExit('unknown opcodes: %r' % (unknown,))

# operand width per kind (number of u32 words)
WIDTH = {'': 0, 'I': 1, 'O': 1, 'S': 1, 'X': 1, 'YF': 2, 'CO': 2}

op_hist = Counter()
sys_hist = Counter()
sys_sig = {}
n_instr = 0
off = so.code_start
data = so.data
while off < so.code_end:
    op = int.from_bytes(data[off:off + 4], 'little')
    name, kinds, _delta = ss.OPS[op]
    words = 1 + WIDTH[kinds]
    op_hist[op] += 1
    n_instr += 1
    if op == 0x05:
        sid = int.from_bytes(data[off + 4:off + 8], 'little')
        flags = int.from_bytes(data[off + 8:off + 12], 'little')
        sys_hist[sid] += 1
        sys_sig[sid] = {'argc': flags & 0xFFFF, 'ret': flags >> 16}
    off += 4 * words
if off != so.code_end:
    raise SystemExit('instruction walk ended at %#x, code_end %#x' % (off, so.code_end))

funcs = []
for f in so.funcs:
    funcs.append({
        'idx': f['idx'],
        'name': f['name'],
        'num': f['num'],
        'off': f['off'],
        'argc': f['argc'],
    })

strings = []
for o in so.strtab:
    e = data.find(b'\x00', o)
    strings.append(data[o:e].decode('cp950', 'replace'))

syms = {
    'format': 'smartscript-symbols-v1',
    'source': 'extract/pak/SCRIPT/MAGIC.SO',
    'bytes': len(data),
    'version': so.ver,
    'codeStart': so.code_start,
    'codeEnd': so.code_end,
    'strOff': so.str_off,
    'marker': so.marker,
    'globalSlots': so.marker,
    'functionCount': len(funcs),
    'stringCount': len(strings),
    'instructionCount': n_instr,
    'functions': funcs,
    'strings': strings,
    'opcodeHistogram': {('%02X' % k): v for k, v in sorted(op_hist.items())},
    'syscallHistogram': {str(k): v for k, v in sorted(sys_hist.items())},
    'syscallSignatures': {str(k): v for k, v in sorted(sys_sig.items())},
}

os.makedirs(os.path.dirname(OUT_BIN), exist_ok=True)
shutil.copyfile(SRC, OUT_BIN)
with open(OUT_SYM, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(syms, fh, ensure_ascii=False, indent=1)
    fh.write('\n')

print('wrote %s (%d B)' % (OUT_BIN, os.path.getsize(OUT_BIN)))
print('wrote %s (%d B)' % (OUT_SYM, os.path.getsize(OUT_SYM)))
print('code %#x..%#x  funcs=%d strings=%d instr=%d' % (
    so.code_start, so.code_end, len(funcs), len(strings), n_instr))
print('opcodes used: %d/90  syscalls used: %d' % (len(op_hist), len(sys_hist)))
print('top syscalls:', ', '.join('0x%X x%d' % (k, v) for k, v in sys_hist.most_common(12)))
