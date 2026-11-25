# -*- coding: utf-8 -*-
"""R84：把 v3 改动打进 game/web/saves.js（原子：全部锚点命中才写盘）。

不用 edit 工具的原因：saves.js 里有模板字符串 `${...}`，工具层会把它当插值，
导致 old_string 对不上。这里按「精确串 + 计数断言」打补丁，失败即报错不写盘。
"""
import io
import re
import sys

PATH = r'F:\sanguo\game\web\saves.js'
src = io.open(PATH, encoding='utf-8', newline='').read()
NL = '\r\n' if '\r\n' in src else '\n'
fails = []


def rep(name, old, new, count=1):
    global src
    old = old.replace('\n', NL)
    new = new.replace('\n', NL)
    n = src.count(old)
    if n != count:
        fails.append((name, 'hit=%d expected=%d' % (n, count)))
        return
    src = src.replace(old, new, count)


# ---------------------------------------------------------------- 1. steps 逐跳
STEPS_NEW = '''  if (from < SNAPSHOT_VERSION) {
    // 逐跳记：老档 → ['v0→v2', 'v2→v3']；v2 档 → ['v2→v3']
    for (const hop of SNAPSHOT_STEPS) {
      if (hop.to > from && hop.to <= SNAPSHOT_VERSION) out.steps.push('v' + hop.from + '→' + hop.to);
    }
  }'''
m = re.search(r'^  if \(from < SNAPSHOT_VERSION\) out\.steps\.push\(.*$', src, re.M)
if not m:
    fails.append(('steps', 'regex miss'))
else:
    src = src[:m.start()] + STEPS_NEW.replace('\n', NL) + src[m.end():]

# ---------------------------------------------------------------- 2. strMapAt 辅助
rep('helper:strMapAt', '''  intAt('scenario', 1, 1);''', '''  // 字符串映射（v3 的 generalStatus / weapon / horse / thing）：非字符串值丢弃，空串不存
  const strMapAt = (key) => {
    const cur = s[key];
    const out = {};
    if (obj(cur)) {
      for (const [k, v] of Object.entries(cur)) {
        if (typeof v !== 'string') continue;
        const t = v.trim();
        if (t) out[k] = t;
      }
    } else push(key);
    s[key] = out;
    return out;
  };

  intAt('scenario', 1, 1);''')

# ---------------------------------------------------------------- 3. v3 必填字段补齐
rep('shape:v3-fields', '''  objAt('morale');
  if (!obj(s.drift)) {''', '''  objAt('morale');
  // ---- v3（R84）：时间 / 年度账本 / 武将档案 ---------------------------------
  // year 的真源仍是 month（yearOf）；老档里被写歪就按 month 重算——这是唯一允许"改已有值"的键。
  {
    const y = yearOf(s.month);
    if (Number(s.year) !== y) { s.year = y; push('year'); }
  }
  {
    const f = Number(s.yearFlag);
    if (f !== 0 && f !== 1) { s.yearFlag = f ? 1 : 0; push('yearFlag'); }
  }
  // ledger 只补缺、**不做跨年重建**：迁移时重建会把还没结算的 12 个月账吃掉（那是 ledgerOf 的活）
  if (!obj(s.ledger)) {
    s.ledger = { year: yearOf(s.month), months: 0, income: 0, salary: 0 };
    push('ledger');
  } else {
    const led = s.ledger;
    const ly = Number(led.year);
    if (!Number.isFinite(ly) || ly < 1) { led.year = yearOf(s.month); push('ledger'); }
    else if (ly !== Math.trunc(ly)) { led.year = Math.trunc(ly); push('ledger'); }
    for (const k of ['months', 'income', 'salary']) {
      const n = Number(led[k]);
      const t = Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
      if (led[k] !== t) { led[k] = t; push('ledger'); }
    }
  }
  // 武将档案（原作段4 +0x0B9 STATUS / +0x0C3 WEAPON / +0x0C1 HORSE / +0x0C5 THING）
  strMapAt('generalStatus');
  strMapAt('weapon');
  strMapAt('horse');
  strMapAt('thing');
  if (!obj(s.drift)) {''')

# ---------------------------------------------------------------- 4. citySummaryOf 文档表
rep('doc:city-table', ''' * | flags     | +0x0A2   | FLAGS（1 = 关卡） |
''', ''' * | flags     | +0x0A2   | FLAGS（1 = 关卡） |
 * | officers  | （无）    | 在城武将数 = `roster.length`；原作只存链头 +0x028 `[新设计]` |
 * | flag      | （无）    | 势力旗号（`forces[owner].flag`，由 fillCitySummaries 派生）`[新设计]` |
''')

