/* 三国群英传2 竖版重制 · 音频播放模块
 * ------------------------------------------------------------------
 * 无依赖、普通 <script> 引入，把 API 挂到 window.SG.audio。
 * 资源由 tools/export_audio.py 生成：
 *     game/web/assets/audio/{index.json, sfx/<名>.mp3, bgm/NN.mp3}
 *
 * 用法：
 *     SG.audio.bgm('terrain:0');     // 战斗：按 ?terrain=N 取地形 BGM（04/05/06）
 *     SG.audio.bgm('menu');          // 菜单/编成/道具页 -> 03.mp3
 *     SG.audio.bgm('map');           // 大地图 -> 17.mp3
 *     SG.audio.bgm('domestic:12');   // 内政：参数=我方城数，按 9/18/26/37 分 5 档 -> 10..14
 *     SG.audio.magic('016');         // 技能音：参数=技能编号(SEQUENCE)，播该技能的具体音效串
 *                                    //   （'016' 虎咆震 -> m008snd01；表见 MAGIC_SFX / project\96）
 *     SG.audio.battleAmbience(4);    // 战场底噪：按地形取 bg03a/04a/08a/09a，循环、比 BGM 低 9 dB
 *     SG.audio.sfx('hit', {volume:0.8});
 *     SG.audio.mute(true);
 *     SG.audio.unlock();             // 微信/iOS 用户手势后调用（已自动绑定首次 pointerdown）
 *
 * 调试：?sfxdbg=1 在左下角打印 "sfx: N"（按名计数 + 当前 BGM + 底噪）；
 *       ?bgmdbg=1 额外列出已装的全部 BGM 曲目与当前曲（截图/验收用，不加就不建 DOM）。
 *
 * 设计要点：
 *   - index.json 与 ALIAS_FALLBACK / TERRAIN_TRACK 双份数据：网络里 index.json
 *     慢或缺失也能按内置表工作，只是没有体积元数据。
 *   - BGM 是 HTMLAudio 元素，用 rAF 手动改 volume 做交叉淡入（不引入 WebAudio）。
 *   - SFX 用 8 个 Audio 对象轮转，避免每次 new Audio() 引起的 GC 与解码抖动。
 *   - 所有 play() 的 Promise 都吞掉：自动播放被拦（NotAllowedError）不算错误，
 *     等首次 pointerdown 时由 unlock() 重试。
 */
