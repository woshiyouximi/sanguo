# 100 · Cocos 内核再同步（`game/src/core` → `game/cocos/assets/scripts/core`）

- 日期：2026-11-25
- 执行：`v10-cocos-core-sync`（lead 的子 agent）
- 动因：Cocos 的 `core/` 是 web 真源的手工复制品，上一轮同步（`project/68_Cocos逻辑层重同步.md`）之后 web 侧又落了 R50/R67/气力/军师技/招降/援军，**微信版战斗还在用旧规则（技能放不出来）**。
- 结论：**6 改 / 1 增 / 0 删 / 9 未变**；6 个 `KEEP_PATCHES` 全部保住并逐条取证；`tsc -p tsconfig.check.json --noEmit` **exit 0**；`verify_core2.cjs` **118 条断言全过**（含任务书点名的 4 项）。

---

## 0 一页结论（数字）

| 指标 | 同步前 | 同步后 | web 真源 |
|---|---|---|---|
| core 文件数 | 15 | **16** | 16 |
| 总行数 | 9,593 | **11,750** | 11,725 |
| 总字节 | 390,458 B（381.3 KB） | **489,878 B（478.4 KB）** | 487,713 B（476.3 KB） |
| `tsc --noEmit` | exit 0 | **exit 0** | — |

- 行数差 `11750 − 11725 = 25` 行 = 6 处补丁的净增（`unlock.ts` +4、`wises.ts` +14/+3、`runtime.ts` +4）。**除补丁外与 web 逐字节一致**。
- 收尾时再跑一次 `--diff-only`：**16 个文件全部「相同 / 0 个有差异」**（脚本口径 = web 去掉导入扩展名 + 套上 6 处补丁 与 cocos 现状比）。原始 diff（`core2\diff_before.txt`，不含补丁归一化）里只剩 3 个文件、共 6 处补丁造成的差异：`runtime.ts` 3 hunk（K1/K2/K3）、`unlock.ts` 1 hunk（K4）、`wises.ts` 2 hunk（K5/K6）。
- 同步窗口内 web 又前进过一次：`roster.ts` 从 575 行涨到 688 行（R103「释放回原势力」，由并发的 lead/兄弟 agent 在 07:00 推入），我随后补同步并重跑了编译与抽查两关（结论未变：exit 0 / 118 条全过）。
- 本轮真正修掉的玩家可感知 bug：**气力公式**。`data/magics.json` 110 条的 `POWER` 全是 100（提取伪影），旧公式 `POWER × QI_COST_SCALE = 100 × 1200 = 120000` = 整整一条气力，而开局 `QI_START = 60000`，于是**任何技能恒「氣力不足」**。新公式按 `MP` 折算：命療術 `MP=20 → 20% × 1200 = 24000`，半条气力就能放。

---

## 1 差异清单

### 1.1 总账

- **改 6**：`audio_bus.ts`、`battle.ts`、`roster.ts`、`smartscript/syscalls.ts`、`syso_host.ts`、`wises.ts`
- **增 1**：`wises_effects.ts`（+ `.meta`）
- **删 0**（cocos 侧没有 web 已删除的文件）
- **未变 9**：`capture.ts`、`garrison.ts`、`march.ts`、`smartscript/so.ts`、`smartscript/vm.ts`、`strategy.ts`、`weather.ts`，以及**只差补丁**的 `smartscript/runtime.ts`、`unlock.ts`（这两份同步前就已经是「web + 补丁」的逐字节等价物，本轮不重写）

### 1.2 逐文件（行数/字节；`+/−` 是 web 相对 cocos 的行数，`−` 多为只存在于 cocos 的补丁行）

