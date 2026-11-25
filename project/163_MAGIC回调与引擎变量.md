# 163 MAGIC 回调与引擎变量

收掉 `project/159_并发脚本实例与补兵.md` 留下的三个 `[未解]`。结论先说：

| 缺口 | 状态 | 决定性数字 | 证据 |
| --- | --- | --- | --- |
| ① 神鬼亂舞(104) 退化成单体 | **已修**：接上 `obj[+0x98]` 物件碰撞回调 | 主段探针 `hits=26`、B 主将 `101→41`、`CALL Hurt` 21 次；金标准断言已恢复 `>= 3` | `magic_so.dis.txt:11940-11951` / EXE `0x40AA82..0x40ABC5` |
| ② seq 3 的 230 音量 | **地址级结论：原作也打不出** | seq 3 = `[200]`；seq 18 = `[200,230,230]`；seq 26 = `[200,230,230,230,230]` | `magic_so.dis.txt:33416-33420`（`Magic4` = `PUSHI 0; CALL Spout`）、`:20222-20224`（230 在 `CreateSpoutAround` 主循环体内） |
| ③ G5 阵营 | **已修**：`side === 'A' ? 0 : 1` | A=0、B=1，两条测试钉住；110 条 110/110 无退化 | `0x43BA59` @ `0x43BAA2-0x43BAB7` |

七条验收全部拿到数字（§2）。全量测试 **1354 / 1354 pass / 0 fail**（基线 1318，本单新增 `tests/magic_callback.test.ts` 7 条，其余增量是并行的另一个 agent 新增的测试）。

---

## §1 三个缺口各怎么做的

### 1.1 缺口①：神鬼亂舞的多目标伤害走物件碰撞回调

**原作机制（地址级）**

1. `DemonDancing`（`func #149 @0x14DE8`，`magic_so.dis.txt:11999-12362`）主段循环 20 次 + 收尾 1 次，每次用 `SYSCALL 0x314` 调 `LockTargetXY`（`func #16 @0xFF8`，`magic_so.dis.txt:649-677`）。压栈序 `PUSHS "LockTargetXY", x±96, y, 2501, loc7, 2, 14001, 0, 0, 50331648`（`:12161-12175`）。
2. `LockTargetXY` 里 `0x11` 造一个资源 2501 的物件，然后 **`0x2C(loc1, arg4)`** ⇒ handler `0x420291`（`export/script/syscall_handlers.asm.txt`）`mov [obj+0x98], arg2` ⇒ **`obj[+0x98] = 14001`**。14001 = `0x36B1` = `DemonDancingCallback`（`func #147 @0x14C70`，`magic_so.dis.txt:11940-11951`）的函数号。
3. `DemonDancingCallback` 体：`LDSL arg2; LDSL arg1; LDSG g16; CALL Hurt` ⇒ `Hurt(dmg=g16, victim=arg1, src=arg2)`，`g16==20` 时复位 0（末击）。
4. 引擎侧碰撞站点 **`0x40AA82..0x40AC79`**（`work/battle_audit/` 反汇编，`work/magic_cb/scan_obj98.py` 可重跑）：
   - `0x40AA8E` `cmp [obj+0x10], 0x600000; jl` ⇒ 只有 `obj.z < 96` 才判碰撞；
   - `0x40AAB8` `0x43A51D(x,y)` 像素→格（`/96`, `/72`），`0x40AAC8` `0x43AF7A(gx,gy)` 取该格上的单位；
   - `0x40AB54` `obj[+0x30] & 关系掩码`，为 0 返回；
   - `0x40AB94` `cmp obj[+0x98], 0`，非 0 才继续；
   - `0x40ABC5` `call 0x41f740`，压栈 `[ebp-4]`（该格单位记录）、`obj[+0x98]`、`0x421ad2(obj)`、`0x421ad2(locc)` ⇒ 回调 2 实参 = `(受害主将句柄, 物件句柄)`。
   - `0x41F740(scriptId, …)` 本体 = `0x4650E0(0x421AD2(arg1), arg2, arg3..)`，而 `0x4650E0` 从 `arg3` 起**前向**拷进新帧 ⇒ 脚本 `arg1` = **最后**一个实参。
   - 顺带更正 `project/154 §7`：`0x41F740(argc=5)` 的第 5 实参**不是**回调句柄，它是"以 arg2 的脚本号跑 argv[3..6]"的运行器；回调号来自物件字段。

