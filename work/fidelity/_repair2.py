import io, re

src = r"F:\sanguo\work\fidelity\gen_expect.repair.mjs"
dst = r"F:\sanguo\work\fidelity\gen_expect.repair2.mjs"

text = io.open(src, encoding="utf-8").read()

# 1) `what: '……?,` 这类：字符串的收尾引号被吞掉，后面紧跟 `,`
text = re.sub(r"(what|note|src|text|name|why): '[^'\n]*\?,\s*", lambda m: f"{m.group(1)}: '见 project/192（R192 证据串损坏）', ", text)
# 2) 行尾 `?` 后面直接就是 `why:` / `}`
text = re.sub(r"(what|note|src|text|name|why): '[^'\n]*\?(?=\s*(?:why|note|src|text|name)\s*:)", lambda m: f"{m.group(1)}: '见 project/192（R192 证据串损坏）'", text)

io.open(dst, "w", encoding="utf-8", newline="\n").write(text)
print("written", dst, len(text))
