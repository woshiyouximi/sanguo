p=r'F:\sanguo\tools\smartscript.py'
s=open(p,encoding='utf-8').read()
s=s.replace("return ('arg%d' % (-idx)) if idx < 0 else ('loc%d' % idx)","return ('arg%d' % (-idx - 1)) if idx < 0 else ('loc%d' % idx)")
open(p,'w',encoding='utf-8').write(s)
print('ok')
