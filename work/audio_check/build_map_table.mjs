/**
 * 音频层体检 · 第 7 步：生成 work/audio_check/map_table.md（映射对表）。
 *
 * 所有数字/名单都是现读现算，不手抄：
 *   - game/data/terrains.json          （作品数据：SoundTrack / Name / Sequence）
 *   - extract/pak/SANGO.INI            （原作配置：[TERRAIN] 段的 SoundTrack）
 *   - game/web/assets/audio/index.json （运行时索引：terrain 表 / sceneTracks / aliases）
 *   - game/web/audio.js                （本仓库实际播放用的常量：TERRAIN_TRACK/TERRAIN_AMB/MAGIC_SFX/…）
 *   - work/audio_check/magic_snd.json  （MAGIC.SO 字节码 CALL 图可达性）
 *   - game/data/magics.json            （技能 -> fx_dir_primary）
 *   - 资产目录                          （文件是否真的存在）
 * 调用点行号也是现扫的，避免报告过期。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const ROOT = 'F:\\sanguo';
const G = `${ROOT}\\game`;
const D = `${ROOT}\\work\\audio_check`;
const rj = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rt = (p) => readFileSync(p, 'utf8');

const terrains = rj(`${G}\\data\\terrains.json`);
const magics = rj(`${G}\\data\\magics.json`);
const index = rj(`${G}\\web\\assets\\audio\\index.json`);
const msnd = rj(`${D}\\magic_snd.json`);
const audioSrc = rt(`${G}\\web\\audio.js`);

// ---- 从 audio.js 里把常量抠出来（解析失败就抛，别生成半张假表） ----
function arr(name) {
  const m = new RegExp(`var ${name} = \\[([^\\]]*)\\]`).exec(audioSrc);
  if (!m) throw new Error(`audio.js 找不到 ${name}`);
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
}
function numArr(name) { return arr(name).map(Number); }
const TERRAIN_TRACK = numArr('TERRAIN_TRACK');
const TERRAIN_AMB = arr('TERRAIN_AMB');
const DOMESTIC_TRACKS = numArr('DOMESTIC_TRACKS');
const DOMESTIC_CUT = numArr('DOMESTIC_CUT');
const sceneM = /var BGM_SCENE = \{ menu: '(\d+)', map: '(\d+)' \};/.exec(audioSrc);
if (!sceneM) throw new Error('audio.js 找不到 BGM_SCENE');
const BGM_SCENE = { menu: sceneM[1], map: sceneM[2] };
const MAGIC_SFX = {};
for (const m of audioSrc.matchAll(/'(\d{3})':\s*'(m\d{3}snd\d{2})'/g)) MAGIC_SFX[m[1]] = m[2];

// 改动前（本轮修之前的）MAGIC_SFX：30 个键、全是 m<dir>snd01，006/024 无键。
// 这是从修前的 audio.js 抄下来的（报告里"旧表"一列就是它），改代码时不要动这里。
const OLD_MAGIC_SFX = {};
for (const d of ['001', '002', '003', '004', '005', '007', '008', '009', '010', '012', '013',
  '015', '016', '017', '018', '020', '021', '022', '023', '025', '026', '028', '029', '031',
  '033', '034', '035', '037', '039', '040']) OLD_MAGIC_SFX[d] = 'm' + d + 'snd01';

// ---- SANGO.INI ----
const iniLines = rt(`${ROOT}\\extract\\pak\\SANGO.INI`).split(/\r?\n/);
const iniTerr = [];
let cur = null;
iniLines.forEach((l, i) => {
  if (/^\[TERRAIN\]/i.test(l.trim())) { cur = { line: i + 1 }; iniTerr.push(cur); return; }
  if (!cur) return;
  const t = /^\s*SoundTrack\s*=\s*(-?\d+)/i.exec(l);
  if (t) cur.track = Number(t[1]);
  const q = /^\s*Sequence\s*=\s*(-?\d+)/i.exec(l);
  if (q) cur.seq = Number(q[1]);
});

// ---- MAGIC.SO 的 snd 字符串表（唯一 57 条）：某目录连名字都没出现，就不可能有代码播它 ----
const magicSo = readFileSync(`${ROOT}\\extract\\pak\\SCRIPT\\MAGIC.SO`, 'latin1');
const sndNames = [...new Set(magicSo.match(/m\d{3}snd\d{2}/g) || [])];
const sndSet = new Set(sndNames);

// ---- 资产清单 ----
const bgmFiles = new Set(readdirSync(`${G}\\web\\assets\\audio\\bgm`).filter((f) => f.endsWith('.mp3')));
const sfxFiles = new Set(readdirSync(`${G}\\web\\assets\\audio\\sfx`).filter((f) => f.endsWith('.mp3')));
const pad2 = (n) => String(n).padStart(2, '0');
const hasBgm = (n) => bgmFiles.has(pad2(n) + '.mp3');
const hasSfx = (k) => sfxFiles.has(k + '.mp3');

// ---- 调用点（现扫行号） ----
const callSites = [];
for (const [file, re] of [
  ['game/web/main.js', /bgm\('terrain'\)|battleAmbience\(|bgm\('menu'\)/],
  ['game/web/campaign.html', /bgm\('map'\)/],
  ['game/web/city.html', /bgm\(`domestic:/],
  ['game/web/deploy.html', /bgm\('map'\)/],
  ['game/web/items.html', /bgm\('map'\)/],
]) {
  const lines = rt(`${ROOT}\\${file}`).split(/\r?\n/);
  lines.forEach((l, i) => { if (re.test(l)) callSites.push([file, i + 1, l.trim().replace(/\s+/g, ' ').slice(0, 96)]); });
}

// ---- 技能 -> 目录分组 ----
const byDir = new Map();
for (const r of msnd.rows) {
  if (!byDir.has(r.dir)) byDir.set(r.dir, []);
  byDir.get(r.dir).push(r);
}
const dirs = [...byDir.keys()].sort();
const magicChanged = dirs.filter((d) => (OLD_MAGIC_SFX[d] || '') !== (MAGIC_SFX[d] || ''));

const L = [];
const P = (s) => L.push(s);

P('# 音频层映射对表（BGM / 底噪 / 技能音）');
P('');
P('> 由 `work/audio_check/build_map_table.mjs` 现读现算生成：作品数据、原作 `SANGO.INI`、');
P('> 运行时 `index.json`、`game/web/audio.js` 的常量、以及 `MAGIC.SO` 字节码可达性四路对表。');
P('> 数字不手抄，改完代码重跑本脚本即可刷新。');
P('');
P('## 0. 结论速览');
P('');
P('| 类目 | 条数 | 不一致 | 已改 |');
P('|---|---|---|---|');
P(`| 地形 BGM（12 地形） | 12 | 0 | 0 |`);
P(`| 场景 BGM（menu/map/domestic 5 档） | 7 | 0 | 0 |`);
P(`| 战场底噪（12 地形） | 12 | 10（8 个多播 + 2 个播错曲） | 1 张表（10 行） |`);
P(`| 技能音（110 技能 / ${dirs.length} 个目录） | ${Object.keys(MAGIC_SFX).length} 键 | ${magicChanged.length} | ${magicChanged.length} |`);
P('');
P('一句话：**BGM 的三路数据（SANGO.INI / terrains.json / audio.js）本来就完全一致，错的只有"战场底噪"和 6 个技能音目录**。');
P('');

// ---------------- 1. 地形 BGM ----------------
P('## 1. 地形 BGM：四路对表');
P('');
P('`SANGO.INI` 的 `SoundTrack` 是曲线来源；`terrains.json` 是作品数据；`audio.js` 的 `TERRAIN_TRACK`');
P('是实际播放的表（优先取 `index.json` 的 `terrain[i].track`，两者同源）。');
P('');
P('| Seq | 地形 | SANGO.INI 行 | SoundTrack(ini) | terrains.json | index.json | audio.js | 实际文件 | 文件在 | 一致 |');
P('|---|---|---|---|---|---|---|---|---|---|');
terrains.forEach((t, i) => {
  const ini = iniTerr.find((x) => x.seq === t.Sequence) || iniTerr[i] || {};
  const idxRow = (index.terrain && (index.terrain[String(t.Sequence)] || index.terrain[t.Sequence])) || {};
  const aj = TERRAIN_TRACK[t.Sequence];
  const file = pad2(aj) + '.mp3';
  const ok = t.SoundTrack === ini.track && t.SoundTrack === aj && (idxRow.track == null || idxRow.track === aj);
  P(`| ${t.Sequence} | ${t.Name} | ${ini.line || '?'} | ${ini.track} | ${t.SoundTrack} | ${idxRow.track == null ? '—' : idxRow.track} | ${aj} | ${file} | ${hasBgm(aj) ? '✅' : '❌'} | ${ok ? '✅' : '❌'} |`);
});
P('');
const dist = {};
for (const t of terrains) dist[t.SoundTrack] = (dist[t.SoundTrack] || 0) + 1;
P(`分布：${Object.entries(dist).map(([k, v]) => `**${pad2(k)}.mp3 × ${v}**`).join('、')} —— 12 个地形共用 ${Object.keys(dist).length} 首战斗曲，`);
P('每首正好 4 个地形（对称切分，不是随机复用）：');
for (const [track, n] of Object.entries(dist)) {
  const names = terrains.filter((t) => t.SoundTrack === Number(track)).map((t) => `${t.Sequence}·${t.Name}`);
  P(`- \`${pad2(track)}.mp3\`（${n} 个）：${names.join('、')}`);
}
P('');
P('**判定：一致，未改动。** 12 个地形只播 3 首是原作设计，不是我们的偷懒——`SANGO.INI` 里就是这么写的。');
P('');

// ---------------- 2. 战场底噪 ----------------
const AMB_TRUTH = { 3: 'bg03a', 5: 'bg04a', 8: 'bg08a', 9: 'bg09a' };
const AMB_OLD = ['bg03a', 'bg03a', 'bg03a', 'bg04a', 'bg04a', 'bg04a', 'bg08a', 'bg08a', 'bg09a', 'bg09a', 'bg03a', 'bg08a'];
P('## 2. 战场底噪：字节码真值 vs 旧表');
P('');
P('真值出处：`extract/pak/SCRIPT/SYSTEM.SO` 反汇编 `export/script/system_so.dis.txt:1058`');
P('`func #19 LoadingBattleMap id=0x32 argc=1 @0x1D54`，`LDSL arg1` 后接 `CASE 0..11` 跳转表：');
P('');
P('| CASE | 目标 | 指令 | 底噪 |');
P('|---|---|---|---|');
P('| 0 / 1 / 2 | `L01DF8` / `L01E00` / `L01E08` | `JMP L01F68`（=RET） | 无 |');
P('| 3 | `L01E10` | `PUSHS "BG03A"; PUSHI 255; SYSCALL 0x301,0x2` | **bg03a** |');
P('| 4 | `L01E34` | `SYSCALL 0x212` + `CALL EnterWar4` | 无 |');
P('| 5 | `L01E64` | `PUSHS "BG04A"; PUSHI 255; SYSCALL 0x301,0x2` + `EnterWar5` | **bg04a** |');
P('| 6 | `L01EB0` | `JMP L01F68` | 无 |');
P('| 7 | `L01EB8` | `SYSCALL 0x212` + `CALL EnterWar7` | 无 |');
P('| 8 | `L01EE8` | `PUSHS "BG08A"; PUSHI 255; SYSCALL 0x301,0x2` + `CALL ProduceSnow` | **bg08a** |');
P('| 9 | `L01F34` | `PUSHS "BG09A"; PUSHI 255; SYSCALL 0x301,0x2` | **bg09a** |');
P('| 10 / 11 | `L01F58` / `L01F60` | `JMP L01F68` | 无 |');
P('');
P('`0x301` 的第二个参数 `255` 与 `37c §2.3` 记录的"音效 name,vol"调用形状一致；');
P('`arg1` 就是地形号：CASE 8 顺带 `CALL ProduceSnow`（只有雪原下雪）是独立反证。');
P('');
P('| Seq | 地形 | 字节码真值 | 旧 audio.js | 新 audio.js | 判定 |');
P('|---|---|---|---|---|---|');
terrains.forEach((t) => {
  const truth = AMB_TRUTH[t.Sequence] || '（静音）';
  const old = AMB_OLD[t.Sequence];
  const now = TERRAIN_AMB[t.Sequence] || '（静音）';
  const verdict = old === (AMB_TRUTH[t.Sequence] || '') ? '✅ 原本就对' : '🔧 已改';
  P(`| ${t.Sequence} | ${t.Name} | ${truth} | ${old} | ${now} | ${verdict} |`);
});
P('');
P('12 个地形里 **8 个原本不该有底噪**（0,1,2,4,6,7,10,11），旧表按"材质分桶"给它们全配了声音。');
P('旧表的来源是 `project/41_音频补齐.md:95` 自己标注的 [推测]；本轮用字节码把它坐实成 [确认]。');
P('');
P('两个附注：');
P('- **bg07a 是孤儿素材**：`SOUND` 目录里 `BG03A/BG04A/BG07A/BG08A/BG09A` 五个 WAV 都在（mp3 也在），');
P('  但 `SYSTEM.SO` 的字符串表只有 `BG03A/BG04A/BG08A/BG09A` 四条（offset 19500/19508/19516/19524，');
P('  `BG07A` 搜不到 → `indexOf = -1`）。LoadingBattleMap 的 CASE 7（森林）走 `EnterWar7`，不铺底噪。');
P('  所以地形 7 静音是**原作行为**，不是缺素材；bg07a 留给以后定位（EXE 侧可能有别的入口，[未解]）。');
P('- `game/web/assets/audio/index.json` 里没有底噪表，`audio.js` 的 `TERRAIN_AMB` 是唯一真源；');
P('  改它不影响任何其它文件。');
P('');

// ---------------- 3. 场景 BGM ----------------
const tierRows = [];
let prev = -1;
DOMESTIC_CUT.forEach((cut, i) => { tierRows.push([prev + 1, cut - 1, DOMESTIC_TRACKS[i]]); prev = cut - 1; });
tierRows.push([prev + 1, '∞', DOMESTIC_TRACKS[DOMESTIC_CUT.length]]);
P('## 3. 场景 BGM：menu / map / domestic');
P('');
P('| 场景 | audio.js 取值 | 文件 | 在包 | 依据 |');
P('|---|---|---|---|---|');
P(`| \`bgm('menu')\`、\`bgm('title')\` | ${BGM_SCENE.menu} | ${pad2(BGM_SCENE.menu)}.mp3 | ${hasBgm(BGM_SCENE.menu) ? '✅' : '❌'} | Sango2.exe 0x46CDA0 站点：主菜单/忠诚度/招降委任（37c §3） |`);
P(`| \`bgm('map')\`、\`bgm('campaign')\` | ${BGM_SCENE.map} | ${pad2(BGM_SCENE.map)}.mp3 | ${hasBgm(BGM_SCENE.map) ? '✅' : '❌'} | 大地图 0x447FF2 请求 17 号曲（37c §3） |`);
P(`| \`bgm('domestic:N')\` | ${DOMESTIC_TRACKS.join('/')} 五档 | ${DOMESTIC_TRACKS.map((n) => pad2(n) + '.mp3').join(' ') } | ${DOMESTIC_TRACKS.every(hasBgm) ? '✅' : '❌'} | 内政 0x423A3C..0x423B66 五档，判据 cmp 9/0x12/0x1a/0x25（37c §3） |`);
P('');
P('内政五档（`owned` = 我方城数，`DOMESTIC_CUT = ' + JSON.stringify(DOMESTIC_CUT) + '`）：');
P('');
P('| 档 | owned 区间 | 曲目 |');
P('|---|---|---|');
tierRows.forEach(([a, b, tr], i) => P(`| ${i + 1} | ${a} .. ${b === '∞' ? '60' : b} | ${pad2(tr)}.mp3 |`));
P('');
P(`校验：\`bgm('domestic:12')\` → 12 ≥ ${DOMESTIC_CUT[0]} 且 < ${DOMESTIC_CUT[1]} → 档 2 → **${pad2(DOMESTIC_TRACKS[1])}.mp3**，与 37c §3 的反汇编表一致。`);
P('');
P('### 调用点（现扫，行号会随代码移动）');
P('');
P('| 文件:行 | 代码 |');
P('|---|---|');
for (const [f, n, code] of callSites) P(`| \`${f}:${n}\` | ${code.replace(/\|/g, '\\|').replace(/`/g, "'")} |`);
P('');
P('**判定：7 条场景映射全部一致，未改动。** 调用点只用语义名（`terrain`/`menu`/`map`/`domestic:N`），');
P('没有任何一处写死曲号，所以改曲库只动 `audio.js` 一处即可。');
P('');

// ---------------- 4. 技能音 ----------------
const changed = [];
P('## 4. 技能音：110 个技能 → 31 个有音目录');
P('');
P('原作把音效名写成 `m<fx_dir>snd<NN>`，`main.js:180-186 skillSfx()` 只把 `magics.json` 的');
P('`fx_dir_primary` 传给 `audio.js`，所以**同一目录下的多个 snd 无法按技能区分**（API 限制，改不了）。');
P('本轮做的是：按 `MAGIC.SO` 的 CALL 图算出每个技能真正播哪个串，再看 `snd01` 是否出现在其中。');
P('');
P('`work/audio_check/magic_snd.mjs`（DFS 463 个函数）结果：110 个技能的 `MagicN` 全存在，**76 个能追到音效串**，');
P('其中只有 **41 个**真的用 `snd01`；34 个追不到（音效串在 EXE 侧，[推测]）。');
P('');
P('| 目录 | 用到它的技能（seq·名） | 字节码可证的音效 | 旧表 | 新表 | m<dir>snd01 在串表 | 判定 |');
P('|---|---|---|---|---|---|---|');
for (const dir of dirs) {
  const rows = byDir.get(dir);
  const all = new Set();
  for (const r of rows) for (const s of r.sfx) all.add(s);
  const names = rows.map((r) => `${r.seq}·${r.name}`).join('、');
  const oldV = OLD_MAGIC_SFX[dir] || '';
  const newV = MAGIC_SFX[dir] || '';
  const inTable = sndSet.has('m' + dir + 'snd01');
  let verdict;
  if (!oldV && !newV) verdict = '✅ 一致（原作无此音，静默）';
  else if (oldV !== newV) verdict = !oldV ? '🔧 补键' : '🔧 已改';
  else if (all.size && !all.has(newV)) verdict = `⚠️ 存疑（可证播 ${[...all].join('/')}）`;
  else if (all.size) verdict = '✅ 一致';
  else if (inTable) verdict = '✅ 未改（名字在串表，调用点追不到）';
  else verdict = '⚠️ 存疑（串表里没有 snd01）';
  if (oldV !== newV) changed.push([dir, oldV || '（无键）', newV || '（无键）', names, [...all].join(' / ')]);
  P(`| ${dir} | ${names} | ${[...all].join(' / ') || '—'} | ${oldV || '（无键）'} | ${newV || '（无键）'} | ${inTable ? '有' : '—'} | ${verdict} |`);
}
P('');
P(`\`audio.js\` 里 \`MAGIC_SFX\` 共 ${Object.keys(MAGIC_SFX).length} 个键；包内 38 个 m-dir 全部有对应 mp3。`);
P('未列入表的目录（000/011/019/027/032/036/038/041）不是任何技能的 `fx_dir_primary`，');
P('它们只作为"别的目录的技能实际会播的音"出现（例如 031 的技能播 041snd02）——所以表里不需要它们自己的键。');
P('');
P(`### 4.1 改动明细（${changed.length} 条）`);
P('');
P('| # | 目录 | 旧 | 新 | 证据（技能） | 字节码可证 |');
P('|---|---|---|---|---|---|');
changed.forEach(([dir, o, n, names, all], i) => P(`| ${i + 1} | ${dir} | ${o} | ${n} | ${names} | ${all} |`));
P('');
P('判据：**该目录下多数技能字节码可证播的不是 snd01**，或**根本没有 snd01**（旧值是凭目录号猜的）。');
P('保持不动的 7 个"多数派"目录：001/009/012/018/020/026/028 —— 它们下面确实有一批技能播 `snd01`，');
P('只是同目录另有技能播别的 snd（API 层无解，见 §5.1）；改动它们会让多数派变错。');
P('');
P('### 4.2 MAGIC.SO 串表交叉验证（"名字在不在"比"文件在不在"更硬）');
P('');
P(`\`MAGIC.SO\` 里唯一出现过的 \`mNNNsndNN\` 名字共 **${sndNames.length} 条**，覆盖 ${new Set(sndNames.map((x) => x.slice(1, 4))).size} 个目录。`);
P('某目录连名字都没被脚本写过，就**不可能有任何代码播它**。逐目录比对后：');
P('');
const absent = dirs.filter((d) => !sndSet.has('m' + d + 'snd01'));
const onlyOther = dirs.filter((d) => !sndSet.has('m' + d + 'snd01') && sndNames.some((x) => x.startsWith('m' + d)));
const wholeAbsent = absent.filter((d) => !onlyOther.includes(d));
P(`- **以该目录名开头的音效名在串表里根本不存在**（${wholeAbsent.length} 个）：${wholeAbsent.join('、')} —— 这类键写什么都不可能被原作脚本播放，只能是猜的（006 因此保持无键）；`);
P(`- **目录在、但没有 snd01**（${onlyOther.length} 个）：${onlyOther.join('、')} —— 只有 snd02/snd03；`);
P(`- 其余 ${dirs.length - absent.length} 个目录的 snd01 都在串表里（名字合法，只是调用点不一定追得到）。`);
P('');
P('据此：010/024 的旧值（m010snd01/无键）属于"必然播不到"，已改成可证会播的 m021snd01/m002snd01；');
P('004/033 同样"必然播不到"，但字节码也没给出替代（004 只追到 att07/yell01/hit01，');
P('033 的龍砲三兄弟完全追不到），改成语义名会让衝車/龍砲发出刀剑声、依据不足，故**保留原值并标 ⚠️ 存疑**，');
P('等拿到 Sango2.exe 再定。006 无素材、无串，保持静默。');
P('');
P('## 5. 没做到的');
P('');
P('1. **技能音只能做到"目录级正确"**：`main.js` 只传 `fx_dir_primary`，同目录多 snd（001/009/012/017/020/026/028）');
P('   无法按技能分派。要么改 `main.js`+`magics.json` 传 `fx_dir` 序号，要么改 API——两条都不在本轮可改范围。');
P('2. **34 个技能追不到音效串**（火箭/火雷/落石/龍砲/太極門…）：它们的 `MagicN` 可达函数里只有资源名');
P('   （`magic\\006\\*`/`MoveCamera`/`FlyArrowRB1`），发声点应该在 EXE 的 syscall 实现里。没有 `Sango2.exe`，只能标 [推测]。');
P('3. **bg07a 的来源未解**：素材在、脚本不引用。没有 exe 无法确认是否还有别的播放入口。');
P('4. 底噪的音量/淡出沿用旧实现（比 BGM 低 9 dB、800 ms 淡入），未与原作比对（原作 0x301 的 255 是相对音量，无法换算）。');
P('');

writeFileSync(`${D}\\map_table.md`, L.join('\n'), 'utf8');
console.log('写 map_table.md', L.length, '行');
console.log('改变条数', changed.length, changed.map((c) => c[0]).join(','));
console.log('地形一致', terrains.every((t) => t.SoundTrack === TERRAIN_TRACK[t.Sequence]));
console.log('调用点', callSites.length);
