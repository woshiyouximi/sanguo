# -*- coding: utf-8 -*-
"""R224：修正『劇本表空字串 → 回落靜態 CITY/Status』造成跨劇本死人復活。

現象：189 劇本（scenIdx=1）劉備的平原名單裡出現張角。
原因：`張角.city_by_times[1] === ''`（這劇本他不在任何城），但 `cityOf`/`cityOfGeneral`
      寫成 `typeof v === 'string' && v ? v : row.CITY`，空字串被當「缺資料」→ 回落
      靜態 `CITY = '平原'`（184 年那份）⇒ 被當成平原在職武將播進名單。

正確語義：`city_by_times` 只要**有這一項**就以它為準（空 = 這劇本不在任何城）；
只有在陣列缺項（老資料 / scenIdx 越界）時才回落靜態欄位。
"""
import io

FILES = [
    (r'F:\sanguo\game\cocos\assets\scripts\CityModel.ts', 'cityOf', 'statusOf',
     'CityGeneral | null | undefined'),
    (r'F:\sanguo\game\cocos\assets\scripts\OfficersOfCity.ts', 'cityOfGeneral', 'statusOfGeneral', None),
]

for path, city_fn, status_fn, _ in FILES:
    s = io.open(path, encoding='utf-8').read()
    before = s

    # --- cityOf / cityOfGeneral ---
    i = s.find(f'export function {city_fn}(')
    if i < 0:
        print('MISS', path, city_fn)
        continue
    j = s.find('\n}\n', i) + 3
    old = s[i:j]
    sig = old.split('\n')[0]
    body = f'''{sig}
  const list = general?.city_by_times;
  // R224：有這一項就以它為準（空字串＝這劇本不在任何城），只有缺項才回落靜態 CITY。
  if (Array.isArray(list) && {0} < list.length) {{
    const v = list[{0}];
    return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  }}
  return String(general?.CITY || '').trim();
}}
'''
    body = body.replace('{0}', 'scenIdx')
    s = s[:i] + body + s[j:]

    # --- statusOf / statusOfGeneral ---
    i = s.find(f'export function {status_fn}(')
    if i < 0:
        print('MISS', path, status_fn)
        continue
    j = s.find('\n}\n', i) + 3
    old = s[i:j]
    sig = old.split('\n')[0]
    body = f'''{sig}
  const list = general?.status_by_times;
  if (Array.isArray(list) && scenIdx < list.length) {{
    const v = list[scenIdx];
    return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  }}
  return String(general?.Status || '').trim();
}}
'''
    s = s[:i] + body + s[j:]

    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('PATCHED', path, 'CHANGED', s != before)