**端口实现（file:line）**

- `game/src/core/smartscript/syscalls.ts:53-62`：`SkillObject.param98` 注释改为「物件碰撞回调脚本号」，并新增 `cbDamage?: number`（挂回调那一刻的 `g16`；端口碰撞结算是整条施法跑完后批量做的，"每击伤害"必须冻结）。
- `syscalls.ts:396-406` `case 0x02c`：`o.param98 = a(1); o.cbDamage = Math.max(0, ctx.instanceHitDamage?.() ?? 0);`（`instanceHitDamage` 声明在 `:117`，实现 `runtime.ts:1142-1144`）。
- `syscalls.ts:465-486` `case 0x113`：格→单位时先 `unitAtPx`，再经 `ctx.generalOf` 折算成主将（原作格表存"部队记录"，各处读 `unit[+0x44]` 拿主将）。
- `syscalls.ts:107/113/127`：`SyscallContext` 新增 `generalOf?` / `globalGet?` / `unitsInRect?` / `instanceHitDamage?`。
- `runtime.ts:1254-1330` **新增 `collideCallbacks()`**（照 `0x40AA82..0x40ABC5`）：
  - 物件位置用 `posOf(handle)` 外推（`0x15` 设过速度的飞行体不能钉在出生点），`z >= 96` 跳过；
  - 每帧用 `cbPrev`（`runtime.ts:311-313`）记录上一帧像素位置，从上一帧到本帧按 48px 采样，逐点 `unitAtTile(gx,gy)`（`:1209-1220`）；
  - 同物件对同单位只回调一次（`cbFired: Set<string>`，键 `handle:standing`）；
  - `program.functionByNum(o.param98)` 找到回调函数 → `spawnInstance(fn, [victim, objHandle], makeVm(vm), hitDamage)` + `drainInstancesSync()`（并发实例机制是 159 的 L0）；
  - 回调那一击由端口等价结算：小兵 `applyHpDelta(standing, -1)`、主将 `applyHpDelta(standing, -(perHit > 0 ? perHit : engineGet(4)))`（原作 `Hurt` 对主将会被 `arg2 == g2 || g2` 拦掉只放音效，`magic_so.dis.txt:0012B8-0012E4`，真正掉血在 `0x40AB65..0x40ABC5` 的引擎虚函数 `call \locc+0x4c\(locc, 0x10003|0x10004, obj)`）。
- `runtime.ts:689`（`execute()`）与 `:833`（`settleFrame()`）：几何命中与回调命中合并，且兜底"打空就命中落点"加 `cbHits.length === 0` 条件。
- `runtime.ts:535/547` `makeVm()`：`G3 = generalOf(targetHandle)`（对应 `0x43BA9D`，G3 是"对面主将"而不是"离落点最近的敌单位"）；`G5 = side === 'A' ? 0 : 1`。
- **副产品（本单最大的坑）：`0x314` 的脚本实参序是反的。** `0x420CAD` handler 按地址降序压栈（`push [ebp+0x1c] … push [ebp+8]`），第一个压的是函数名，所以被调函数的 `arg1` = syscall 的**最后**一个实参。端口原来按正序填 `callArgs`，导致 `LockTargetXY` 全部形参错位（`param98` 写成 128、资源号变 0、`0x14` 的 x 变成 50331648），主段门永远进不去，只能走 else 段（只造 2 个物件）——这正是 159 看到的 `objects=2 / hits=1`。改成反序后：`param98=14001`、资源 2501、坐标正确，主段 21 个物件全部挂上回调。代码在 `syscalls.ts:646-680`。

**验证**（`work/163_probe_demon.mjs`，B 主将摆在正前方一格）

```
{"hits":26,"killed":2,"objects":243,"hp0":101,"hp1":41,"traceLines":45,"hurtLines":21}
CALL Hurt argc=3 args=[0,1041,2]     ← g16=0（见 §4-③），伤害由端口 cbDamage 结算
call fn histogram: DemonDancing 1, CreateLastAttack 1, Hurt 21
```

---

### 1.2 缺口②：`0x12A` / `0x12B` 不是"造物件返回 1"，而是矩形计数 / 取第 i 个单位

**原作（地址级）**

