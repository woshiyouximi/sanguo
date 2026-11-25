# -*- coding: utf-8 -*-
"""Final accounting: 99 WAV -> provenance; durations; sizes."""
import io, os, re, sys, wave, json, collections
sys.path.insert(0, r'F:\sanguo\tools')
sys.path.insert(0, r'F:\sanguo\work')

SOUND = r'F:\sanguo\extract\pak\SOUND'

# reverse map copied from a_so_sfx2 output
MAGIC = {
 'att07': 'DemonDancing/Duplicator', 'hit01': 'Hurt/SmallFireBall*', 'yell01': 'DemonDancing',
 'm000snd01': 'NoMoreSoldierCallback', 'm001snd01': 'HalfMoon', 'm002snd01': 'MoreSoldier',
 'm002snd03': 'MoreSoldier', 'm003snd01': 'ShootObject', 'm003snd02': 'ShootObject',
 'm003snd03': 'ShootObject', 'm005snd01': 'BigThunder', 'm007snd02': 'FireStoneExplode',
 'm007snd03': 'StoneExplode', 'm008snd01': 'ExplodeRound', 'm009snd01': 'EightWayFire',
 'm011snd01': 'Tornado', 'm012snd01': 'Duplicator', 'm013snd01': 'Frozen',
 'm015snd01': 'FlyingSword', 'm015snd02': 'SwordBomb', 'm015snd03': 'FlyingSword',
 'm016snd01': 'Heal', 'm017snd01': 'sc4501', 'm017snd02': 'FireDragon',
 'm018snd01': 'CallDragon', 'm018snd02': 'CallDragon', 'm018snd03': 'sc3604',
 'm019snd01': 'RunningBow', 'm020snd01': 'BlackHole', 'm020snd02': 'BlackHole',
 'm021snd01': 'FireRing', 'm022snd01': 'Ice', 'm023snd01': 'CreateOnFire',
 'm023snd02': 'CreateOnFire', 'm025snd01': 'CreateTaichi', 'm026snd01': 'CreateSpoutAround',
 'm027snd01': 'FireCow', 'm027snd02': 'FireCow', 'm028snd01': 'RollDown',
 'm029snd01': 'CreatePa', 'm029snd02': 'CreateBigPaBomb', 'm029snd03': 'CreatePa',
 'm031snd01': 'CreateFirePillar', 'm031snd02': 'CreateFirePillar', 'm031snd03': 'CreateFirePillarSource',
 'm032snd01': 'CreateSparkle', 'm032snd02': 'CreateSparkle', 'm034snd01': 'CreatePowderBreak',
 'm035snd01': 'Spear', 'm036snd01': 'Slash', 'm036snd02': 'CreateSlash',
 'm037snd01': 'Wall', 'm038snd01': 'CreateTwisterSword', 'm038snd02': 'TwisterSword',
 'm039snd01': 'RollTub', 'm040snd01': 'QuakeSound', 'm041snd01': 'MakeInterceptorSound',
 'm041snd02': 'Interceptor',
}
SYSTEM = {
 'bg03a': 'LoadingBattleMap', 'bg04a': 'LoadingBattleMap', 'bg08a': 'LoadingBattleMap',
 'bg09a': 'LoadingBattleMap', 'failure2': 'SearchTalk', 'horse02': 'MajorDeath',
 'rush01': 'AllRush', 'success': 'ChildGenTalkNew/SearchTalk/YieldGeneral',
 'victory': 'MajorDeath', 'yell03': 'MajorDeath',
}
THINGS = {
 'defense': ('OBJECT.Defense', 120), 'hit01': ('OBJECT.Pain', 120), 'horse01': ('OBJECT.Walk', 8),
 'm004snd01': ('OBJECT.Wait', 2), 'm005snd02': ('OBJECT.Wait', 4), 'm005snd03': ('OBJECT.Wait', 1),
 'm005snd04': ('OBJECT.Wait', 1), 'm005snd05': ('OBJECT.Wait', 1), 'm007snd01': ('OBJECT.Wait', 2),
 'm010snd01': ('OBJECT.Wait', 2), 'm033snd01': ('OBJECT.Wait', 1), 'm033snd02': ('OBJECT.Wait', 1),
}
EXE = {'hit01': '0x43E07C battle melee hit'}
HOT = {'hit01', 'm005snd01', 'victory', 'success', 'failure2', 'accept'}  # wired in web

rows = []
for fn in sorted(os.listdir(SOUND)):
    if not fn.lower().endswith('.wav'):
        continue
    base = os.path.splitext(fn)[0].lower()
    p = os.path.join(SOUND, fn)
    size = os.path.getsize(p)
    dur = sr = ch = 0
    try:
        w = wave.open(p, 'rb')
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        dur = n / float(sr or 1)
        w.close()
    except Exception as e:
        pass
    src = []
    if base in MAGIC:
        src.append('MAGIC.SO:' + MAGIC[base])
    if base in SYSTEM:
        src.append('SYSTEM.SO:' + SYSTEM[base])
    if base in THINGS:
        src.append('THINGS.INI:%s x%d' % THINGS[base])
    if base in EXE:
        src.append('EXE:' + EXE[base])
    rows.append((base, size, round(dur, 2), sr, ch, '; '.join(src) or 'UNKNOWN', base in HOT))

print('name\tsize\tdur\tsr\tch\tprovenance\twired')
for r in rows:
    print('\t'.join(str(x) for x in r))
tot = sum(r[1] for r in rows)
print('# files=%d bytes=%d dur=%.1fs unknown=%d wired=%d' % (
    len(rows), tot, sum(r[2] for r in rows),
    sum(1 for r in rows if r[5] == 'UNKNOWN'), sum(1 for r in rows if r[6])))
