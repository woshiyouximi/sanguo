import os, re, collections
d = r'F:\sanguo\extract\pak\SHAPE\MAJOR\BODY'
pat = re.compile(r'^([LR])([0-9A-E])([ADFHLRSW])([1-4])(\d{4})\.SHP$')
groups = collections.Counter()
bad = []
for f in os.listdir(d):
    m = pat.match(f)
    if not m: bad.append(f); continue
    groups[(m.group(1), m.group(2), m.group(3), m.group(4))] += 1
print('files', len(os.listdir(d)), 'matched groups', len(groups), 'unmatched', len(bad))
print('unmatched sample', bad[:5])
# frames per (camp,body,action,weapon)
bodies = sorted({k[1] for k in groups})
acts = sorted({k[2] for k in groups})
print('bodies', ''.join(bodies), 'actions', ''.join(acts))
# count per action for body 0 weapon 1
for a in acts:
    print('L0%s1 frames' % a, groups.get(('L','0',a,'1'),0))
print('total frames body0 both camps both weapons:',
      sum(v for k,v in groups.items() if k[1]=='0'))
