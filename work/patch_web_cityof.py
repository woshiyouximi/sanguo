# -*- coding: utf-8 -*-
"""R224：把 web `city_model.js` 的 cityOf/statusOf 也改成「空字串＝這劇本不在任何城」。

與 Cocos `CityModel.cityOf` / `OfficersOfCity.cityOfGeneral` 同語義：
`city_by_times` 有這一項就以它為準，只有缺項（老資料 / scenIdx 越界）才回落靜態欄位。
不改幾何/數值，只影響「這名將在這劇本屬於哪座城」。
"""
import io

P = r'F:\sanguo\game\web\city_model.js'
s = io.open(P, encoding='utf-8').read()
before = s

old_city = """export function cityOf(general, scenIdx = 0) {
  const list = general?.city_by_times;
  const v = Array.isArray(list) ? list[scenIdx] : '';
  return typeof v === 'string' && v ? v : String(general?.CITY || '');
}"""
new_city = """export function cityOf(general, scenIdx = 0) {
  const list = general?.city_by_times;
  // R224：有這一項就以它為準（空字串＝這劇本不在任何城），只有缺項才回落靜態 CITY。
  // 之前寫成「空字串當缺資料 → 回落 CITY」，189 劇本（張角 184 年才在平原）會被復活。
  if (Array.isArray(list) && scenIdx < list.length) {
    const v = list[scenIdx];
    return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  }
  return String(general?.CITY || '').trim();
}"""

old_status = """export function statusOf(general, scenIdx = 0) {
  const list = general?.status_by_times;
  const v = Array.isArray(list) ? list[scenIdx] : '';
  return typeof v === 'string' && v ? v : String(general?.Status || '');
}"""
new_status = """export function statusOf(general, scenIdx = 0) {
  const list = general?.status_by_times;
  if (Array.isArray(list) && scenIdx < list.length) {
    const v = list[scenIdx];
    return typeof v === 'string' ? v.trim() : String(v ?? '').trim();
  }
  return String(general?.Status || '').trim();
}"""

s = s.replace(old_city, new_city, 1).replace(old_status, new_status, 1)
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('CHANGED', s != before)
