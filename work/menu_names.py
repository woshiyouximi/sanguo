import os
p = r'F:\sanguo\extract\pak\SHAPE\MENU'
names = sorted(os.listdir(p))
print(len(names))
for n in names:
    print(n, os.path.getsize(os.path.join(p, n)))
