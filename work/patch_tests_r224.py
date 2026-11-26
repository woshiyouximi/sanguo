# -*- coding: utf-8 -*-
"""R224：把 6 条把『張角在劇本1平原』当正确行为的断言改成修正后的期望。

新语义：`city_by_times[1]` 为空 = 该剧本里张角不在任何城 ⇒ 不进平原名单。
"""
import io

A = r'F:\sanguo\game\tests\cocos_affairs.test.ts'
B = r'F:\sanguo\game\tests\panels_roster_source.test.ts'

a = io.open(A, encoding='utf-8').read()
a0 = a
a = a.replace(
    " *   P0-2 scenIdx 不再恆 0：《討伐董卓》(scenIdx=1) 平原 = 關羽、劉備、張角、張飛、簡雍",
    " *   P0-2 scenIdx 不再恆 0：《討伐董卓》(scenIdx=1) 平原 = 關羽、劉備、張飛、簡雍（不含張角，R224）",
)
a = a.replace(
    "test('P0-2 scenIdx=1（討伐董卓）平原 = 關羽、劉備、張角、張飛、簡雍；scenIdx=0 不是', () => {",
    "test('P0-2 scenIdx=1（討伐董卓）平原 = 關羽、劉備、張飛、簡雍；scenIdx=0 不是', () => {",
)
a = a.replace(
    "  for (const want of ['關羽', '劉備', '張角', '張飛', '簡雍']) {",
    "  for (const want of ['關羽', '劉備', '張飛', '簡雍']) {",
)
a = a.replace(
    "  for (const reject of ['廖化', '裴元紹']) {",
    "  // R224：張角 city_by_times[1] 留空＝189 劇本他不在任何城，不能再靠靜態 CITY 復活\n"
    "  for (const reject of ['廖化', '裴元紹', '張角']) {",
)
io.open(A, 'w', encoding='utf-8', newline='\n').write(a)
print('A changed', a != a0)

b = io.open(B, encoding='utf-8').read()
b0 = b
b = b.replace(
    " *    ＋因 `city_by_times[1]` 留空而按 `cityOf()` 口徑回退靜態 `CITY` 的張角），",
    " *    ＋（R224 起不再包含）因 `city_by_times[1]` 留空而按 `cityOf()` 回退靜態 `CITY` 的張角），",
)
b = b.replace(
    "  const domestic = nameSet(M.rosterOf(save, PLANE, { generals: GENS, scenIdx: SCEN_SANGUO }));\n"
    "  assert.equal(domestic.length, 5, `劇本1平原常駐將應 5 人，實際 ${JSON.stringify(domestic)}`);\n"
    "  assert.ok(domestic.includes('張角'), '口徑對拍：city_by_times[1] 空 → cityOf() 回退靜態 CITY=平原（既有 P0-2 行為）');",
    "  const domestic = nameSet(M.rosterOf(save, PLANE, { generals: GENS, scenIdx: SCEN_SANGUO }));\n"
    "  assert.equal(domestic.length, 4, `劇本1平原常駐將應 4 人，實際 ${JSON.stringify(domestic)}`);\n"
    "  // R224：city_by_times[1] 空 = 189 劇本張角不在任何城，不再回退靜態 CITY 把他塞回平原\n"
    "  assert.ok(!domestic.includes('張角'), `張角不該在劇本1平原：${JSON.stringify(domestic)}`);",
)
b = b.replace(
    "  assert.deepEqual(planeNames, sorted(['關羽', '劉備', '張角', '張飛', '簡雍']));",
    "  assert.deepEqual(planeNames, sorted(['關羽', '劉備', '張飛', '簡雍']));\n"
    "  assert.ok(!planeNames.includes('張角'), '張角不該在劇本1平原名冊');",
)
b = b.replace(
    "  // 這條是資料口徑不是 bug：`city_by_times[1]` 留空 → cityOf() 回退靜態 CITY（既有 P0-2 行為）\n"
    "  assert.equal(M.cityOf(GENS.find((g) => g.NAME === '張角'), SCEN_SANGUO), PLANE);",
    "  // R224：`city_by_times[1]` 留空 = 這劇本不在任何城（舊碼回退靜態 CITY=平原，是 189 劇本復活死人的根因）\n"
    "  assert.equal(M.cityOf(GENS.find((g) => g.NAME === '張角'), SCEN_SANGUO), '');",
)
b = b.replace(
    "  assert.deepEqual(sorted(save.roster[PLANE]), sorted(['關羽', '劉備', '張角', '張飛', '簡雍']));\n"
    "  assert.equal(save.cities[PLANE].officers.length, 5);",
    "  assert.deepEqual(sorted(save.roster[PLANE]), sorted(['關羽', '劉備', '張飛', '簡雍']));\n"
    "  assert.equal(save.cities[PLANE].officers.length, 4);",
)
b = b.replace(
    "  const asScen0 = O.officerNamesOfCity(save, PLANE, { ...ctx, scenIdx: 0 });\n"
    "  assert.deepEqual(sorted(asScen0), sorted(['關羽', '劉備', '張角', '張飛', '簡雍']));",
    "  const asScen0 = O.officerNamesOfCity(save, PLANE, { ...ctx, scenIdx: 0 });\n"
    "  assert.deepEqual(sorted(asScen0), sorted(['關羽', '劉備', '張飛', '簡雍']));",
)
b = b.replace(
    "    sorted(['關羽', '劉備', '張角', '張飛', '簡雍']),\n  );\n});",
    "    sorted(['關羽', '劉備', '張飛', '簡雍']),\n  );\n});",
)
b = b.replace(
    "  const scen1 = O.officerNamesOfCity(legacy, PLANE, ctxOf(SCEN_SANGUO, '劉備'));\n"
    "  assert.deepEqual(sorted(scen1), sorted(['關羽', '劉備', '張角', '張飛', '簡雍']));",
    "  const scen1 = O.officerNamesOfCity(legacy, PLANE, ctxOf(SCEN_SANGUO, '劉備'));\n"
    "  assert.deepEqual(sorted(scen1), sorted(['關羽', '劉備', '張飛', '簡雍']));",
)
io.open(B, 'w', encoding='utf-8', newline='\n').write(b)
print('B changed', b != b0)
