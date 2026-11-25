import sys, time, json
sys.path.insert(0, r'F:\sanguo\work')
import compshare as cs
t0 = time.time()
while time.time() - t0 < 420:
    h = cs.instances()[0]
    mp = h.get('MigrationProgress') or {}
    print('[%4.0fs] %s  %s%%  eta=%ss' % (time.time()-t0, h.get('State'), mp.get('Percent'), mp.get('Eta')), flush=True)
    if h.get('State') == 'Running':
        print('RUNNING'); break
    time.sleep(15)
h = cs.instances()[0]
print(json.dumps({k: h.get(k) for k in ('State','IngressHost','IPSet','Ports')}, ensure_ascii=False, indent=1))