| 文件 | cocos 前 | cocos 后 | web | hunk | +/− | 说明 |
|---|---|---|---|---|---|---|
| `audio_bus.ts` | 592 / 22,010 | **769 / 31,194** | 769 | 3 | +178 / −1 | 新增 `MAGIC_SFX`(110 条)/`_GRADE`/`magicSfxName`/`magicSfxGrade`/`BATTLE_MAP_AMBIENT_OF`，`LoadingBattleMap` 改查表 |
| `battle.ts` | 1,648 / 72,419 | **2,136 / 95,737** | 2,136 | 14 | +503 / −15 | R50 ACTIVE 位掩码、R67 伤害走脚本、气力公式、`cast` 目标重定向、`hitRoll` 双击 |
| `roster.ts` | 201 / 8,447 | **688 / 28,308** | 688 | 14 | +119 / −6 | R85 招降决策（`SurrenderCard`/`surrenderCandidates`/`applySurrender`/`needSurrenderPanel`）+ R103 释放回原势力（`RELEASED`/`releaseFromPools`） |
| `smartscript/syscalls.ts` | 424 / 15,775 | **437 / 16,762** | 437 | 2 | +15 / −2 | `SyscallContext.damage?`，`0x125` 有注入走 `damage`、否则仍 `applyHpDelta` |
| `syso_host.ts` | 960 / 41,207 | **1,753 / 75,159** | 1,753 | 13 | +824 / −31 | 新增 `DamageHost`/`damageHostApply`/`DamageHostResult`（R67 的落地端） |
| `wises.ts` | 514 / 26,024 | **559 / 28,461** | 542 | 12 | +78 / −50 | `WiseKind` 加 `tire/loyal/dispel`，`WISE_UNIMPLEMENTED` 24→13，合流 `WISE_EXTRA_SPECS`；**含 K5(+14)/K6(+3)** |
| `wises_effects.ts` | 0 | **154 / 9,681** | 154 | 新增 | +154 | 疲勞/忠誠/勸降/化解 4 类军师技的实际效果 |
| `smartscript/runtime.ts` | 1,293 / 51,052 | 1,293 / 51,052 | 1,289 | 3（纯补丁） | +9 / −13 | 未改：K1/K2/K3 已在位 |
| `unlock.ts` | 442 / 20,085 | 442 / 20,085 | 438 | 1（纯补丁） | +1 / −5 | 未改：K4 已在位 |
| `capture.ts` | 556 / 21,483 | 556 | 556 | 0 | — | 已一致 |
| `garrison.ts` | 546 / 21,560 | 546 | 546 | 0 | — | 已一致 |
| `march.ts` | 176 / 6,687 | 176 | 176 | 0 | — | 已一致 |
| `smartscript/so.ts` | 251 / 7,472 | 251 | 251 | 0 | — | 已一致 |
| `smartscript/vm.ts` | 861 / 30,450 | 861 | 861 | 0 | — | 已一致 |
| `strategy.ts` | 1,044 / 41,529 | 1,044 | 1,044 | 0 | — | 已一致 |
| `weather.ts` | 85 / 4,258 | 85 | 85 | 0 | — | 已一致 |

新增的 `game/cocos/assets/scripts/core/wises_effects.ts.meta`（171 B，`uuid` = `69c0de7e-d2c0-484f-971e-c155fe9b033c`，`importer: typescript`，`ver 4.0.24`）——**本轮唯一新增的 `.meta`**，其余 15 个 `.ts` 本来就有。

### 1.3 新增/变化的导出面（file:line）

`battle.ts`
- `:387` `export type DamageChannel = 'script' | 'legacy';`（`World.damageChannel` / `damageFallbacks`）
- `:714` `ACTIVE_BIT`、`:726` `UNIT_STATUS`、`:740` `BattleBitDef`、`:757` `BATTLE_BITS`、`:808` `ACTIVE_LABELS`
- `:824` `activeMaskOf`、`:835` `activeHits`、`:843` `activeTargetCount`、`:862` `activeAim`、`:875` `statusBitOf`
- `:955` `legacyDamage`、`:975` `applyDamage`、`:1134` `damageLogOf`、`:1139` `damageErrorOf`、`:1144` `damageSoundsOf`
- `:1280` `hitRoll`（保留旧骰序：`status` 缺省 0 → 只掷一次）
- `:1673` `qiCostOf`（改公式）、`:1694` `qiPowerPercentOf`（新增）

