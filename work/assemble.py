import io, os

W = r'F:\sanguo\work'
def rd(n):
    return open(os.path.join(W, n), encoding='utf-8').read()

head  = rd('doc_head.md')
tab08 = rd('form_tables_a0_8.md')
s6    = rd('doc_s6.md').replace('{{ROWS}}', rd('form_rows_0_32.md').rstrip('\n'))
tab910= rd('form_tables_a9_10.md')
tail  = rd('doc_s8_s9.md')
tail  = tail.replace('{{CMP}}', rd('form_ex_compare.txt').rstrip('\n'))
tail  = tail.replace('{{SOLD}}', rd('form_ex_soldiers.txt').rstrip('\n'))

def join(*parts):
    out = []
    for p in parts:
        p = p.strip('\n')
        if p:
            out.append(p)
    return '\n\n'.join(out) + '\n'

doc = join(head, tab08, s6, tab910, tail)
dst = r'F:\sanguo\docs\04b1_阵形站位表.md'
open(dst, 'w', encoding='utf-8', newline='\n').write(doc)

lines = doc.count('\n')
print('bytes', len(doc.encode('utf-8')))
print('lines', lines)
print('placeholders left', doc.count('{{'))
for k in ['## 0.', '## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '附录 A', '附录 B']:
    print(k, '->', doc.count(k))
