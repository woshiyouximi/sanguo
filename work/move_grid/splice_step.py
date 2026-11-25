import io, sys

path = r"F:\sanguo\game\src\core\battle.ts"
block_path = r"F:\sanguo\work\move_grid\_new_step_block.ts.txt"

with io.open(path, "r", encoding="utf-8-sig", newline="") as f:
    text = f.read()
with io.open(block_path, "r", encoding="utf-8", newline="") as f:
    block = f.read()

start_marker = "function nearestEnemy(world: World, u: Unit): Unit | null {"
end_marker = "function recompute(world: World): void {"

i = text.index(start_marker)
j = text.index(end_marker)
assert i < j, (i, j)
new_text = text[:i] + block.rstrip("\n") + "\n\n" + text[j:]

with io.open(path, "w", encoding="utf-8-sig", newline="") as f:
    f.write(new_text)
print("ok", len(text), "->", len(new_text))