- `0x12A` handler `0x42081A` → `0x43EEA9(camp, cx, cy, hw, hh)`：`loc = 0x43B9CB(camp)`，`call 0x402920(loc, cx-hw, cy-hh, cx+hw, cy+hh)` ⇒ **矩形内该阵营单位个数**。
- `0x12B` handler `0x42083B` → `0x43EEE8(...)`：同样的矩形，`call 0x4029CB(..., idx)` = **矩形内第 idx 个单位**，返回前读 `unit[+0x44]`（→ 主将）。
- `0x43B9CB(camp)`：`cmp [ebp+8],0; jne` ⇒ **camp 0 → A 方结构（`0x4a8a60`），否则 B 方（`0x4b03a0`）**，与施法方朝向无关。
- 15 处调用点形状一致：`locN = 0x12A(...); for i < locN: arr[i] = 0x12B(..., i)`（`Thunder #74 @0x8DCC`、`Tornado #136 @0x129AC`、`CreateSmallSwords #154 @0x15E40`、`Engulf #187 @0x1B9A8`、`Ice #204 @0x1ED78`、`TaiChi #216 @0x21EB0`、`CreateSpoutAround #222 @0x23438`、`Slash #286 @0x2EAFC`、`XTaiChi #336 @0x3842C`）。

**端口（file:line）**

- `syscalls.ts:559-587`：`0x12A` = `unitsInRect(...).length`，`0x12B` = 同表的 `[a(5)]`（越界/负数 0）；两个 case 不再 `spawnObject`、不再 `return 1`。
- `runtime.ts:1185-1207` **新增 `unitsInRect(camp,x0,y0,x1,y1)`**：camp **绝对**映射（`dir === 0 ? 'A' : 'B'`，依据 `0x43B9CB`），结果按 `(y, x, handle)` 排序保证确定性。
- `runtime.ts:1095-1110` `sideUnitHandle(camp)` 同步改成绝对映射（`0x10D` handler `0x420518` → `0x43A7AC`，开头同样是 `cmp [ebp+8],0 / 0x4a8a60 / 0x4b03a0`）。

**验证**：`work/163_probe_seq3_volume.mjs`（抓 `m026snd01` 的音量）

```
seq   3 (脚本 504) = [200]                     ✗ 只有 200
seq  18 (脚本 516) = [200, 230, 230]           ✓
seq  26 (脚本 532) = [200, 230, 230, 230, 230] ✓
```

230 在 `CreateSpoutAround`（`func #222 @0x23438`）主循环体内（`magic_so.dis.txt:20222-20224`），循环上界是它的 arg1；`Spout` 末尾 `CALL CreateSpoutAround(loc1, loc2, arg1*2)`。**seq 3 的根脚本 `Magic4`（`func #355 num=504 @0x3AB78`，`magic_so.dis.txt:33418-33420`）就是 `PUSHI 0; CALL Spout; RET 0`** ⇒ `Spout(0)` ⇒ `CreateSpoutAround(..., arg1=0)` ⇒ 主循环 0 趟 ⇒ **原作也发不出 230**。这不是端口的近似造成的：seq 18（`Magic16` → `Spout(1)`）、seq 26（`Magic32` → `Spout(2)`）在同一份端口代码里都能打出 230，次数正好等于 `2 × Spout 的 arg1` + 1 次入场音。

---

### 1.3 缺口③：G5 = 阵营 0/1

**原作（地址级）** `0x43BA59` 本体（`work/g2g3/d43b9.txt:135-175`）：

```
0043BAA2  cmp dword ptr [ebp+8],0x4a8a60 ; jne 0x43bab7
0043BAAB  mov dword ptr [0x4a688c],0    ; G5 = 0  （arg1 == 0x4A8A60，A 方）
0043BAB7  mov dword ptr [0x4a688c],1    ; G5 = 1  （否则，B 方）
```

⇒ G5 是**施法方阵营**（A=0、B=1），不是朝向、也不是方向。`project/154 §1.3` 里「G5 与朝向相关」的注是用反了的 JNZ 助记符读出来的（154 自己也证明了 `0x3C/0x3D` 的助记符是反的）；「±1 格镜像」的结论仍然成立：A 方在左，`G5=0 → 正前方 x+1`，B 方 `G5=1 → x-1`。

**端口**：`runtime.ts:547` `vm.setEngineValue(5, this.side === 'A' ? 0 : 1)`（改前是 `this.isHeal ? this.casterHandle : this.direction`）。