`syso_host.ts`：`:1692` `DamageHostResult`、`:1715` `damageHostApply`、`:1730` `class DamageHost`
`roster.ts`：`:57` `RELEASED`、`:134/140` `releasedNames`/`isReleased`、`:186` `releaseFromPools`；`:302-342` 招降类型（`SurrenderDecision` 含 `'release'`）、`:404` `kingsInScenario`、`:522` `surrenderCandidates`、`:566` `needSurrenderPanel`、`:589` `applySurrender`
`wises_effects.ts`：`:77` `applyExtraSpec`、`:111` `WISE_EXTRA_SPECS`、`:142` `WISE_STRATEGY_ONLY`、`:150` `WISE_SYSO_UNSUPPORTED`
`audio_bus.ts`：`:125` `MAGIC_SFX`、`:239` `MAGIC_SFX_GRADE`、`:257` `magicSfxName`、`:267` `magicSfxGrade`、`:708` `BATTLE_MAP_AMBIENT_OF`
`smartscript/syscalls.ts`：`SyscallContext.damage?(handle, amount, src)` —— `runtime.ts` 不注入（法术路径逐位不变），`battle.ts` 注入（普攻走脚本）

---

## 2 六个 KEEP_PATCHES 的证据（同步后实测，`Select-String` 逐条命中）

同步脚本 `F:\sanguo\work\cocos_sync\sync_core2.mjs` 的规则：每条补丁的 `from` 必须**恰好命中 1 次**，否则抛错；命中数写进 `manifest.csv` 的 `keep_patches` 列（= 实际 apply 结果，不是声明）。本轮 6 条锚点全部命中，`runtime.ts`/`unlock.ts` 因此判为 `same`。

**K1 — `import.meta` 不能出现在 Creator 产物里**
`game\cocos\assets\scripts\core\smartscript\runtime.ts:57`
```ts
const DATA_URL = new URL('data/', 'https://cocos.local/');
```
（`:51-56` 是 5 行中文注释说明「System.register 函数体里 `import.meta` 是非法语法，rollup 直接判死」）
→ 该常量只给同步 XHR / `node:fs` 兜底分支用；Cocos 真正走预加载：`BootRoot.ts:28 import { preloadMagicProgram } from './shim/host';`、`BootRoot.ts:131 const magicOk = await preloadMagicProgram();` —— **启动链已接线，法术不会因为假 URL 退化**（抽查 1/3/8 全部跑通即为证据）。

**K2 — 音频 import 必须指 `../../AudioBus`**
`game\cocos\assets\scripts\core\smartscript\runtime.ts:29`
```ts
import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../../AudioBus';
```
（`:27-28` 注释：指向 `../audio_bus` 会另建一个模块实例，`AudioHost` 只认 `assets/scripts/AudioBus.ts` 那个实例，声音不响）
→ web 原文是 `from '../audio_bus.ts'`（带扩展名），同步脚本先去扩展名再套补丁，故仍命中。

**K3 — `emitSfx` 载荷要削成 Cocos 口径**
`game\cocos\assets\scripts\core\smartscript\runtime.ts:898`
```ts
emitSfx({ name, volume, source: 'script' });
```
（`:896-897` 注释：`AudioBus.SfxInput.unit` 只收 `Unit` 对象用于 3D 定位，脚本的 `unit` 是槽位序号；`source`/`clock` 也只有 web 版 bus 认；上一行 `this.soundsEmitted++` 保留未删）

**K4 — `[...set]` 会被 Babel loose 编成 `[].concat(set)`**
`game\cocos\assets\scripts\core\unlock.ts:108`
```ts
return Array.from(out).sort((a, b) => a - b);
```
（`:104-107` 四行注释解释 loose spread 会把兵种/阵形白名单整排误判成「未学」）

**K5 — Cocos 的 `WISESKILL` 是整串 `"39, 54"`**
`game\cocos\assets\scripts\core\wises.ts:400` + `:408`
```ts
export function parseWiseSkill(general: General): Array<[number, number]> {
  ...
  const tokens: string[] = typeof raw === 'string'
    ? raw.split(/[,\s]+/).filter((s) => s.length > 0)
    : [];
```
（`:403` 按 `unknown` 取 `raw`；`:410-415` 两两配对成 `"a,b"` 行；`:416` `if (rows.length === 0) return [];`；`:418` `for (const row of rows)`；`:425` 行内再 `split(/[,\s]+/)`）
→ 数据侧已核实：`assets/bundles/res/data/generals.json` 的關羽 `WISESKILL` 就是字符串 `"39, 54"`。

**K6 — `[...map.values()]` 同理**
`game\cocos\assets\scripts\core\wises.ts:472`
```ts
return Array.from(best.values()).sort((a, b) => a.learn - b.learn).map((v) => v.seq);
```
（`:469-471` 三行注释：loose spread 下迭代器不展开，运行期回传 `[undefined]`，UI 显示「技 undefined」）

