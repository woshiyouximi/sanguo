from PIL import Image, ImageChops
import json,os
proto=r'F:\sanguo\work\cocos_art\_proto'
idx=json.load(open(os.path.join(proto,'index.json'),encoding='utf-8'))
print(json.dumps({k:(v if k!='pages' and k!='groups' else '...') for k,v in idx.items()},ensure_ascii=False)[:600])
p0=idx['pages'][0] if isinstance(idx.get('pages'),list) else None
print('pages type',type(idx.get('pages')), 'n',len(idx.get('pages') or []))
print(list(idx.keys()))
