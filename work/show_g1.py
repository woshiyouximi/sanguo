s = open(r'F:\sanguo\proto\ui\screens\g1.js', encoding='utf-8').read()
key = '\u5fc5\u6bba\u6280'   # 必殺技
i = s.find(key)
start = s.rfind('return', 0, i)
print(s[start: i + 900])
