import pathlib, collections
rows = [l.split('\t') for l in pathlib.Path(r'F:\sanguo\work\prop_mismatch.tsv').read_text(encoding='utf-8').splitlines()]
bad, soft = [], []
heavy = ('长柄大刀', '双戟', '鉄鞭', '长戟', '长枪')
for simp, trad, a, oldp, newp in rows:
    if a == '谋士' and any(h in oldp for h in heavy):
        bad.append((simp, trad, a, oldp, newp))
    elif a == '猛将' and ('羽扇' in oldp or '竹简' in oldp or '令旗' in oldp):
        bad.append((simp, trad, a, oldp, newp))
    else:
        soft.append((simp, trad, a, oldp, newp))
print('severe', len(bad), 'soft', len(soft))
print('severe sample', bad[:6])
cnt = collections.Counter((r[2], r[3]) for r in rows)
print(cnt.most_common(6))
pathlib.Path(r'F:\sanguo\work\prop_severe.tsv').write_text('\n'.join('\t'.join(x) for x in bad), encoding='utf-8')