**附：K1–K6 之外还核过的两件事**
- 目标树 `core/` 下 `import.meta` **0 处**，`from './x.ts'` 这种带扩展名导入 **0 处**（Creator 的 `moduleResolution` 不吃扩展名）。
- `core/` 下 16 个 `.ts` 都有 `.meta`。

---

## 3 行为等价抽查（实测数字，`verify_core2.cjs`，118 条断言全过）

跑法不是浏览器、也不是 Creator：用 `tsconfig.sim2.json` 把 `core/**` + `AudioBus.ts` 编成 CommonJS 到 `_sim2/`，node 直接 `require`；MAGIC.SO 用全局 `location`/`fetch` stub 模拟 `shim/host.ts` 的预加载，再 `await initMagicProgram('data/')`。

**任务书点名的 4 项**

| 项 | 实测 |
|---|---|
| `qiCostOf` 对命療術（SEQ 1） | **24000**（`{NAME:'命療術', MP:20, POWER:100, ACTIVE:'我方主將'}`；`qiPowerPercentOf = 20`；旧公式 `100 × 1200 = 120000`；`QI_MAX=120000`、`QI_START=60000`） |
| `requestRetreat` 能跑 | 首次 `true`、`fled = {A:true, B:false}`、`status.A = 2`、二次 `false`、该侧全员 `flee=true`、`endReason = retreat winner=B ticks=193` |
| `planStrategy` 非空 | `pickStrategySeq(關羽, 60) = 54` → `{side:'A', seq:54, exec:44, kind:'ambush', name:'十面埋伏'}`；`runStrategy.text = 「敵將騎黃鬃馬，破解我方埋伏。」`；`strategyUsed.A = 54` |
| `chance` / `hitChance` 不 NaN | 全场 120×120 对位 `hitChance` 全为有限数（样例 239/300）；`hitRoll = true`；`captureChance = 0.675`；`recruitChanceOf = 0`；`canRecruit().chance = 0`。注：core 里没有裸 `chance` 导出，对应 `SurrenderCard.chance`（程遠志卡片 `chance = 1, tier = 'must', recruitable = true`，理由「忠诚 16 < 25：必降，不掷骰」） |

**其余 11 组**

