import sys
sys.path.insert(0,r'F:\sanguo\tools')
from smartscript import SOFile
a=SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO.OLD')
b=SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
na={f['name'] for f in a.funcs}; nb={f['name'] for f in b.funcs}
print('OLD',len(a.funcs),'NEW',len(b.funcs))
print('added(%d):'%len(nb-na),sorted(nb-na))
print('removed(%d):'%len(na-nb),sorted(na-nb))
sa=set(a.names); sb=set(b.names)
print('literal strings: old',len(sa),'new',len(sb),'added',len(sb-sa),'gone',len(sa-sb))