(function (root) {
  'use strict';

  var SG = (root.SG = root.SG || {});
  if (SG.audio) return; // 重复引入直接复用

  // ---------------------------------------------------------------- 内置兜底数据
  // [确认] SANGO.INI [TERRAIN] 0..11 的 SoundTrack；exe 的 "mp3\NN.mp3" 说明
  //        编号即文件名，所以 12 个地形只用 04/05/06 三首。
  var TERRAIN_TRACK = [6, 5, 4, 4, 6, 5, 4, 6, 6, 5, 5, 4];
  var TERRAIN_NAME = ['城', '城', '城', '船上', '草原', '平原',
    '山地', '森林', '雪原', '沙漠', '關卡', '長城'];
  // 与 index.json 的 aliases 同源；这里留一份，保证 index.json 未到时也能用语义名。
  // [确认] 不含 click：37c 审计确认原作没有 UI 按钮音（ACCEPT 全是 MENU\... 资源名），
  //        全局点击音已从 campaign.html 删除；不要再往这里加 click。
  var ALIAS_FALLBACK = {
    hit: 'hit01', hit2: 'hit02', defend: 'defense', defend2: 'defense2',
    death: 'death', death2: 'death3', horse: 'horse01', horse2: 'horse02',
    arrow: 'arrow', sword: 'flaysword', spell: 'm005snd01',
    heal: 'm016snd01', rush: 'rush01', success: 'success', victory: 'victory',
    defeat: 'failure2', silence: 'silence', yell: 'yell01', yell2: 'yell02',
    yell3: 'yell03', bg: 'bg03a'
  };

  // ---------------------------------------------------------------- 技能音查表
  // 键 = **技能编号**（data/magics.json 的 SEQUENCE，补 3 位）；值 = sfx 目录里的具体文件名。
  // 旧版把键当 fx_dir_primary（特效目录号）用，只能做到"目录级"：34 个技能追不到串，
  // 且同一目录下的多个技能被迫共用一条音（如 dir001 的半月斬/旋龍/三日月斬）。
  // 现行依据 = 双源（详见 project\96_技能音效映射.md、project\148_技能音证据表.md、work\sfx_evidence\）：
  //   [A]  技能自身特效脚本直证：magic_so.dis.txt 里 MagicN → CALL 的效果函数，
  //        depth<=1 处 `PUSHS "mNNNsndNN" ... SYSCALL 0x301`（播放音效(name,vol)）。
  //   [A2] 间接静态链，音效号须等于该技能的 fx_dir：
  //        (a) depth<=4 的 CreateXxx 里播 `mNNNsndNN`；
  //        (b) 脚本 `PUSHI <物件号>` 生成的物件，其 THINGS.INI 动画串带 `$mNNNsndNN`；
  //        (c) 再经物件 `!nnnn` 回调脚本播（如 !6003→FlyArrowLU 播 "arrow"）。
  //        R148 用 (a)(b)(c) 把原 24 条 [C] 全部升 [A2]，注释里的“→obj”即 (b)。
  //   [C]  只剩目录级推断、脚本链追不到。**R148 后清零**：006 系 6 条经
  //        ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 取证升 [A2]。
  //   [X]  仅按 m<fx_dir>sndNN 命名约定 + 文件存在（推测）。**已清零**：原 043/080/102 三条
  //        经效果函数字节码取证全部升为 [A]（043→m032snd01、102→m031snd01、080 值不变），
  //        见 project\113_技能音与士兵节奏.md。
  // 110/110 有串；44 条非 snd01（原表 6 条）。006 系原作没有 M006* 音，播通用 "arrow"
  // （FlyArrowLU 0x9EF0 L5789 `PUSHS "arrow"` + SYSCALL 0x300，由 obj16001 !6003 触发）。
  var MAGIC_SFX = {
    '001': 'm016snd01', // [A] 命療術 dir016
    '002': 'm003snd01', // [A] 落月弓 dir003
    '003': 'm026snd01', // [A2] 地泉衝 dir026
    '004': 'arrow',     // [A2] 火箭 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
    '005': 'm002snd01', // [A] 伏兵組陣 dir002
    '006': 'm039snd01', // [A] 木輪攻 dir039
    '007': 'm008snd01', // [A] 虎咆 dir008
    '008': 'm034snd01', // [A2] 火雷 dir034
    '009': 'm005snd02', // [A2] 雷擊 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
    '010': 'm017snd02', // [A] 炎龍 dir017
    '011': 'm023snd01', // [A2] 伏焰 dir023
    '012': 'm041snd02', // [A] 拒陸馬 dir031
    '013': 'm003snd01', // [A] 御飛刀 dir003
    '014': 'm005snd02', // [A2] 雷光波動 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
    '015': 'arrow',     // [A2] 火箭烈 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
    '016': 'm008snd01', // [A] 虎咆震 dir008
    '017': 'm002snd01', // [A] 伏兵排陣 dir002
    '018': 'm026snd01', // [A2] 地泉裂勁 dir026
    '019': 'm002snd01', // [A] 後伏連兵 dir024
    '020': 'm039snd01', // [A] 木輪強襲 dir039
    '021': 'm017snd02', // [A] 炎龍無雙 dir017
    '022': 'm005snd02', // [A2] 雷光振殺 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
    '023': 'm008snd01', // [A] 虎咆陽炎 dir008
    '024': 'm034snd01', // [A2] 火雷爆 dir034
    '025': 'm018snd01', // [A] 黃龍天翔 dir018
    '026': 'm026snd01', // [A2] 地泉鯨浪 dir026
    '027': 'm041snd02', // [A] 絕命壩 dir031
    '028': 'm005snd02', // [A2] 雷擊閃 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
    '029': 'm017snd02', // [A] 炎龍殺陣 dir017
    '030': 'arrow',     // [A2] 火箭天襲 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
    '031': 'm002snd01', // [A] 後伏兵陣 dir024
    '032': 'm034snd01', // [A2] 火雷星雨 dir034
    '033': 'm017snd02', // [A] 炎龍怒濤 dir017
    '034': 'm023snd01', // [A2] 赤焰洪流 dir023
    '035': 'm039snd01', // [A] 木輪濤擊 dir039
    '036': 'm023snd01', // [A2] 赤焰火海 dir023
    '037': 'm002snd01', // [A] 後伏軍陣 dir024
    '038': 'm040snd01', // [A2] 大地狂嘯 dir040
    '039': 'm005snd02', // [A2] 雷光燋獄 dir005（Thunder 0x8DCC→obj15010 $m005snd02）
    '040': 'm041snd02', // [A] 十面埋伏 dir031
    '041': 'm017snd02', // [A] 炎龍絕殺 dir017
    '042': 'm005snd01', // [A] 五雷轟頂 dir005
    '043': 'm032snd01', // [A] 狂雷天牢 dir022（效果函数 Sparkle→CreateSparkle 直证）
    '044': 'm018snd03', // [A2] 天地無用 dir018（XCallDragon 0x33DBC→Xsc3603 0x3387C→obj28012 !42002=Xsc3604 0x33B5C→m018snd03）
    '045': 'arrow',     // [A2] 飛矢 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
    '046': 'm019snd01', // [A] 連弩 dir009
    '047': 'm010snd01', // [A2] 突石 dir010（ConvexStone 0x10D68→obj20001 $m010snd01）
    '048': 'm007snd01', // [A2] 落石 dir007（StoneEmitter 0xDF2C→ProduceStoneEmitter 0xCBD8→obj17002 $m007snd01）
    '049': 'm036snd01', // [A] 刀劍亂 dir026
    '050': 'm001snd01', // [A] 半月斬 dir001
    '051': 'm011snd01', // [A] 旋龍 dir001
    '052': 'm003snd01', // [A] 落日弓 dir003
    '053': 'm009snd01', // [A] 八面火 dir009
    '054': 'm021snd01', // [A] 旋燈火 dir010
    '055': 'm010snd01', // [A2] 突石劍 dir010（ConvexStone 0x10D68→obj20001 $m010snd01）
    '056': 'm025snd01', // [A2] 太極門 dir025
    '057': 'm002snd01', // [A] 伏兵班陣 dir002
    '058': 'm013snd01', // [A] 八門金鎖 dir013
    '059': 'm003snd01', // [A] 鬼戟 dir003
    '060': 'm016snd01', // [A] 回天術 dir016
    '061': 'm035snd01', // [A] 地茅刺 dir035
    '062': 'm019snd01', // [A] 連弩激射 dir009
    '063': 'm022snd01', // [A] 冰柱刺 dir012
    '064': 'm010snd01', // [A2] 突劍四方 dir010（ConvexStone 0x10D68→obj20001 $m010snd01）
    '065': 'm004snd01', // [A2] 衝車 dir004（RushCart 0x7288→obj14001 $m004snd01）
    '066': 'm015snd01', // [A] 神劍 dir015
    '067': 'm009snd01', // [A] 八面火轉 dir009
    '068': 'm028snd01', // [A] 突襲石 dir028
    '069': 'm033snd01', // [A2] 龍砲 dir033（ProduceCannonEmitter 0x2BC44→obj43001/43005 !33002=ShootCannon→obj43002 $m033snd01）
    '070': 'm027snd01', // [A] 火牛陣 dir017
    '071': 'm020snd01', // [A] 生死門 dir020
    '072': 'arrow',     // [A2] 亂飛矢 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
    '073': 'm035snd01', // [A] 地茅亂刺 dir035
    '074': 'm033snd01', // [A2] 龍砲激射 dir033（ProduceCannonEmitter 0x2BC44→obj43001/43005 !33002=ShootCannon→obj43002 $m033snd01）
    '075': 'm011snd01', // [A] 旋龍合璧 dir001
    '076': 'm022snd01', // [A] 冰柱群鋒 dir012
    '077': 'm021snd01', // [A] 烈火旋燈 dir010
    '078': 'm025snd01', // [A2] 太極華陣 dir025
    '079': 'm028snd01', // [A] 滾石遽壓 dir028
    '080': 'm029snd01', // [A] 八卦奇陣 dir029（效果函数 Pa→CreatePa 直证）
    '081': 'm002snd01', // [A] 伏兵連陣 dir002
    '082': 'm004snd01', // [A2] 駟衝車 dir004（RushCart 0x7288→obj14001 $m004snd01）
    '083': 'm001snd01', // [A] 三日月斬 dir001
    '084': 'm015snd01', // [A] 神劍閃 dir015
    '085': 'm019snd01', // [A] 連弩狂濤 dir009
    '086': 'm036snd01', // [A] 亂刀狂舞 dir026
    '087': 'arrow',     // [A2] 飛矢烈震 dir006（ArrowSupport→ProduceArrowSoldier→AddSoldierL/R→obj16001/16002 !6003/!6004 播 "arrow"）
    '088': 'm001snd01', // [A] 三聖華斬 dir020
    '089': 'm021snd01', // [A] 神火旋張 dir010
    '090': 'm033snd01', // [A2] 龍砲滅殺 dir033（ProduceCannonEmitter 0x2BC44→obj43001/43005 !33002=ShootCannon→obj43002 $m033snd01）
    '091': 'm007snd01', // [A2] 炬石轟 dir007（StoneEmitter 0xDF2C→ProduceStoneEmitter 0xCBD8→obj17002 $m007snd01）
    '092': 'm027snd01', // [A] 火牛群舞 dir017
    '093': 'm035snd01', // [A] 茅刺遍地 dir035
    '094': 'm028snd01', // [A] 滾石怒衝 dir028
    '095': 'm038snd02', // [A] 劍輪舞 dir028
    '096': 'm012snd01', // [A] 分身斬 dir012
    '097': 'm022snd01', // [A] 冰嵐刃舞 dir012
    '098': 'm015snd01', // [A] 神劍閃華 dir015
    '099': 'm037snd01', // [A] 炎牆 dir037
    '100': 'm011snd01', // [A] 旋龍天舞 dir001
    '101': 'm020snd01', // [A] 地獄之門 dir020
    '102': 'm031snd01', // [A] 集火柱 dir021（效果函数 FirePillar→CreateFirePillar 直证）
    '103': 'm021snd01', // [A] 神火怒張 dir010
    '104': 'm004snd01', // [A2] 神鬼亂舞 dir004（DemonDancing 0x14DE8→obj14001 $m004snd01）
    '105': 'm007snd01', // [A2] 炬石煉獄 dir007（StoneEmitter 0xDF2C→ProduceStoneEmitter 0xCBD8→obj17002 $m007snd01）
    '106': 'm037snd01', // [A] 炎牆烈燒 dir037
    '107': 'm001snd01', // [A] 日月輪斬 dir001
    '108': 'm027snd01', // [A] 火牛烈崩 dir017
    '109': 'm001snd01', // [A] 五嶽華斬 dir020
    '110': 'm012snd01'  // [A2] 鬼哭神號 dir012
  };

  // ---------------------------------------------------------------- 场景 BGM
  // [确认] Sango2.exe 里 18 个 PlayMusic(0x46CDA0) 站点：03=主菜单/忠诚度/招降委任，
  //        17=大地图(0x447FF2)，10–14=内政总览(0x423A3C..0x423B66 的 5 档)。
  // [确认] 5 档的判据：0x423A80 `cmp [ebp-4],9` / 0x423AB4 `,0x12` / 0x423AE8 `,0x1a`
  //        / 0x423B19 `,0x25`（=9/18/26/37），每档顺带换一张宫殿底图 PALAIS01..05，
  //        所以 5 档就是"势力规模 5 级"。规模取自我方城数：60 城正好被切成 5 段。
  // [推测] 数值来源 0x409c1d(0x4a64f0, 4) 未完全定位；用城数是 1..60 的单调量，
  //        与 9/18/26/37 的间距吻合（若以后定位到真实公式，只改 domesticTier 一处）。
  var DOMESTIC_TRACKS = [13, 10, 11, 12, 14];   // 档 1..5；13 最小城、14 最大城
  var DOMESTIC_CUT = [9, 18, 26, 37];
  var BGM_SCENE = { menu: '03', map: '17' };

  // ---------------------------------------------------------------- 战场底噪
  // [确认] SYSTEM.SO func #19 LoadingBattleMap（id=0x32 argc=1，@0x1D54）的 12 路分支：
  //        CASE 3 → syscall 0x301 播 "BG03A"；CASE 5 → "BG04A"；CASE 8 → "BG08A"；
  //        CASE 9 → "BG09A"；CASE 0/1/2/6/10/11 直接 RET，CASE 4/7 只调 EnterWar4/7。
  //        → **只有地形 3/5/8/9 有底噪，其余 8 个地形原作就是静音**。
  //        （CASE 8 顺带 CALL ProduceSnow 也反证 arg1 就是地形号；见
  //         export/script/system_so.dis.txt 与 project/83_音频核对.md）
  // [修正] 旧表按"材质分桶"给 12 个地形都配了底噪，是 [推测] 且与字节码不符：
  //        城 0/1/2、草原 4、山地 6、森林 7、關卡 10、長城 11 这八个地形原本什么都不播。
  var TERRAIN_AMB = ['', '', '', 'bg03a', '', 'bg04a', '', '', 'bg08a', 'bg09a', '', ''];
  // ---------------------------------------------------------------- BGM 曲库
  // 原作 17 首（mp3\01..17.mp3），本项目只装 10 首。**没有任何代码路径引用另外 7 首**：
  // Sango2.exe 的 18 个 PlayMusic 站点只请求 03/04/05/06/10..14/17（project/37c §3），
  // 本仓库 game/web + game/data + game/src 里也搜不到 01/02/07/08/09/15/16 的引用。
  // 所以这里不需要"死曲目改播对照组"的替换——它们根本没有调用点。逐首结论：
  //   死曲目：原作 01.MP3（68.4s）EXE 无 PlayMusic 站点，不装、无替代。
  //   死曲目：原作 02.MP3（92.3s）同上，EXE 无 PlayMusic 站点。
  //   死曲目：原作 07.MP3（122.0s）同上，EXE 无 PlayMusic 站点。
  //   死曲目：原作 08.MP3（124.1s）同上，EXE 无 PlayMusic 站点。
  //   死曲目：原作 09.MP3（126.1s）同上，EXE 无 PlayMusic 站点。
  //   死曲目：原作 15.MP3（115.2s）同上，EXE 无 PlayMusic 站点。
  //   死曲目：原作 16.MP3（129.9s）同上，EXE 无 PlayMusic 站点（结局要的是 18 号，17 首里没有）。
  // 若将来把这些曲子接进菜单/结局，直接在这里加 ['NN', '用途'] 即可，播放路径不用改。
  var BGM_ALL = [
    ['03', '菜单/忠诚度/招降'], ['04', '战斗·城2/船上/山地/長城'],
    ['05', '战斗·城1/平原/沙漠/關卡'], ['06', '战斗·城0/草原/森林/雪原'],
    ['10', '内政 档2'], ['11', '内政 档3'], ['12', '内政 档4'],
    ['13', '内政 档1'], ['14', '内政 档5'], ['17', '大地图']
  ];

  // ---------------------------------------------------------------- 路径
  var HERE = (function () {
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/[^/]*$/, '');
    return location.href.replace(/[^/]*$/, '');
  })();

  var CONF = {
    base: HERE + 'assets/audio/',
    crossfade: 300,   // ms
    bgmVolume: 0.45,
    sfxVolume: 0.8,
    ambienceDb: -9,   // 底噪比 BGM 低 9 dB（验收要求 8–10 dB）
    poolSize: 8,
    debug: false
  };

  var st = {
    index: null,
    indexP: null,
    muted: false,
    bgmName: null,
    bgmEl: null,
    ambName: null,
    ambEl: null,
    pool: [],
    poolI: 0,
    gestureBound: false,
    playing: 0,
    plays: 0,
    byName: {},
    dbgEl: null,
    // R52 脚本特效（0x12F 亮度 / 0x131+0x110 压暗括号）
    fxEl: null,
    fx: { dim: 16, open: false, flashes: 0 }
  };

  // ---------------------------------------------------------------- 小工具
  function log() {
    if (!CONF.debug || !root.console) return;
    var a = ['[audio]'].concat([].slice.call(arguments));
    console.log.apply(console, a);
  }
  function raf(fn) {
    if (root.requestAnimationFrame) return root.requestAnimationFrame(fn);
    return setTimeout(function () { fn(Date.now()); }, 16);
  }
  function now() {
    return (root.performance && performance.now) ? performance.now() : Date.now();
  }
  function abs(p) { return CONF.base + p; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /** 吞掉 play() 的 Promise：NotAllowedError 是自动播放策略，不是故障。 */
  function tryPlay(el, onBlocked) {
    if (!el) return;
    var p;
    try { p = el.play(); } catch (e) { return; }
    if (!p || !p.catch) return;
    p.catch(function (err) {
      var name = (err && err.name) || '';
      if (name === 'NotAllowedError') {
        log('自动播放被拦，等用户手势');
        if (onBlocked) onBlocked();
      } else {
        log('play 失败：', name, err && err.message);
      }
    });
  }

  // ---------------------------------------------------------------- index.json
  function loadIndex() {
    if (st.indexP) return st.indexP;
    st.indexP = fetch(abs('index.json'))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        st.index = j;
        log('index.json 就绪：' + Object.keys(j.sfx || {}).length + ' 个音效，'
          + Object.keys(j.bgm || {}).length + ' 首音乐');
        return j;
      })
      .catch(function (e) {
        log('index.json 读取失败，按内置表工作：', e && e.message);
        st.index = null;
        return null;
      });
    return st.indexP;
  }

  function aliases() {
    return (st.index && st.index.aliases) || ALIAS_FALLBACK;
  }

  /** 语义名 -> 具体音效名。'hit' -> 'hit01'；不认识的按原样返回。 */
  function sfxKey(name) {
    var n = String(name == null ? '' : name).toLowerCase().trim();
    if (!n) return '';
    var al = aliases();
    if (Object.prototype.hasOwnProperty.call(al, n)) return String(al[n]).toLowerCase();
    return n.replace(/\.mp3$/, '');
  }

  // ---------------------------------------------------------------- BGM
  function terrainTrack(i) {
    var idx = Number(i) || 0;
    var row = st.index && st.index.terrain && st.index.terrain[String(idx)];
    var track = row && row.track != null ? row.track : TERRAIN_TRACK[idx];
    if (track == null) track = TERRAIN_TRACK[0];
    return pad2(track) + '.mp3';
  }

  /** 势力规模 -> 0..4 档（0 最小）。判据见 DOMESTIC_TRACKS 上方注释。 */
  function domesticTier(owned) {
    var n = Number(owned);
    if (!isFinite(n) || n < 0) n = 0;
    var k = 0;
    while (k < DOMESTIC_CUT.length && n >= DOMESTIC_CUT[k]) k += 1;
    return k;   // 0..4
  }

  function domesticTrack(owned) {
    return DOMESTIC_TRACKS[domesticTier(owned)];
  }

  /** 地形索引 -> 底噪名（bg03a/04a/08a/09a）；该地形原作无底噪时返回 ''。 */
  function ambTrack(terrain) {
    var i = Number(terrain);
    if (!isFinite(i) || i < 0) i = 0;
    return TERRAIN_AMB[i % TERRAIN_AMB.length];
  }

  /** 技能音：技能编号（'016' / 16）-> 该技能的具体音效串；已是音效名时原样返回；查不到返回 ''（静默）。 */
  function magicSfx(seq) {
    var s = String(seq == null ? '' : seq).trim();
    // 已经是 mNNNsndNN 形态（magics.json 来的旧调用/调试直接传名）就原样用小写
    if (/^m\d{3}snd\d{2}$/i.test(s)) return s.toLowerCase();
    s = s.replace(/^0*(\d{1,3})$/, function (all, n) {
      return ('000' + n).slice(-3);
    });
    if (!s || s === '000') return '';
    return MAGIC_SFX[s] || '';
  }

  function terrainFromQuery() {
    var m = /[?&]terrain=(\d+)/.exec(location.search);
    return m ? Number(m[1]) : 0;
  }

  function ownedFromQuery() {
    var m = /[?&](?:owned|scale)=(\d+)/.exec(location.search);
    return m ? Number(m[1]) : 1;
  }

  /**
   * 接受：'terrain:N' / 'terrain' / 'battle' / 'menu' / 'map' / 'campaign'
   *       / 'domestic' / 'domestic:<我方城数>' / 4 / '04' / '04.mp3'
   */
  function resolveBgm(name) {
    var n = String(name == null ? '' : name).toLowerCase().trim();
    var m = /^terrain:(\d+)$/.exec(n);
    if (m) return terrainTrack(m[1]);
    var d = /^domestic(?::(\d+))?$/.exec(n);
    if (d) return pad2(domesticTrack(d[1] == null ? ownedFromQuery() : Number(d[1]))) + '.mp3';
    if (n === 'menu' || n === 'title') return BGM_SCENE.menu + '.mp3';
    if (n === 'map' || n === 'campaign') return BGM_SCENE.map + '.mp3';
    if (n === 'terrain' || n === 'battle' || n === '') return terrainTrack(terrainFromQuery());
    if (/^\d+\.mp3$/.test(n)) return pad2(parseInt(n, 10)) + '.mp3';
    if (/^\d+$/.test(n)) return pad2(parseInt(n, 10)) + '.mp3';
    return n + '.mp3';
  }

  function fadeTo(el, to, ms, done) {
    if (!el) return;
    var from = el.volume;
    var t0 = now();
    var span = ms == null ? CONF.crossfade : ms;
    (function step() {
      var k = span <= 0 ? 1 : clamp01((now() - t0) / span);
      el.volume = clamp01(from + (to - from) * k);
      if (k < 1) { raf(step); return; }
      if (to <= 0) { try { el.pause(); } catch (e) { /* ignore */ } }
      if (done) done();
    })();
  }

  var api = {};

  api.bgm = function (name, opts) {
    var file = resolveBgm(name);
    if (!file) return null;
    var el = st.bgmEl;
    if (el && st.bgmName === file) {
      if (el.paused) tryPlay(el);
      if (opts && typeof opts.volume === 'number') fadeTo(el, clamp01(opts.volume), 200);
      return el;
    }
    var old = el;
    var next = new Audio(abs('bgm/' + file));
    next.loop = true;
    next.preload = 'auto';
    next.volume = 0;
    next.muted = st.muted;
    st.bgmEl = next;
    st.bgmName = file;
    var target = clamp01(opts && typeof opts.volume === 'number' ? opts.volume : CONF.bgmVolume);
    tryPlay(next);
    // 上一首淡出并暂停，新的一首从 0 淡到 target（300ms 交叉淡入）
    if (old) fadeTo(old, 0, CONF.crossfade);
    fadeTo(next, target, CONF.crossfade);
    log('bgm -> ' + file);
    return next;
  };

  api.stop = function () {
    if (st.bgmEl) fadeTo(st.bgmEl, 0, CONF.crossfade);
    st.bgmName = null;
  };

  api.setBgmVolume = function (v) {
    CONF.bgmVolume = clamp01(v);
    if (st.bgmEl && !st.muted) st.bgmEl.volume = CONF.bgmVolume;
    if (st.ambEl && !st.muted) st.ambEl.volume = ambVolume();
    return CONF.bgmVolume;
  };

  // ---------------------------------------------------------------- 战场底噪
  function ambVolume() {
    return clamp01(CONF.bgmVolume * Math.pow(10, CONF.ambienceDb / 20));
  }

  /**
   * 环境底噪通道（与 BGM 平行的一条 loop，不进 SFX 池）。
   * 同名重复调用只保证在播、不改音量；换名则淡出旧的、淡入新的。
   */
  api.ambience = function (name, opts) {
    var file = String(name == null ? '' : name).toLowerCase().trim();
    if (!file) return null;
    if (!/\.mp3$/.test(file)) file = sfxKey(file);
    if (st.ambEl && st.ambName === file) {
      if (st.ambEl.paused && !st.muted) tryPlay(st.ambEl);
      return st.ambEl;
    }
    var old = st.ambEl;
    var next = new Audio(abs('sfx/' + file + '.mp3'));
    next.loop = true;
    next.preload = 'auto';
    next.volume = 0;
    next.muted = st.muted;
    st.ambEl = next;
    st.ambName = file;
    var target = clamp01(opts && typeof opts.volume === 'number' ? opts.volume : ambVolume());
    tryPlay(next);
    if (old) fadeTo(old, 0, 800);
    fadeTo(next, target, 800);   // 比 BGM 的 300ms 慢：底噪要"悄悄进来"
    log('ambience -> ' + file);
    return next;
  };

  /** 按地形取底噪（0..11）；该地形无底噪时确保不残留上一条。战斗结束用 stopAmbience() 淡出。 */
  api.battleAmbience = function (terrain, opts) {
    var name = ambTrack(terrain);
    if (!name) { api.stopAmbience(0); return null; }
    return api.ambience(name, opts);
  };

  api.stopAmbience = function (ms) {
    if (st.ambEl) fadeTo(st.ambEl, 0, ms == null ? 1200 : ms);
    st.ambName = null;
    st.ambEl = null;
  };

  // ---------------------------------------------------------------- SFX
  function nextSlot() {
    var pool = st.pool;
    if (pool.length < CONF.poolSize) {
      var el = new Audio();
      el.preload = 'auto';
      pool.push(el);
      st.poolI = pool.length % CONF.poolSize;
      return el;
    }
    st.poolI = (st.poolI + 1) % pool.length;
    return pool[st.poolI];
  }

  api.sfx = function (name, opts) {
    if (st.muted) return null;
    var key = sfxKey(name);
    if (!key) return null;
    var el = nextSlot();
    var vol = opts && typeof opts.volume === 'number' ? opts.volume : CONF.sfxVolume;
    if (el.__sgKey !== key) {
      el.__sgKey = key;
      el.src = abs('sfx/' + key + '.mp3');
    }
    el.volume = clamp01(vol);
    try { el.currentTime = 0; } catch (e) { /* 元数据还没到时忽略 */ }
    tryPlay(el);
    st.plays += 1;
    st.byName[key] = (st.byName[key] || 0) + 1;
    return el;
  };

  /** 技能音：参数是**技能编号**（'016' 虎咆震 -> m008snd01）；也接受 mNNNsndNN 原名。查不到静默返回 null。 */
  api.magic = function (seq, opts) {
    var key = magicSfx(seq);
    if (!key) return null;
    st.lastMagic = String(seq) + ' -> ' + key;
    return api.sfx(key, opts);
  };

  // ------------------------------------------------------------ 脚本特效（R52）
  // `MAGIC.SO` 里 0x12F 逐帧写亮度（16 → 7 → 16），0x131/0x110 是这对"压暗"的括号
  // （实测 HalfMoon @0x4738：SYSCALL 0x131 → CALL DownBrightness(12,5)）。
  // 这里只加一层黑色蒙版，不碰战斗视图：透明度 = (16-亮度)/16 × 0.62。
  function fxLayer() {
    if (st.fxEl) return st.fxEl;
    if (!document.body) return null;
    var d = document.createElement('div');
    d.id = 'sg-fx-dim';
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9000;'
      + 'background:#05070c;opacity:0;transition:opacity 90ms linear';
    document.body.appendChild(d);
    st.fxEl = d;
    return d;
  }

  /** 亮度 0..16（16 = 原色）。脚本每帧调一次，这里只改蒙版 opacity。 */
  api.dimScreen = function (level) {
    var lv = Number(level);
    if (!isFinite(lv)) lv = 16;
    lv = Math.max(0, Math.min(16, lv));
    st.fx.dim = lv;
    var el = fxLayer();
    if (el) el.style.opacity = String(((16 - lv) / 16) * 0.62);
    return lv;
  };

  /** 0x131（开）/ 0x110（关）：压暗期的括号。关的时候无条件恢复，避免卡在暗屏。 */
  api.flashScreen = function (on) {
    st.fx.flashes += 1;
    st.fx.open = !!on;
    if (!st.fx.open) api.dimScreen(16);
    return st.fx.open;
  };

  api.fxState = function () {
    return { dim: st.fx.dim, open: st.fx.open, flashes: st.fx.flashes };
  };

  /** 这个音效名在包里有吗？（index.json 未到时乐观返回 true） */
  api.has = function (name) {
    var key = sfxKey(name);
    if (!key) return false;
    if (!st.index || !st.index.sfx) return true;
    return Object.prototype.hasOwnProperty.call(st.index.sfx, key);
  };

  api.setSfxVolume = function (v) {
    CONF.sfxVolume = clamp01(v);
    return CONF.sfxVolume;
  };

  /** 预建音频池 / 预热指定音效（可选，不调也能用）。 */
  api.warm = function (names) {
    for (var i = 0; i < CONF.poolSize; i++) nextSlot();
    if (names && names.length) {
      for (var j = 0; j < names.length && j < CONF.poolSize; j++) {
        var el = st.pool[j];
        var key = sfxKey(names[j]);
        el.__sgKey = key;
        el.src = abs('sfx/' + key + '.mp3');
        try { el.load(); } catch (e) { /* ignore */ }
      }
    }
    return st.pool.length;
  };

  // ---------------------------------------------------------------- 静音 / 解锁
  api.mute = function (v) {
    st.muted = v === undefined ? !st.muted : !!v;
    if (st.bgmEl) st.bgmEl.muted = st.muted;
    if (st.ambEl) st.ambEl.muted = st.muted;
    for (var i = 0; i < st.pool.length; i++) st.pool[i].muted = st.muted;
    if (!st.muted && st.bgmEl && st.bgmEl.paused) tryPlay(st.bgmEl);
    if (!st.muted && st.ambEl && st.ambEl.paused) tryPlay(st.ambEl);
    return st.muted;
  };

  api.toggleMute = function () { return api.mute(); };

  /** 微信 / iOS：必须在用户手势里"点亮"一次音频，否则后续 play() 全被拦。 */
  api.unlock = function () {
    if (st.bgmEl && st.bgmEl.paused && !st.muted) tryPlay(st.bgmEl);
    if (st.ambEl && st.ambEl.paused && !st.muted) tryPlay(st.ambEl);
    // 顺手把 8 个音效槽建出来，第一次点击就不必等解码
    if (!st.pool.length) api.warm();
    log('unlock');
    return true;
  };

  function bindGesture() {
    if (st.gestureBound) return;
    st.gestureBound = true;
    var fire = function () { api.unlock(); };
    var opts = { once: true, passive: true, capture: true };
    if (document.addEventListener) {
      document.addEventListener('pointerdown', fire, opts);
      document.addEventListener('touchstart', fire, opts);
      document.addEventListener('keydown', fire, opts);
    }
  }

  // ---------------------------------------------------------------- 生命周期
  // 切后台暂停 BGM / 底噪（微信里最容易被忽略的一条：不暂停会一直占音频焦点）
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (st.bgmEl) st.bgmEl.pause();
      if (st.ambEl) st.ambEl.pause();
      return;
    }
    if (st.muted) return;
    if (st.bgmEl) tryPlay(st.bgmEl);
    if (st.ambEl) tryPlay(st.ambEl);
  });

  // ---------------------------------------------------------------- 调试 HUD
  // ?sfxdbg=1 -> 左下角 "sfx: N  last: xxx  bgm: 13.mp3  amb: bg04a"
  // ?bgmdbg=1 -> 再列一行"已装 BGM 曲目 + 当前曲"，给截图验收用
  var DBG_SFX = /[?&]sfxdbg=1/.test(location.search);
  var DBG_BGM = /[?&]bgmdbg=1/.test(location.search);

  function dbgText() {
    var names = Object.keys(st.byName).sort(function (a, b) {
      return st.byName[b] - st.byName[a];
    }).slice(0, 6).map(function (k) { return k + '×' + st.byName[k]; });
    var lines = [];
    lines.push('sfx: ' + st.plays + (names.length ? '  ' + names.join(' ') : ''));
    // R52：脚本侧（audio_bus）真正发出的事件数 —— 和上面 st.plays 对比就能看出
    // "VM 记了日志但没播"（旧行为）是不是真的变成了"播了"。
    var bus = root.SG && root.SG.audioBusStats ? root.SG.audioBusStats() : null;
    if (bus) {
      var top = Object.keys(bus.byName || {}).sort(function (a, b) {
        return bus.byName[b] - bus.byName[a];
      }).slice(0, 4).map(function (k) { return k + '×' + bus.byName[k]; });
      lines.push('bus: sfx ' + bus.sfx + ' · magic ' + bus.magic + ' · flash ' + bus.flash
        + ' · dim ' + bus.brightness + (top.length ? '  ' + top.join(' ') : ''));
    }
    lines.push('fx: dim ' + st.fx.dim + '/16' + (st.fx.open ? ' 压暗中' : '') + '  flash×' + st.fx.flashes);
    // R84：技能音"最后请求的名字"——证明请求的是具体串（m008snd01）而不是目录名（008）
    if (st.lastMagic) lines.push('magic: ' + st.lastMagic);
    lines.push('bgm: ' + (st.bgmName || '—') + (st.bgmEl && st.bgmEl.paused ? ' (paused)' : '')
      + '  vol ' + (st.bgmEl ? st.bgmEl.volume.toFixed(2) : '0')
      + '  amb: ' + (st.ambName || '—')
      + (st.ambEl ? ' vol ' + st.ambEl.volume.toFixed(2) : ''));
    if (DBG_BGM) {
      var installed = BGM_ALL.map(function (r) {
        return r[0] + (st.bgmName === r[0] + '.mp3' ? '▶' : '');
      });
      lines.push('BGM 已装 ' + BGM_ALL.length + '/17（懒加载 6.88 MB）: ' + installed.join(' '));
      // 曲目用途太长（10 首），每 3 首一行，截图里不会被裁掉
      var cells = BGM_ALL.map(function (r) { return r[0] + '=' + r[1]; });
      var rows = [];
      for (var i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3).join(' · '));
      lines.push('曲目: ' + rows.join('\n      '));
    }
    return lines.join('\n');
  }

  function dbgTick() {
    if (!st.dbgEl) return;
    st.dbgEl.textContent = dbgText();
  }

  function dbgBoot() {
    if (!DBG_SFX && !DBG_BGM) return;
    var d = document.createElement('div');
    d.id = 'sg-audio-dbg';
    d.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:9999;'
      + 'font:11px/1.35 ui-monospace,Consolas,monospace;color:#d7ffd7;'
      + 'background:rgba(0,0,0,.72);padding:4px 6px;border-radius:4px;'
      + 'white-space:pre-wrap;word-break:break-all;pointer-events:none;max-width:99vw';
    document.body.appendChild(d);
    st.dbgEl = d;
    dbgTick();
    setInterval(dbgTick, 400);
  }

  function boot() {
    bindGesture();
    dbgBoot();
    // 首帧之后再拉 index.json（几 KB），不阻塞首屏
    var go = function () { loadIndex(); };
    if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 3000 });
    else setTimeout(go, 400);
  }

  api.state = function () {
    return {
      base: CONF.base,
      muted: st.muted,
      bgm: st.bgmName,
      bgmPaused: st.bgmEl ? st.bgmEl.paused : true,
      amb: st.ambName,
      plays: st.plays,
      byName: st.byName,
      pool: st.pool.length,
      indexLoaded: !!st.index,
      sfxCount: st.index ? Object.keys(st.index.sfx || {}).length : 0,
      bgmCount: st.index ? Object.keys(st.index.bgm || {}).length : 0,
      fx: { dim: st.fx.dim, open: st.fx.open, flashes: st.fx.flashes }
    };
  };

  api.terrainTrack = terrainTrack;
  api.terrainName = function (i) { return TERRAIN_NAME[Number(i) || 0] || ''; };
  api.ambTrack = ambTrack;
  api.magicKey = magicSfx;
  /** R84：技能编号 -> 音效名的只读快照 + 最后一次解析结果，供 ?sfxdbg=1 与 tests/skill_sfx.test.ts 核对。 */
  api.magicTable = function () {
    var out = {};
    Object.keys(MAGIC_SFX).forEach(function (k) { out[k] = MAGIC_SFX[k]; });
    return out;
  };
  api.lastMagic = function () { return st.lastMagic || ''; };
  api.domesticTier = domesticTier;
  api.domesticTrack = function (owned) { return pad2(domesticTrack(owned)) + '.mp3'; };
  api.album = function () { return BGM_ALL.slice(); };
  api._loadIndex = loadIndex;

  SG.audio = api;

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})(typeof self !== 'undefined' ? self : this);
