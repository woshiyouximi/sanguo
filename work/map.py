import io
p=r'F:\sanguo\project\02_战斗重构设计.md'
L=io.open(p,encoding='utf-8').read().split('\n')
for i,l in enumerate(L):
    if l.startswith('## ') or l.startswith('### '):
        print(i+1, l[:46])
