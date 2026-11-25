import json
m = json.load(open(r'F:\sanguo\data\magics.json', encoding='utf-8'))
withfx = [x for x in m if x.get('fx_dir')]
print('magics', len(m), 'with fx', len(withfx))
for x in m[:3]:
    print(x['SEQUENCE'], x['NAME'], 'MP', x.get('MP'), 'ATK', x.get('ATTACK'), 'SCRIPT', x.get('SCRIPT'),
          'fx', x.get('fx_dir'), 'frames', x.get('fx_frames'))
