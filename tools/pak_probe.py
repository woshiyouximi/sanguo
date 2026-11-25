import struct, sys, os

PAK = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.PAK"

with open(PAK, "rb") as f:
    data = f.read()

print("file size", len(data), hex(len(data)))
print("header:", data[:24].hex(" "))
magic = data[:4]
print("magic", magic)
ver = data[4:8]
print("ver", ver)
idx_off, count = struct.unpack_from("<II", data, 8)
print("idx_off", idx_off, hex(idx_off), "count", count, hex(count))
print("tail after index:", len(data) - idx_off)
print("index size / count =", (len(data)-idx_off)/count)

# dump region before index start
start = idx_off - 96
for i in range(start, idx_off+64, 16):
    chunk = data[i:i+16]
    hexs = " ".join(f"{b:02X}" for b in chunk)
    asc = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
    print(f"{i:09X}  {hexs}  {asc}")