# ---------------------------------------------------------------- 5. citySummaryOf 代码
rep('code:city-officers', '''  const roster = (Array.isArray(meta.roster) ? meta.roster : [])
    .filter((n) => typeof n === 'string' && n);
''', '''  const roster = (Array.isArray(meta.roster) ? meta.roster : [])
    .filter((n) => typeof n === 'string' && n);
  // 在城武将数：原作只有链头 +0x028，数目 = 链长 → 我们直接存数组长度
  const officers = roster.length;
  // 旗号：原作城记录里没有，玩家势力旗在 King 段；这里由 fillCitySummaries 从 forces[owner] 派生
  const flag = Number.isFinite(Number(meta.flag)) ? Math.trunc(Number(meta.flag))
    : Number.isFinite(Number(state.flag)) ? Math.trunc(Number(state.flag))
      : 0;
''')

rep('code:city-return', '''    roster,
    troops,''', '''    roster,
    officers,
    flag,
    troops,''')

# ---------------------------------------------------------------- 6. fillCitySummaries 派生旗号
rep('code:fill-flag', '''    let extra = {};
    if (info) { try { extra = info(cd.NAME) || {}; } catch { extra = {}; } }
    snapshot.cities[cd.NAME] = citySummaryOf(cd, snapshot.cities[cd.NAME], extra);''',
    '''    let extra = {};
    if (info) { try { extra = info(cd.NAME) || {}; } catch { extra = {}; } }
    const st = snapshot.cities[cd.NAME];
    const owner = (typeof extra.owner === 'string' && extra.owner)
      || (st && typeof st.owner === 'string' ? st.owner : '')
      || (typeof cd.KING === 'string' ? cd.KING : '');
    const fl = owner && snapshot.forces && typeof snapshot.forces === 'object'
      ? Number(snapshot.forces[owner] && snapshot.forces[owner].flag) : NaN;
    if (Number.isFinite(fl)) extra = { ...extra, flag: Math.trunc(fl) };
    snapshot.cities[cd.NAME] = citySummaryOf(cd, snapshot.cities[cd.NAME], extra);''')

# ---------------------------------------------------------------- 7. newCampaign 全键
rep('code:newcampaign', '''  save.morale = {};
  return save;''', '''  save.morale = {};
  // v3（R84）：时间 / 年度账本 / 武将档案。一次写全 ⇒ snapshotIsCurrent() 立刻为真，
  // 新开档不必跑迁移（yearsettle_r7 断言 up.changed === false 就靠这个）。
  save.year = 1;
  save.yearFlag = 0;
  save.ledger = { year: 1, months: 0, income: 0, salary: 0 };
  save.generalStatus = {};   // 原作段4 +0x0B9 STATUS
  save.weapon = {};          // +0x0C3 WEAPON
  save.horse = {};           // +0x0C1 HORSE
  save.thing = {};           // +0x0C5 THING
  return save;''')

# ---------------------------------------------------------------- 8. metaFromSnapshot 摘要
rep('code:meta-locals', '''  const generals = generalsSummary(safe);
''', '''  const generals = generalsSummary(safe);
  // v3 摘要：在城武将总数 / 状态记录数 / 有装备记录的武将数（列表页不必翻 snapshot）
  const citiesObj = safe.cities && typeof safe.cities === 'object' ? safe.cities : {};
  let cityOfficers = 0;
  for (const st of Object.values(citiesObj)) {
    if (st && typeof st === 'object') cityOfficers += intOr(st.officers, 0, 0);
  }
  const statusCount = Object.keys(safe.generalStatus && typeof safe.generalStatus === 'object'
    ? safe.generalStatus : {}).length;
  const equipped = new Set();
  for (const key of ['weapon', 'horse', 'thing']) {
    const map = safe[key] && typeof safe[key] === 'object' ? safe[key] : {};
    for (const name of Object.keys(map)) equipped.add(name);
  }
''')

rep('code:meta-return', '''    generalCount: generals.total,
''', '''    generalCount: generals.total,
    year: yearOf(month),
    cityOfficers,
    statusCount,
    equipCount: equipped.size,
''')

# ---------------------------------------------------------------- 9. normalizeStore.hasMeta
rep('code:hasmeta', '''      && Number.isFinite(Number(entry.generalCount));''',
    '''      && Number.isFinite(Number(entry.generalCount))
      && Number.isFinite(Number(entry.cityOfficers))
      && Number.isFinite(Number(entry.statusCount))
      && Number.isFinite(Number(entry.equipCount));''')

