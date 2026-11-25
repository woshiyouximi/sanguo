import io
p = r"F:\sanguo\game\src\view\battleView.ts"
src = io.open(p, encoding="utf-8").read().split("\n")
blk = io.open(r"F:\sanguo\work\_port_block.ts", encoding="utf-8").read().rstrip("\n").split("\n")
assert src[571].startswith("function drawActors("), src[571][:40]
assert src[771].startswith("function resolveFxSlices("), src[771][:40]
out = src[:571] + blk + ["",] + src[771:]
io.open(p, "w", encoding="utf-8", newline="\n").write("\n".join(out))
print("lines", len(src), "->", len(out))
