import pathlib
p = pathlib.Path(r'F:\sanguo\tools\art_ledger.py')
t = p.read_text(encoding='utf-8')
t = t.replace('''    (re.compile(r"^(ui|bg|fx|map)_(.+)$"), "scenes"),''',
'''    (re.compile(r"^(ui|bg|fx|map)_(.+)$"), "scenes"),
    (re.compile(r"^(loc|seq)_(.+)$"), "anim"),''')
old = '''            # run_batch 的多帧输出是 <id>_NN.png，归到同一个 id
            m = re.match(r"^(.+?)_(\\d{2,3})$", stem)
            frame = ""
            if m and not re.match(r"^(hero|troop|soldier|ui|bg|fx|map)_", stem[-(len(m.group(1)) + 3):]):
                stem, frame = m.group(1), m.group(2)'''
new = '''            # run_batch 的多帧输出是 <id>_NN.png（NN 从 01 开始），归到同一个 id
            frame = ""
            m = re.match(r"^(.+?)_(\\d{2,3})$", stem)
            if m:
                cand = m.group(1)
                if any(rx.match(cand) for rx, _ in PATTERNS):
                    stem, frame = cand, m.group(2)'''
assert old in t
t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('ledger: anim pattern + frame strip fixed')