# ---------------------------------------------------------------- 10. 新导出：武将状态/装备
NEW_API = '''/**
 * 武将状态 token —— 对齐原作段4 +0x0B9 `STATUS`（07b：8=在野 / 1=登用 / 2=俘虜）。
 *
 * 原作只有这 3 个值；本档另有两个**运行时**才出现的：`未`（未登场 = 数据表默认）
 * 与 `亡`（阵亡）。`[新设计]`：原作里势力灭亡的武将记录会消失，没有可恢复的"阵亡"位。
 * 注意 `Spirit`（气力/士气）不走这里，见 `morale`（士气 0..100）。
 */
export const GENERAL_STATUS = Object.freeze({
  PENDING: '未',   // 未登场（generals.json 默认值，通常不写进存档）
  ACTIVE: '登',    // 在城 / 登用（原作 1）
  CAPTIVE: '俘',   // 被俘（原作 2）
  WILD: '野',      // 在野（原作 8）
  DEAD: '亡',      // 阵亡 [新设计]
});

/** token → 原作 `STATUS` 数值；`未`/`亡` 是 `[新设计]` 的扩展位（原作没有对应数） */
export const GENERAL_STATUS_CODE = Object.freeze({ 未: 0, 登: 1, 俘: 2, 野: 8, 亡: 9 });

function strMapOf(snapshot, key) {
  return snapshot && typeof snapshot === 'object'
    && snapshot[key] && typeof snapshot[key] === 'object' && !Array.isArray(snapshot[key])
    ? snapshot[key] : {};
}

/**
 * 取武将状态 token：显式 `generalStatus[名]` 优先，缺省退化到 `fate[名]`
 * （R78 残将归宿：'wild' → 在野；'surrender' → 投了他主 ≈ 登用 `[推测]`）。
 * 都没有 → `''`（未知；调用方别把"未知"当"在野"用）。
 */
export function statusOf(snapshot, name) {
  const n = typeof name === 'string' ? name : '';
  if (!n) return '';
  const t = strMapOf(snapshot, 'generalStatus')[n];
  if (typeof t === 'string' && t) return t;
  const fate = strMapOf(snapshot, 'fate')[n];
  const f = fate && typeof fate === 'object' ? fate.fate : fate;
  if (f === 'wild') return GENERAL_STATUS.WILD;
  if (f === 'surrender') return GENERAL_STATUS.ACTIVE;
  return '';
}

/** 取装备三件套 `{weapon, horse, thing}`（没记录 = `''`；值是物品名，不是序号） */
export function equipOf(snapshot, name) {
  const n = typeof name === 'string' ? name : '';
  const pick = (key) => {
    const v = strMapOf(snapshot, key)[n];
    return typeof v === 'string' ? v : '';
  };
  return { weapon: pick('weapon'), horse: pick('horse'), thing: pick('thing') };
}

/** 写武将状态（`''`/未知 token = 删掉该武将的记录）；返回写入后的 token */
export function setGeneralStatus(snapshot, name, status) {
  const n = typeof name === 'string' ? name.trim() : '';
  const t = typeof status === 'string' ? status.trim() : '';
  if (!snapshot || typeof snapshot !== 'object' || !n) return '';
  if (!snapshot.generalStatus || typeof snapshot.generalStatus !== 'object') snapshot.generalStatus = {};
  if (!t) { delete snapshot.generalStatus[n]; return ''; }
  snapshot.generalStatus[n] = t;
  return t;
}

/**
 * 写装备（`patch = {weapon?, horse?, thing?}`；值 `''`/null = 卸下）。
 * 返回写后的三件套。名字口径同 `generals.json` 的 Weapon/Horse/Thing。
 */
export function setEquip(snapshot, name, patch) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!snapshot || typeof snapshot !== 'object' || !n) return { weapon: '', horse: '', thing: '' };
  for (const key of ['weapon', 'horse', 'thing']) {
    if (!patch || !(key in patch)) continue;
    const v = typeof patch[key] === 'string' ? patch[key].trim() : '';
    if (!snapshot[key] || typeof snapshot[key] !== 'object') snapshot[key] = {};
    if (!v) delete snapshot[key][n];
    else snapshot[key][n] = v;
  }
  return equipOf(snapshot, name);
}

/** 由 snapshot 生成槽元数据：'''
rep('api:status-equip', '''/**
 * 由 snapshot 生成槽元数据：''', NEW_API)

# ---------------------------------------------------------------- 写盘
if fails:
    print('PATCH FAILED:')
    for name, why in fails:
        print('  - %-22s %s' % (name, why))
    sys.exit(1)

io.open(PATH, 'w', encoding='utf-8', newline='').write(src)
print('PATCH OK  (%d -> %d bytes, NL=%s)' % (len(io.open(PATH, 'rb').read()), len(src.encode('utf-8')), repr(NL)))