**改 G5 暴露的真问题（一并修掉）**：脚本里 `0x116/0x117/0x118`（血上限/当前血/设血）的实参在 G5 时代就是**阵营**而不是句柄——`IncreaseHP`（`func #164 @0x179B0`）体是 `loc1 = 0x117(g5)`，循环 `0x118(g5, loc1+i)`。G5 从"handle"变 0/1 后，补血技瞬间全灭（命療術/回天術/场景四…8 条红）。修法：`syscalls.ts:488-508` 三个 case 先 `ctx.isUnit(a(0)) ? a(0) : ctx.sideUnitHandle?.(a(0))`，与 `0x43A7AC` 的 camp→主将映射一致。

---

### 1.4 顺带修掉的引擎语义（都是让 ①②③ 成立的必需品）

| syscall | 原作地址 | 原来 | 现在 |
| --- | --- | --- | --- |
| `0x1f` | handler `0x41FEFB` = `mov [obj+0x28], arg2`，而 `0x4217FE` 建物件时 `obj[+0x28] = 资源[+0x1c]` | 落到 `STUBBED`（只打"占位 syscall"） | `ctx.setObjectFrames(a(0), a(1))` = 改存活帧数（`syscalls.ts:337`，同时移进 `IMPLEMENTED`） |
| `0x125` | `0x43ED96`：`arg1`=受害、`arg2`=0（`Hurt` 永远传 0）、`arg3`=伤害量，`mov [0x4b4c3c],arg3`（`0x43EDE7`） | `applyHpDelta(a(0), +a(2))` ⇒ **法术伤害变加血** | `ctx.damage ? ctx.damage(a(0), a(2), a(1)) : ctx.applyHpDelta(a(0), -a(2))`（`syscalls.ts:509-520`） |
| `0x2c` | `0x420291` `mov [obj+0x98], arg2` | 注释写成"父/子物件关联号" | 注释改为「碰撞回调脚本号」并冻结 `cbDamage` |
| `0x113` | 格表存部队记录，各处读 `unit[+0x44]` 取主将 | 直接返回单位句柄 | 经 `generalOf` 折算主将，找不到回落原句柄 |
| `0x314` | `0x420CAD` 地址降序压栈 | 正序传参 | 反序传参（`0x312` 保留正序，见 §4-①） |

---

## §2 七条验收的真实输出

1. `cd F:\sanguo\game && npm.cmd exec -- tsc --noEmit` → `EXIT_NOEMIT=0`
2. `npm.cmd exec -- tsc -p tsconfig.build.json` → `EXIT_BUILD=0`
3. `node --test tests/*.test.ts` →
   ```
   ℹ tests 1354
   ℹ pass 1354
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ```
   （基线 1318；本单新增 `tests/magic_callback.test.ts` 7 条，其余增量来自并行的另一个 agent。`node --test tests/magic_callback.test.ts` 单独跑 7/7。）
4. **神鬼亂舞(104) 命中 ≥3**：`tests/smartscript.test.ts:185/188/189`（测试块 `:173` 起）的三条断言已恢复 `hits >= 3` / `fx.kind === 'aoe'` / `fx.r >= 3.6` 并通过（该场景 `staged()` 下 hits=4）；主段场景探针 **hits=26**，B 主将 `101 → 41`（Δ=60 = 20×2 + 末击 20），回调 `CALL Hurt` 共 **21** 次（20 次 `g16=2` + 1 次 `g16=20`）。
5. **110 条武将技有任何效果**（`work/163_probe_110.mjs`）：
   ```
   总技能数 = 110
   有任何效果 = 110/110
     hits>0    101/110
     killed>0  29/110
     healed>0  2/110
     objects>0 102/110
     world.fx>0 110/110
   ok=true     = 110/110
   ```
6. **seq 3 音量**（`work/163_probe_seq3_volume.mjs`）：`seq 3 = [200]`，打不出 230 —— 见 §1.2 的地址级结论（`Magic4` 传 `Spout(0)`）；同一探针里 `seq 18 = [200,230,230]`、`seq 26 = [200,230,230,230,230]` 证明 230 通路已通。
7. **G5 取 0/1**：`tests/magic_callback.test.ts` 两条（spy `ScriptVm.prototype.setEngineValue`：A=`0`、B=`1`；seq 1/60/104/49 全为 0）+ `tests/guard_r43_r51.test.ts:127-136` `g5 === 0 || g5 === 1`。
8. `cd F:\sanguo && node work/fidelity/check.mjs` → `PASS 459 / FAIL 0 / SKIP 3 / WARN 0 (mode=dist)`（进程 exit code 1 来自 SKIP 3，基线同样如此，不是 FAIL）。

