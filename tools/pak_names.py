import struct

PAK = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.PAK"
data = open(PAK, "rb").read()
idx_off, count = struct.unpack_from("<II", data, 8)
region = data[idx_off:]

for i in (0, 1, 2, 100, 400, 5000, 9000, 11109):
    pos = i * 64
    size, off = struct.unpack_from("<II", region, pos)
    nm = region[pos + 24: pos + 64]
    nm = nm.split(b"\0")[0]
    print(i, size, off, repr(nm))
