import json, collections
d = json.load(open(r'F:\sanguo\extract\json\things.json', encoding='utf-8'))
print('counts:', json.dumps(d['counts'], ensure_ascii=False)[:500])
print('system:', json.dumps(d['system'], ensure_ascii=False)[:600])
print('define keys:', list(d['define'])[:20] if isinstance(d['define'], dict) else str(d['define'])[:300])
objs = d['sections'] if isinstance(d['sections'], list) else None
print('sections type', type(d['sections']).__name__, len(d['sections']))
s0 = d['sections'][0] if isinstance(d['sections'], list) else list(d['sections'].items())[0]
print('section0:', json.dumps(s0, ensure_ascii=False)[:800])