---

## §3 改了哪些旧断言（改前 / 改后 / 依据）

| 文件:行 | 改前 | 改后 | 依据 |
| --- | --- | --- | --- |
| `game/tests/smartscript.test.ts:185` | `hits >= 1` | **`hits >= 3`** | 恢复 159 的放宽；`DemonDancing` 主段 21 个 2501 物件各挂 `obj[+0x98]=14001`（`magic_so.dis.txt:12161-12175` + `0x420291`），实测 21 次 `CALL Hurt` |
| 同上 `:188` | `kind === 'strike' \|\| 'aoe'` | **`kind === 'aoe'`** | 多目标 ⇒ `pushFx` 的 `hits.length >= 2` 分支；实测 `hits=26/fx=1` |
| 同上 `:189` | `r >= 1.8` | **`r >= 3.6`** | 同上（`aoe` 半径） |
| `game/tests/smartscript.session.test.ts:85` | `frames.length === 601` | **`562`** | 接上回调后 606(`TwisterSword`) 的小飞剑按 `FlyingSwordCallback #150 @0x158C8` 逐次结算，收尾提前 |
| 同上 `:215` | `=== 601` | **`562`** | 同上（逐帧复跑的第二处） |
| 同上 `:197` | `358291` | **`358333`** | 回调子实例的指令数计入总账 |
| `game/tests/guard_r43_r51.test.ts:127-136` | 对 `[2,3,5]` 都断言"有效 handle" | `[2,3]` 断言 handle，`g5` 单独断言 `0 \|\| 1` | `0x43BA59` @ `0x43BAA2-0x43BAB7`（G5 = 阵营 0/1） |
| `game/tests/r50_r67.test.ts:497-498` | `['applyHpDelta:9:2']` | **`['applyHpDelta:9:-2']`** | `Hurt` 的 a(2) 是**正**伤害量，`applyHpDelta` 负数才是伤害（`0x43ED96` @ `0x43EDE7`） |
| `game/tests/cast_autoaim.test.ts:252-266` | 标题「显式瞄中场与 auto 结果不同」，`assert.equal(same, false)` | 标题「神鬼亂舞不再吃落点」，**`assert.equal(same, true)`** | `G3` = 对面主将（`0x43BA9D`），脚本自读 `g3`，与落点无关 |
| `game/tests/smartscript_audio.test.ts:122-135` | `m036snd02` 共 3 次 | **7 次** | `Slash #286 @0x2EAFC` 有 `for loc4<4`（`magic_so.dis.txt:26604-26607`）+ `for loc4<3`（`:26671-26675`）两段循环，各造一次；旧值 3 是 `0x12A` 恒返 1 的产物 |
| `game/tests/magic_callback.test.ts`（新） | — | 7 条 | 见 §2-4/6/7 |

没有为了让测试变绿而放宽任何断言；`smartscript.test.ts` 的三条是**收紧**回 159 之前的强度。

---

## §4 没做到与 `[未解]`

① **`0x312` 正序 vs `0x314` 反序，尚无统一解。** 两条 handler（`0x420C43` / `0x420CAD`）的压栈形态实测一样（都是地址降序 8/10 连 push），但：
- `0x314` 必须反序：反序下 `DemonDancing` → `LockTargetXY` 九个形参逐条自洽（`0x303(arg3,arg2)`=rand(0,0)、`0x11` 资源 2501、`0x14` 的 x/y 不颠倒、`0x2C(arg4)`=14001）；正序时 `param98` 写成 128、资源号 0、`0x14` 的 x=50331648（实测）。
- `0x312` 必须正序：唯一调用点 `Tornado #136 @0x129AC` 的 `TornadoMotion #125 @0x11710`，反序会让旋龍的 `WAITFOR` 等待循环从 47 帧掉到 23 帧（`tests/r87_waitfor.test.ts` 要 `> 40`），且两种映射都拿不到"活着的物件句柄"（端口句柄是动态分配的，与原作编号不同）。
- 猜测根因：端口对 syscall `args` 的截取口径。`magic_so.dis.txt:10233` 那个 `0x312` 调用点压了 9 个值而 `argc=8`，端口只拿到 8 个，第 9 个（真正的 arg1）被丢掉 ⇒ 无论正反都错位一格。**下一步地址**：`0x4658C0`（建帧）与 `0x4653F0`（起实例）里 `argc` 的来源，确认栈上"多压的那一个"是复位残留还是隐藏实参。

