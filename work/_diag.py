import io, sys
p = r"F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts"
raw = open(p, "rb").read()
print("bytes", len(raw), "bom", raw[:3] == b"\xef\xbb\xbf", "CRLF", raw.count(b"\r\n"), "LF", raw.count(b"\n"))
s = raw.decode("utf-8-sig")
print("chars", len(s), "FFFD", s.count("\ufffd"))
# 直方图：统计含 mojibake 特征字符的行
moji = [c for c in "锛鐨瀵煎叆鍚庢槸瀛愯祫浜鏄鐣欑┖鍒欎粠紩鐢ㄤ紶鍏ヤ簡浠嶅彲闇€瑕佹暟鎹"]
lines = s.split("\n")
bad = [i for i,l in enumerate(lines) if sum(l.count(c) for c in moji) >= 2]
print(" suspect lines:", len(bad), "of", len(lines))
print(" sample bad:", bad[:10])
# 尝试 GBK 反解
try:
    rec = s.encode("gbk").decode("utf-8")
    print(" roundtrip OK, first 80:", rec[:80])
except Exception as e:
    print(" roundtrip FAIL:", type(e).__name__, e)