| 组 | 实测 |
|---|---|
| 气力边界 | `{POWER:50}→50`、`{POWER:100}→40`（MP 缺失）、`{POWER:100,MP:200}→80`（夹上限） |
| `cast()` 端到端 | `cast(w,'A',1,5,7)` → `{"ok":true,"killed":0,"healed":49,"mp":80,"qi":36000}`；主将 hp 40→89（maxHp 96）、气力 60000→36000、技力 100→80 → **技能真的放出来且真的回血** |
| R67 脚本伤害 | `damageChannel='script'`；`applyDamage(w,victim,7)=7`、hp 85→78；`damageLogOf = [{"handle":4194425,"amount":-7,"src":0,"applied":-7,"killed":false}]`；`damageErrorOf = null`；`damageFallbacks = 0`；legacy 通道 hp 85→78、log 0 |
| R50 ACTIVE 掩码 | `我方主將→2`、`敵方士兵→4`、`敵我全軍→15`、无字段→0；`activeHits(2,'A','B',true)=false` / `(2,'A','A',true)=true`；`activeTargetCount(2)=1`、`(4)=60`；`activeAim(mask 2, tx=5) → {x:57, y:6.5}`（改成己方主将位）、`tx=60 → {60,7}` 原样、`mask 0xc tx=5 → {5,7}` 原样；B 侧全灭后落月弓（ACTIVE 敵方主將）→ `{"ok":false,"reason":"no-target"}` 且气力未扣；`statusBitOf({status:4},4)=true` |
| ACTIVE 文案覆盖 | 110 条 `magics.json` **全部**能映射到非零掩码（0 条未识别）；实际只用 7 种文案：`我方主將 2 / 敵方主將 6 / 敵方士兵 14 / 敵方全軍 72 / 我方士兵 7 / 敵我全軍 6 / 敵我士兵 3` |
| 军师技 `parseWiseSkill` | `{WISESKILL:'39, 54'} → [[39,54]]`；`[[1,6]] → [[1,6]]`；`listWisdomChoices(關羽, lv60) = [54]` |
| 军师技生效 | `applyWise 4` → 疲勞 +5（`kind='tire'`，note「敵將疲勞 +5」）；`6` → 忠誠 47；`24` → `army.B.seq = null`；`32`（忠誠 95）→ `{"ok":false,"kind":"loyal","note":"條件不滿足，未生效"}`；`9999` → 「未實作或未知的軍師技」 |
| 军师技清单 | `WISE_UNIMPLEMENTED` 13 条 `[3,10,15,23,26,28,29,30,31,33,44,59,62]`；`WISE_STRATEGY_ONLY` 12 条 `[10,15,23,26,28,29,30,31,33,44,59,62]`（经 `wises.ts` 再导出）；`WISE_EXTRA_SPECS` 11 条 `[4,5,6,24,25,27,32,34,50,51,55]` |
| 招降 | `needSurrenderPanel = true`；`applySurrender` 选 kill → `{"recruited":[],"killed":["程遠志"],"removed":["程遠志"],"escaped":[],"released":[],"rejected":[],"cleared":["程遠志"]}`（`released` 是 R103 之后新增的桶） |
| 援军 | `reinforce:[{side:'B',troops:40,delayTicks:30,triggerRatio:1}]` → 5 tick 后 `arriveTick=31 / scheduled=true`、45 tick `arrived=true`、单位 122→162、战报两条（「援軍自鄰城出發，30 刻後抵達（40 人）」「援軍抵達！鄰城 兵 40 人入場」） |
| 音效表 | `MAGIC_SFX` 110 条；`magicSfxName(1) = 'm016snd01'`（grade `A`）；`'038' → 'm040snd01'`（grade `A2`）；`9999 → ''`；`callSystemSo('LoadingBattleMap',[3]) → ['bg03a']`（1 条）、`[4] → 0 条` |
| `0x125` 伤害 syscall | 注入 `ctx.damage` → `damage(7,50,0)`；未注入 → `applyHpDelta(9,30)`（法术路径不变） |
| unlock / settle | `unlockedTroops` 13 项、`unlockedFormations` 9 项（全 boolean）、`troopsOf(關羽)=[0]`；3 胜/3 连胜/最佳 3、`settle` 幂等、整场 `damageFallbacks = 0`（普攻伤害全程走脚本通道） |

> 环境噪音：`node verify_core2.cjs` 的 stderr 会打一条 `[smartscript] 占位 syscall 0x135（视觉表现未复现）`（命療術脚本里的一条占位 syscall，warn 级、不影响结果）。PowerShell 里加 `2>&1` 会把它变成 `NativeCommandError` 让外层看到 exit 1，**实际 `$LASTEXITCODE = 0`** —— 判退出码不要加 `2>&1`。

---

## 4 编译关口

```
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
# 同步前：EXIT=0（旧 core 自洽）
# 同步后（6:56，roster 还是 575 行）：EXIT=0
# 补同步 roster 688 行后（7:0x，最终态）：EXIT=0   ← 含新增 wises_effects.ts、以及 BattleRoot/CampaignRoot/CityPanel/ItemsPanel 等全部 assets/scripts
```
`tsconfig.check.json` 的 `include` 是 `assets/scripts/**/*.ts` + `types/cc.engine.d.ts`，所以 **K2/K3 的签名兼容性是编译期证明的**（`AudioBus.ts` 与 `core/smartscript/runtime.ts` 在同一个 program 里），不是靠人眼。另：`CampaignRoot.ts`（禁改，别人的）在 07:00 也被并发改过，最终态 tsc 仍是 0，说明没被我碰的那半边也是绿的。

---

## 5 没同步 / 没做的部分与原因