② **seq 3 的 230 是原作的死音**（不是端口未完成）。`Magic4 @0x3AB78` = `PUSHI 0; CALL Spout`，`Spout` 末尾 `CALL CreateSpoutAround(loc1, loc2, arg1*2)` ⇒ 上界 0。要听 230 请用 seq 18（地泉裂勁，`Magic16`）或 seq 26（地泉鯨浪，`Magic32`）。若上游认定 seq 3 在原作里有 230，则要么 `magics.json` 的 `SCRIPT 504` 映射错了，要么 `Spout` 的 arg1 另有来源——**下一步地址**：`0x43BA59` 的 8 个 caller 里 `push 0 / push <seq>` 的配对（`work/g2g3/d43b9.txt`）。

③ **回调子实例读不到父脚本的 `g16`。** 端口不共享 `globals`（`vm.ts` 的 `VmOptions.globals` 有能力传，但 `runtime.makeVm` 没传），所以 `DemonDancingCallback` 里 `LDSG g16` 拿到 0，`CALL Hurt` 的伤害参数是 0 —— 探针实测 `CALL Hurt args=[0,1041,2]`。当前用"派发时冻结 `cbDamage` + 端口自己 `applyHpDelta`"等价替代（对应原作 `0x40ABC5` 那一击走引擎虚函数而非脚本）。**若要让脚本自己结算伤害**，需要让 `spawnInstance` 的子 VM 共享父 VM 的 `globals`（159 的 `engine` 已经共享）；本轮试过一版并回退了（对其它技能是额外变量）。
- 另：端口碰撞结算是整条施法跑完后批量做的（同步模型），原作是逐帧即时；`hits` 数值一致，但"回调发生的时间点"不同。要完全对齐得把 `collideCallbacks` 挪进逐帧循环并去掉批量。

④ **测试总数的干扰**：全量跑期间偶发 `unlock.test.ts` 的 `eraFieldOf…` 与 `data_audit.test.ts` 的「真实数据：丁奉 S1 无圓阵…」两条失败，单独跑分别 27/27、16/16 全绿，重跑全量也全绿 ⇒ 判断是并行的另一个 agent 正在改 `game/data/**` 造成的瞬态，与本单无关。

⑤ **`0x011` 仍然丢弃第 3 实参**（原作 `0x4217FE` 把它写进 `obj[+0x2c]` = 朝向字节，`0x11(g2, res, loc7, 0)` 的 `loc7`=0/128 就是朝向）。本单没改（不阻塞验收），但它是"物件朝左/朝右"缺失的直接原因。**下一步地址**：`0x4217FE` 的 `obj[+0x2c] = (arg4 & 0xff) << 16`，端口 `syscalls.ts` `case 0x011` 加一个 `angle` 实参即可。

---

### 附：本单改动的文件

- `game/src/core/smartscript/syscalls.ts`：`SkillObject.param98/cbDamage`、`SyscallContext` 新增 4 个可选方法、`0x01f/0x02c/0x113/0x116/0x117/0x118/0x125/0x12a/0x12b/0x312/0x314`
- `game/src/core/smartscript/runtime.ts`：`makeVm`（G3/G5）、`sideUnitHandle`、`unitsInRect`、`unitAtTile`、`generalOf`、`globalGet`、`instanceHitDamage`、`collideCallbacks`、`spawnInstance(hitDamage)`、`execute`/`settleFrame` 合并回调命中
- `game/src/core/smartscript/vm.ts`：`VmOptions.globals`（能力预留，当前未启用）
- `game/tests/magic_callback.test.ts`（新，7 条）+ §3 列出的 6 个测试文件共 10 处断言
- `work/163_probe_demon.mjs`、`work/163_probe_slash.mjs`、`work/163_probe_r87.mjs`、`work/163_probe_110.mjs`、`work/163_probe_seq3_volume.mjs`、`work/163_dbg_cb.mjs`、`work/163_strip_debug.py`、`work/magic_cb/scan_obj98.py`、`work/magic_cb/xref_call.py`
