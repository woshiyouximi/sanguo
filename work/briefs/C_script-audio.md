# C · 脚本特效/音效落地 + 战场音效触发（R52 / R80 / R79 起头）

目标：武将技/军师技脚本跑 `MAGIC.SO` 字节码时，`syscall` 里的**画面特效和音效现在只记录不播**（`project/37a` R52 ❌8h、R80 ❌4h）。让它们真的播，并且能测。

## 环境
- 根 `F:\sanguo`。服务已跑：`http://127.0.0.1:5173/web/campaign.html`，战斗页 `index.html?sim=120&freeze=1&terrain=0`。
- 改 `game/src/**` 后：`cd F:\sanguo\game; npm.cmd exec -- tsc -p tsconfig.build.json`，再 `npm.cmd exec -- tsc --noEmit`。
- 测试：`cd F:\sanguo\game; node --test tests/smartscript.test.ts tests/smartscript.session.test.ts`（全量 3.5 分钟，收工前跑一次）。
- 没有 git。

## 你拥有的文件
`game/src/core/smartscript/runtime.ts`、`syscalls.ts`、`vm.ts`、`so.ts`、`game/src/core/audio_bus.ts`（新建）、`game/web/audio.js`、`game/web/main.js`（**只准加音效/特效 sink 接线，不许重构、不许动其它逻辑**）、`game/tests/smartscript_audio.test.ts`（新建）、`work\sfx_*/**`、报告 `project/51_脚本音效.md`（新建）。
**不要改** `battle.ts`、`battleView.ts`、`campaign.html`、`city_model.js`、`project/37a|31|44`。需要 core/view 开钩子就写进报告的"接线说明"。

## 先核对
- 现有 `syscalls.ts` / `runtime.ts` 里 syscall 的"记录"路径（37a 说只记录不播）；`game/web/audio.js` 已有 `SG.audio.sfx(name,{volume})`、`magic('016')`、`battleAmbience(n)`。
- `main.js:96-115` 已有一段命中音效节流逻辑（`AUDIO_TERRAIN`/`SFX_TICK_MAX`/`SFX_GAP_MS`/`resetBattleAudio`）——R80 可能已经部分做了，先确认再说。
- 原作依据：`docs/04d`、`docs/04b*`、`tools/ss_syscalls.py` / `ss_systable.py` 生成过 syscall 表（先跑或读它们的输出），以及 `work/a_so_sfx*.py`、`work/probe_sfx_usage.py` 这些前人脚本。

## 任务
1. **R52 特效/音效真的播**：脚本 syscall（音效、屏幕震动、闪光、天气、延时等）在浏览器里生效。
   - 做法：core 侧建 `game/src/core/audio_bus.ts`：`setSfxSink(fn)` / `setFxSink(fn)` / `emitSfx(name, opts)`；runtime 里把"记录"改成"记录 + emit"。
   - `main.js` 里装 sink：`setSfxSink(n => window.SG?.audio?.sfx(n))`、`setFxSink(...)`（震动/闪光可以用 canvas transform 或一个 overlay div，最小实现）。
   - 音效名 → 资源的映射放 `audio.js`（已有 index.json），不许在 core 里写死文件路径。
2. **R80 战场音效触发点**：原作 `0x43E07C` 普攻命中 `HIT01`、`THINGS.INI` 里 `$Hit01`（受伤 120 处）/`$Defense`（格挡 120 处）。现在只有命中一处。补齐：命中/受击/格挡/阵亡/撤退/技能起手 六类，走同一个节流器（别把 100 人混战炸成噪音，现有节流规则保留并可调）。
3. **R79 起头**：`SYSTEM.SO` 的 39 个函数目前全仓零命中。**不要求全实现**：先产出 `work\system_so\map.md`——39 个函数的地址/名字/参数/被谁调用/能否找到行为证据（用 `tools/ss_*.py` 那套），然后把**能确定的最便宜 5 个**（如音效、等待、天气、屏震）实装并测。
4. **测试**：`smartscript_audio.test.ts` 用假 sink 断言：跑一段真实 MAGIC.SO 字节码会按顺序 emit 预期的 `{sfx, fx}` 事件（拿 `magic_so.bin`+`symbols` 里的真技能，别自己编字节码）。

## 验收
- `node --test tests/smartscript*.test.ts` + 新测试全 pass；全量跑一次报数字。
- `tsc --noEmit` exit 0。
- 浏览器证据：`?sfxdbg=1` 打开后跑一局放技，左下角计数变化；截图 `work\sfx_dbg\*.png`；能录到事件序列更好（console 日志贴报告里）。
- 报告：每条 `改动 file:line` / `原作依据` / `测试名` / `等级`；`[推测]`/`[新设计]` 标注；`main.js` 的改动必须逐行列出来（这是共享文件）。