1. **未跑 Creator 构建、未在微信真机打一局** —— 任务书禁止跑 `tools\build_wechat.ps1` 与 CocosCreator（构建归 lead）。因此「微信里技能真的能放出来」目前是**源码 + node 行为**级证据，不是真机证据。
2. **K4/K6 的 Babel loose 症状无法在 node 侧复现** —— 验证跑的是 `tsc --module commonjs` 产物（`_sim2/`），不是 Creator 的 `System.register` + Babel loose 产物。node 只能证明「源码语义正确」，证明不了「打包后也正确」；后者靠的是「这几行已经不写 `[...set]`/`[...iterator]`」这条静态事实。
3. **`runtime.ts` 里还有 4 处迭代器展开没加 `Array.from`**（同类风险，非 KEEP_PATCH）：
   - `:581` `unimplemented: [...this.unimplemented].sort(...)`（Set）
   - `:592` `if (this.healTargets.size) this.log.push(\`治疗目标 ${[...this.healTargets].join(',')}\`)`（Set）
   - `:601` `return [...this.objects.values()]...`（Map values，`objectSummaries()`）
   - `:1148` `const arr = [...this.objects.values()].slice(0, 12);`（`dumpObjects()`）
   四处**全是诊断/日志出口**（`RunSkillResult.stats.unimplemented`、技能日志、`objects` 概览、`dumpObjects`），不影响伤害/命中/结算。本轮未改：它们不在 6 条白名单里，硬改会让下一轮同步又判成「有差异」；要固化得把 `K7` 加进 `sync_core2.mjs` 的 `KEEP_PATCHES`。**建议 lead 决定是否升级为 K7**（代价：多一条本地偏离；收益：真机调试面板不显示 `[object Set]`）。
4. **`learnTableOf(data,'關羽','WISESKILL') = []`** —— `unlock.ts` 的 `for (const item of raw as unknown[])` 会把整串 `"39, 54"` 逐字符拆开，与 K5 是**同一类数据形态问题但没被列进 KEEP_PATCHES**；web 真源同缺陷。已 grep 确认 learn 表 API（`learnTableOf`/`createLearnState`/`pendingLearn`/`onLevelUp`/`monthlyLearnCheck`/`applyLearn`）在 Cocos scripts 与 web **都只有 `unlock.ts` 自引用、无任何外部调用者** → 本轮不补（要修必须两边同改，而 `game/src` 本轮禁改）。若将来接「升级学技」面板，这里会先炸。
5. **两份音频实现并存依旧**（`project/68` §6② 遗留未动）：`core/audio_bus.ts`（web 真源副本，含新的 `MAGIC_SFX` 110 条）**不被任何 Cocos 代码引用**——K2 让脚本走 `assets/scripts/AudioBus.ts`，而 `AudioHost.ts:58` 自带一份 `MAGIC_SFX`（`fx_dir` → 资源名）、`AudioBus.ts:479` 自带一份 `BATTLE_MAP_AMBIENT_OF`。净效果：`core/audio_bus.ts` 目前只参与 tsc 类型检查，**新增的音效表在微信侧还没有消费者**。
6. **新 API 还没有 UI 消费者**：ACTIVE 掩码、招降卡片（`surrenderCandidates`/`applySurrender`）、援军（`reinforce`）在 Cocos 侧没有面板/战报接线。`BattleRoot.ts`/`CampaignRoot.ts`/`CityPanel.ts`/`ItemsPanel.ts` 本轮**禁改**（在别的 agent 手里），tsc exit 0 只证明「类型兼容、能编过」，不证明「UI 已经用上」。
7. **未做产物体积/帧率测量**（无构建，同上）。
8. `project/68` §6 ⑤（HUD 只显示 `world.log` 最后一条）、③（`AudioBus.ts:394` 的 `yell0${1 + (Math.abs(...) % 4)}` 缺 `| 0`）本轮未动：都不在允许的改动面内或不属于 core。
9. **并发写窗口**：同步期间 `game/src/core/roster.ts` 被并发 agent 从 575 行推到 688 行（R103），`CampaignRoot.ts` 也在 07:00 被改。roster 我已补同步并重跑两关；但**如果 lead 在我交回之后再改 `game/src/core/**`，这些改动不会自动进 Cocos**——需要再跑一次 `node sync_core2.mjs`（幂等，只会写有差异的文件）再跑两关。

---

## 6 复现步骤

