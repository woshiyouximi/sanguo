import io, re
P = r"F:\sanguo\project\02_战斗重构设计.md"
lines = io.open(P, encoding="utf-8").read().split("\n")
secs = [i for i,l in enumerate(lines) if re.match(r"^## \d", l)]
secs.append(len(lines))
print(f"{'sec':<28}{'tot':>5}{'code':>6}{'tbl':>6}{'blt':>6}{'blank':>7}{'prose':>7}")
for k in range(len(secs)-1):
    a, b = secs[k], secs[k+1]
    code = tbl = blt = blank = prose = 0
    infence = False
    for l in lines[a:b]:
        st = l.strip()
        if st.startswith("```"):
            infence = not infence; code += 1; continue
        if infence: code += 1
        elif not st: blank += 1
        elif st.startswith("|"): tbl += 1
        elif st.startswith(("- ", "1. ", "2. ", "3. ", "4. ", "5. ", "6. ", "> ")): blt += 1
        else: prose += 1
    print(f"{lines[a][:26]:<28}{b-a:>5}{code:>6}{tbl:>6}{blt:>6}{blank:>7}{prose:>7}")
