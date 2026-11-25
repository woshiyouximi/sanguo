import os, re, glob, collections

root = r"F:\sanguo\extract\pak"
for name in ["CURSOR.SHP", "DEFAULT.SH", "NULSHAPE.S", "SHAPE\\RAIN001.SH", "SHAPE\\FONTS_FIRST"]:
    pass

def dump(path, n=256):
    with open(path, "rb") as f:
        b = f.read(n)
    print("==", path, os.path.getsize(path))
    for i in range(0, min(len(b), n), 16):
        chunk = b[i:i+16]
        print(f"{i:04X}  " + " ".join(f"{x:02X}" for x in chunk).ljust(47) + "  " +
              "".join(chr(x) if 32 <= x < 127 else "." for x in chunk))

for p in ["CURSOR.SHP", "DEFAULT.SH", "NULSHAPE.S", "SHAPE\\RAIN001.SH"]:
    dump(os.path.join(root, p))
print()
dump(os.path.join(root, "SHAPE\\FACE\\FACE001"), 128)
print()
dump(os.path.join(root, "SHAPE\\TROOP\\TROOP01"), 128)
print()
print("--- fonts listing ---")
for f in sorted(glob.glob(os.path.join(root, "SHAPE\\FONTS\\*")))[:12]:
    print(os.path.basename(f), os.path.getsize(f))