```powershell
# 1) 差异清单 + 同步（幂等：相同的文件不重写）
cd F:\sanguo\work\cocos_sync
node sync_core2.mjs --diff-only     # 只出 manifest.csv / diff_before.txt / parts\*.diff
node sync_core2.mjs                 # 写盘；输出「写入 N / 已一致 M / 多出 K」

# 2) 编译关口（必须 exit 0）
cd F:\sanguo\game\cocos
node ..\node_modules\typescript\bin\tsc -p tsconfig.check.json --noEmit
echo "EXIT=$LASTEXITCODE"

# 3) 行为抽查（先编译到 _sim2，再跑断言）
cd F:\sanguo\work\cocos_sync
node F:\sanguo\game\node_modules\typescript\bin\tsc -p tsconfig.sim2.json
node verify_core2.cjs      # 期望：EXIT=0、末尾「断言 118 条全过」；日志 verify_core2.log

# 4) 自检：再跑一次 --diff-only
node sync_core2.mjs --diff-only
# 期望输出：文件 16：相同 16 / 有差异 0 / cocos 缺 0 / cocos 多出 0
#           （脚本口径 = web 套上 6 处补丁后与 cocos 比；原始 diff_before.txt 里仍有 3 个文件 6 处补丁差异）
```

产物：
- `F:\sanguo\work\cocos_sync\sync_core2.mjs`（同步器，451 行，KEEP_PATCHES 白名单在 `:45-157`）
- `F:\sanguo\work\cocos_sync\tsconfig.sim2.json`（CommonJS 编译配置，outDir `_sim2/`）
- `F:\sanguo\work\cocos_sync\verify_core2.cjs`（409 行，12 组 118 条断言）
- `F:\sanguo\work\cocos_sync\core2\manifest.csv`、`core2\diff_before.txt`、`core2\parts\*.diff`、`verify_core2.log`
- `core2\roster.575.bak.ts`：补同步前的 575 行旧 `roster.ts`（回滚用；确认无问题可删）

---

## 7 遗留风险（含 `[推测]`）

- `[推测]` **真机未验证**。全部结论止于「源码正确 + node 行为正确 + tsc 通过」。微信侧仍然可能出现：Creator 的 Babel 对 `async/await`、可选链、`WeakMap` 的降级差异；以及 `magic_so.bin` 在真机文件系统上的读取差异（`shim/host.ts` 的路径拼法）。
- `[推测]` **性能**：R67 之后每一次普攻伤害都要 `ScriptVm.runByName('Hurt', ...)`。node 上整场（193~300 tick、数千次普攻）无异常、`damageFallbacks=0`，但微信小游戏 CPU 弱，**建议 lead 真机首局看帧率**；万一卡，`createWorld({ damageChannel: 'legacy' })` 是现成的回退开关（不需要改代码）。
- `[推测]` `damageChannel` 默认 `'script'`。若某些机型上 Hurt 脚本抛错，`applyDamage` 会 `damageFallbacks++` 并降级到 `legacyDamage`（行为仍正确），但错误只落在 `damageErrorOf(world)` 里、UI 不显示 —— 真机若出现「伤害数字正常但技能特效异常」，先查这个值。
- `[推测]` `activeAim` 把「点错半场」重定向成己方主将位（原作语义）。如果将来 UI 自己先 clamp 目标，两者不冲突（`activeAim` 只在掩码里没有该方位时才动手）；但如果 UI 依赖「点哪打哪」，观感会变。
- `[推测]` `core/audio_bus.ts` 与 `AudioBus.ts`/`AudioHost.ts` 三份音效表会继续漂移：本轮 `core/audio_bus.ts` 新增 110 条 `MAGIC_SFX`，而 `AudioHost.ts:58` 那份是 `fx_dir` 口径的另一张表，两边**没有校验**。下次谁改音效，记得两个地方一起改。

---

## 附录 A · 一页索引

- 补丁锚点：`core/smartscript/runtime.ts:29`(K2) `:57`(K1) `:898`(K3)；`core/unlock.ts:108`(K4)；`core/wises.ts:400/408`(K5) `:472`(K6)
- 气力修复：`core/battle.ts:1673` `qiCostOf`、`:1694` `qiPowerPercentOf`
- 伤害通道：`core/battle.ts:387`(类型) `:955`(legacy) `:975`(applyDamage) `:1280`(hitRoll)；`core/syso_host.ts:1730` `DamageHost`
- ACTIVE 掩码：`core/battle.ts:714-875`
- 军师技效果：`core/wises_effects.ts:77/111`；`WiseKind` 扩展在 `core/wises.ts` 头部
- 招降/释放：`core/roster.ts:57` `RELEASED`、`:186` `releaseFromPools`、`:522` `surrenderCandidates`、`:566` `needSurrenderPanel`、`:589` `applySurrender`
- 启动预加载：`assets/scripts/BootRoot.ts:28/131` → `assets/scripts/shim/host.ts`
