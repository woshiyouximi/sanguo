import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\deploy.html')
t = p.read_text(encoding='utf-8')

# 出发点：?from= 优先（行军/出征带的出发城），否则存档第一座我方城，最后才退回目标城
t = t.replace("""const target = qs.get('city') || '南皮';""",
"""const target = qs.get('city') || '南皮';""", 1)

t = t.replace("""// 主將候選 = 本城武將：該劇本的 city_by_times 指向本城、且 status_by_times 不是「未」；太守排第一。
// TODO 另一個 agent 的 core/garrison.ts（officersOf / pickCommander）落地後改調它。
function officersOf(name) {
  const major = city.NAME === name ? (city.MAJOR || '') : '';""",
"""// 主將候選 = **出發城**的武將（不是目標城）：該劇本 city_by_times 指向出發城、status 不是「未」，太守排第一。
// 出發城來源：?from=<城名>（行军/出征会带）→ 存档 owned[0] → 目标城（兜底）。
const HOME = qs.get('from') || (save.owned && save.owned[0]) || target;
const homeCity = (scenario.cities || []).find((c) => c.NAME === HOME) || { NAME: HOME };
function officersOf(name) {
  const major = homeCity.NAME === name ? (homeCity.MAJOR || (city.NAME === name ? city.MAJOR : '') || '') : '';""", 1)

t = t.replace("""let borrowed = false;
let pool = officersOf(city.NAME);""",
"""let borrowed = false;
let pool = officersOf(HOME);""", 1)
p.write_text(t, encoding='utf-8')
print('HOME wired')

# campaign：行军抵达时把 from 带上
p2 = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
c = p2.read_text(encoding='utf-8')
import re
before = c.count('deploy.html?city=')
c = c.replace("'./deploy.html?city=' + encodeURIComponent(selected)",
              "'./deploy.html?city=' + encodeURIComponent(selected) + '&from=' + encodeURIComponent(HOME_FOR_DEPLOY())")
p2.write_text(c, encoding='utf-8')
print('campaign deploy urls:', before)
