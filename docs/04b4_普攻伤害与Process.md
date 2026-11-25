# 04b4 普攻伤害与 Process（OM_PAIN 落地链）

> 目标：补上 04b 里"命中后只广播 `OM_PAIN`，扣血分散在 20 个物件 Process 的消息处理器里，无法集中还原"这一块。
> 结论全部落在 `Sango2.exe`（三国群英传2 修正版 1.05+，PE32，ImageBase 0x400000）的 VA 上。
> 标记：`[确认]` = 反汇编逐条读过；`[推测]` = 由代码结构推出、未直接验证；`[未解]` = 没搞定。

---

## 0 结论速览

**一句话：伤害值从不随消息传递。命中方只发一条 `OM_PAIN(0x10004)`，参数是"攻击者对象指针"；受击方自己的 Process 处理器在收到消息的现场调用 `0x43EC54(受击obj, 攻击obj)` 算伤害——打武将 `dmg = rand[武力/2, 武力) / 10`（下限 1），打士兵则根本不算血，`OM_PAIN` 直接自转发 `OM_DEATH`，一击必死。** `[确认]`

三条要点：

1. `OM_PAIN` 的 param **不是伤害值**，是攻击者的对象指针；伤害在接收方算，所以"扣血分散"是设计如此，不是代码分散。`[确认]`
2. 整个 EXE **只有 4 条指令**发 `OM_PAIN`（0x40ABDD / 0x43D72C / 0x43D822 / 0x43D892），只有 **2 个 Process** 会对它做数值反应：**Process 3（士兵，即死）** 与 **Process 4（主将，扣血）**。`[确认]`
3. Process 不是虚函数表：`Process=` 字段在 INI 读取时被翻译成**一个裸函数指针**，存进 `thingdef+0x20`，构造时拷到 `obj+0x4C`；消息分派就是 `call [obj+0x4C](obj, msg, param)`。映射表是 BSS 里的 128 项数组 `0x4C09E0`，启动时由 `0x430630` 逐项注册。`[确认]`

| 你问的 | 答案 | 章节 |
|---|---|---|
| 1. OM_PAIN 结构 / 怎么分派 | 3 参数 `(obj*, int msg, void* param)`；param = 攻击者 obj 指针 | §1 |
| 2. 虚函数还是跳表 / vtable 在哪 | 都不是。每个对象一个裸函数指针 `obj+0x4C`；映射表 `0x4C09E0`（BSS） | §1.4、§2 |
| 3. 扣血公式 / 随机 / 减伤 | `0x43EC54`：武将 `rand[STR/2,STR)/10`；士兵 `战力/48`（骑兵 ×1.2）。无防御减伤 | §3.2 |
| 4. 士兵死亡 / 兵力字段 | 士兵无 HP，挨打即死；存活数在**战场单位 +0x5C**，不是 `general+0x42` | §4 |
| 5. 弓弩是否另一条路径 | 是：`Process 12` 飞行物 → `0x43D862` → 同一个 `0x43D400` 命中判定 → `OM_PAIN` | §5 |

---

## 1 消息流

### 1.1 消息号（THINGS.INI `[DEFINE]`）

| 名字 | 值 | 备注 |
|---|---|---|
| OM_ALLOCATE | 1 | 构造完立即自发 |
| OM_TICK | 2 | 每帧 |
| OM_REMOVE | 3 | |
| OM_ATTACK | 0x10000 | 挥击动作 → 真正判伤 |
| OM_WALK / OM_WAIT | 0x10001 / 0x10002 | |
| OM_DEATH | 0x10003 | 受击方自己发给自己 |
| OM_PAIN | 0x10004 | **受击通知** |
| OM_TOUCHER / OM_TOUCHED | 0x10005 / 0x10006 | 两军接触上报 |
| OM_INITATTACK | 0x10007 | 起手（定朝向、锁目标） |
| OM_DEATHSTOP | 0x10009 | |
| 0x1000A | 未命名 | **未命中/闪避**（本次新发现） |
| OM_FLEERUN | 0x1000C | |
| OM_SETTARGET | 0x20001 | |

### 1.2 三参数调用约定 `[确认]`

所有处理器都是 `__cdecl`，`this` 走栈（不是 `ecx`）：

```
int handler(void* this /*[ebp+8]*/, int msg /*[ebp+0xc]*/, void* param /*[ebp+0x10]*/);
```

调用点一律是三条 push + 间接 call：

```asm
; 0x43D686 命中分支（t = 受击 obj 在 [ebp-8]，a = 攻击 obj 在 [ebp+8]）
0043D71B  mov  ecx,[ebp-8]
0043D71E  mov  edx,[ecx+0x44]     ; 接收者 = 受击 obj 的 +0x44
0043D721  mov  [ebp-0xC],edx
0043D724  mov  eax,[ebp+8]
0043D727  mov  ecx,[eax+0x44]     ; param = 攻击 obj 的 +0x44
0043D72A  push ecx
0043D72B  push 0x10004            ; msg = OM_PAIN
0043D730  mov  edx,[ebp-0xC]
0043D733  push edx                ; this = 接收者
0043D734  mov  eax,[ebp-0xC]
0043D737  call dword ptr [eax+0x4C]   ; ← 裸函数指针
0043D73A  add  esp,0xC
0043D73D  mov  eax,1
```

`0x43D862` 的命中分支（`0x43D881-0x43D8A0`）结构完全一样，只是 `t` 在 `[ebp+0xc]`、`a` 在 `[ebp+8]`。`[确认]`

**`OM_PAIN` 的 param = `攻击方obj->+0x44`**，`this` = `受击方obj->+0x44`。`[确认]`

`obj+0x44` 是"消息接收者对象指针"：代码取它的 `+0x4C` 再调用，所以它必然也是一个 obj（对战场对象通常就是自己/自己的主 obj）。它在构造时从生成描述结构 `+0x10` 拷入（`0x4218D6`：`mov eax,[edx+0x10]; mov [ecx+0x44],eax`），该来源字段的语义 `[未解]`。

### 1.3 四个发送点 `[确认]`

对全 `.text` 做 `0x10004` 立即数字节扫描，命中 4 处，覆盖了全部"掉血"入口：

| VA | 所在函数 | 场景 | param |
|---|---|---|---|
| 0x43D892 | `0x43D862(a,b)` | **通用"命中并通知"**（箭矢、法术箭用） | `a->+0x44` |
| 0x43D72C | `0x43D686(unit,dir,flag)` | 士兵近战接触 | `a->+0x44` |
| 0x43D822 | `0x43D76C(unit,dir)` | 武将近战接触 | `a->+0x44` |
| 0x40ABDD | `0x40A8CC` 内 0x40AB30-0x40ABE1 | 法术效果位掩码 | **法术对象**（不是武将） |

配套的"未命中"消息 `0x1000A` 由 0x43D862 / 0x43D686 / 0x43D76C 在判定失败时发出。`[确认]`

三个近战/射击入口的关系：

```
Process 3 (兵)  --OM_ATTACK--> 0x43D686(unit, ±1, 目标) --\
Process 4 (将)  --OM_ATTACK--> 0x43D76C(unit, ±1)      ---> 命中判定 --> OM_PAIN / 0x1000A
Process 12(箭)  --TICK-------> 0x43D862(shooter, tgt)  --/
```

### 1.4 分派链：从 INI 到函数指针 `[确认]`

```
THINGS.INI  Process=3
   │ 0x43731D(section, thingdef)  读键 "Process"(0x48DFBC)
   │   → 0x436A1C atoi → id
   │   → 0x422BEB(id)   ; getter
   ▼
0x422BEB(id):  if (id < 0x80) return [0x4C09E0 + id*4];
               else            return 0x422847;      // 默认处理器
   ▼
thingdef+0x20 = handler
   ▼
ctor 0x421983:  obj->+0x4C = [thingdef+0x20];  if (!obj->+0x4C) obj->+0x4C = 0x422847;
   ▼
obj+0x4C(obj, 1, 0)        // 立即发 OM_ALLOCATE
```

- 表 `0x4C09E0`：128 项 dword，位于 `.data` 的 **BSS 段**（VA ≥ 0x4A6200 无文件映像），启动时由 **`0x430630`** 逐条 `push handler; push id; call 0x422BD0` 填充，开头先 `call 0x422C0F` 全部刷成默认。`[确认]`
- 全 EXE 对 `0x4C09E0` 只有两处引用：`0x422BE2`（setter 内写）、`0x422BFA`（getter 内读）。`[确认]`

---

## 2 Process 表（THINGS.INI 1..21）

`0x430630` 注册的完整映射 `[确认]`：

| # | INI 名 | 处理器 VA | 用途（本次核实） | 收 OM_PAIN 的行为 |
|---|---|---|---|---|
| 1 | Default | 0x422847 | 纯动画物件（67B） | 无（只处理 msg 1/2/3）`[确认]` |
| 2 | Troop | 0x439A48 | 士兵编队/容器；载入 `TROOP\SOL1*` 动画；TOUCHER → 接触队列 | **不扣血**，只把接触入队 `[确认]` |
| 3 | ForceSoldier | 0x43DDBF | **单个士兵** | **即死**（自转发 OM_DEATH）`[确认]` |
| 4 | ForceMajor | 0x43EF64 | **主将（武将）战场对象** | **扣 `general+0x12`** `[确认]` |
| 5 | General | 0x422AB1 | 武将逻辑/头像物件（287B，只处理 TICK/REMOVE） | 无扣血分支 `[确认]` |
| 6 | （法术波） | 0x43FC39 | 法术波命中判定（163B） | 不处理；自己发 OM_DEATH 秒杀格上单位 `[确认]` |
| 7 | （火雨/粒子） | 0x43FCDC | msg 1/2，`+0x10>0` 时跳过，否则循环 3 次生成 | 无 `[确认]` |
| 8 | （法术余波） | 0x43FEEC | 98B，TICK 后自删 | 无 `[确认]` |
| 9 | MagicArrow | 0x43FDF0 | 法术箭（252B） | 不处理；TICK 撞兵直接 OM_DEATH，撞将自毁 `[确认]` |
| 10 | TroopFlags | 0x43A003 | 旗帜/标记（189B） | 无 `[确认]` |
| 11 | MagicObject | 0x40AC82 | 法术本体（85B）→ `0x40A8CC` | 由掩码应用器发 PAIN/DEATH（§3.6）`[确认]` |
| 12 | ForceArrow | 0x43E28B | **飞行箭矢**（721B） | 不处理；走 `0x43D862` 发 PAIN `[确认]` |
| 13 | Shadow | 0x40ACD7 | 影子（169B） | 无 `[推测]`（未逐条读） |
| 14 | MajorHead | **未注册** | `0x430630` 跳过 0xE 号 | getter 落到 0x422847 `[确认]` |
| 15 | MajorWeapon | 0x43F870 | 主将武器物件（241B） | 无 `[推测]` |
| 16 | ForceHorse | 0x43E1C7 | 战马物件（196B） | 无 `[推测]` |
| 17 | TroopShape | 0x439DA3 | 兵种造型（399B） | 无 `[推测]` |
| 18 | MajorHorse | 0x43FADE | 主将坐骑（347B） | 无 `[推测]` |
| 19 | Weather | 0x40AD80 | 天气（213B） | 无 `[推测]` |
| 20 | Ani | 0x40AE55 | 27B，疑为跳板 | 无 `[推测]` |
| 21 | MajorGeneralWeapon | 0x43F961 | 主将武器（381B） | 无 `[推测]` |

> 13/15/16/17/18/19/20/21 是装饰/挂件类，**都不是受击目标**，也没有出现在"发 OM_PAIN 的 4 处"里；它们内部是否收到 PAIN 未逐条读完，标 `[推测]`。

**没有 vtable。** 每个物件只有一个从 INI 带出来的函数指针（`obj+0x4C`），不是 C++ 虚表。另外，对 `.rdata`/`.data`/`.idata` 做了"连续 3 项以上命中已知处理器 VA"的扫描，**一段都没有** —— 即映像里根本没有静态的 Process 数组；真正的 21 项映射是 BSS 里运行时填的 `0x4C09E0`。`[确认]`

---

## 3 各 Process 的公式

### 3.1 命中判定

#### `0x43D400(a, b)` —— 士兵/箭矢用（203B）`[确认]`

```c
int HitRoll_Grunt(obj* a, obj* b) {
    int p = a->+0x40->+0x70;                       // 攻方 unit 的"战力"
    if (0x43B6A8(b)) {                             // 目标是武将单位
        general* bg = b->+0x40->+0x48;
        p = 150 - (bg->+0x34 * 20) / 100;          // 150 - 武力/5
    }
    if (0x43BE08(b) == 0) p = p * 2 / 3;           // 目标在移动 → ×2/3
    if ((int)0x450117(300) < p) return 1;          // rand()%300 < p → 命中
    if (a->+0x2c & 4) {                            // 骑兵/特殊兵：二段判定
        p = p * 2 / 3;
        if ((int)0x450117(300) < p) return 1;
    }
    return 0;
}
```

#### `0x43D4CB(a, b)` —— 武将攻击用（244B）`[确认]`

```c
int HitRoll_General(obj* a, obj* b) {
    general* ag = a->+0x40->+0x48;
    int p;
    if (0x43B6A8(b))       p = 150 + (ag->+0x34 - bg->+0x34) / 2;  // 打武将：武力差/2
    else if (0x43B6C9(b))  p = 150 + ag->+0x34 / 3;                // 打骑兵：武力/3
    else                   p = 150 + ag->+0x34 / 2;                // 打普通兵：武力/2
    if (a->+0x40->+0x84 & 0x200) p += a->+0x40->+0x74;             // 增益位
    if (0x43BE08(b) == 0) p = p * 2 / 3;
    return (int)0x450117(300) < p;
}
```

辅助函数：

- `0x450117(n)` = `n ? Rand32() % n : 0`（无符号取模，PRNG 状态 `0x4922FC`/`0x492300`）`[确认]`
- `0x43BE08(o)` = `(o->+8 == o->+0x10 && o->+0xc == o->+0x14)`，即"已抵达目标点/站定"；返回 0 表示移动中 → 命中率 ×2/3 `[确认]`
- `0x43B6A8(p)` = `p && (p->+0x2C & 1)`：是"武将单位" `[确认]`
- `0x43B6C9(p)` = `p->+0x2C & 4`：骑兵/特殊兵 `[确认]`
- `0x43B556(p)` = `p->+0x2C & 0x2000`：已阵亡 `[确认]`

#### 三个入口的差异 `[确认]`

| 函数 | 谁调 | 命中判定 | 特例 |
|---|---|---|---|
| `0x43D686(unit, dir, flag)` (230B) | Process 3 OM_ATTACK | `flag==1 ? 必中 : 0x43D400` | 先 `0x43AF7A` 取相邻格目标；无目标且 `0x43B961(a)>1` 则挥空 |
| `0x43D76C(unit, dir)` (2 参) | Process 4 OM_ATTACK | `0x43D4CB` | 前后摇不同 |
| `0x43D862(a,b)` (112B) | Process 12 TICK | `0x43D400` | 命中发 PAIN，未命中发 `0x1000A` |

`0x43D686` 的第三参来自 `obj+0x94`（Process 3 在 OM_INITATTACK 里从全局 `0x4A6668` 抄来的"下一击必中"旗标）：`0x4A6668` 在 `0x43D28C` 清 0、在 `0x43D2DC` 以 `1/8` 概率置 1（条件是 `0x43B961(unit) <= 1`）。`[确认代码，触发语义 推测]`

### 3.2 ★扣血公式 `0x43EC54(target, attacker)`（322B）`[确认]`

```c
int Damage(obj* t, obj* a) {                    // 两个都是 obj*（受击 / 攻击）
    if (!t || !a || !t->+0x84 || !a->+0x84) return 0;
    unit* ut = t->+0x84;
    unit* ua = a->+0x84;
    general* tg = ut->+0x40->+0x48;             // 受击方武将
    if (!0x43B6A8(ut)) 0x42FDA5(0x54);          // 诊断/断言调用：受击方必须是武将单位

    if (0x43B6A8(ua)) {                         // ── 攻击方是武将 ──
        general* ag = ua->+0x40->+0x48;
        int str  = (short)ag->+0x34;            // 武力（基础值）
        int half = str / 2;
        int r    = 0x450117(str - half) + half; // rand() % ceil(str/2) + str/2
        int d    = r / 10;                      // 无符号除
        return d > 1 ? d : 1;
    } else {                                    // ── 攻击方是士兵/物件 ──
        int p = ua->+0x70;                      // 战力
        if (0x43B6C9(ua)) p = p * 0x78 / 0x64;  // 骑兵 ×120/100
        int d = p * 4 / 0xC0;                   // = p/48
        return d > 1 ? d : 1;
    }
}
```

数值示例（`[推测]`，按公式代入）：

| 情形 | 公式 | 武力 60 | 武力 100 |
|---|---|---|---|
| 武将打武将 | `rand[STR/2, STR) / 10`，下限 1 | 3–5（均 4） | 5–9（均 7） |
| 兵打武将 | `战力 / 48`（骑兵 ×1.2） | 战力 100 → 2 | 战力 100 → 2 |

**没有防御/减伤项。** 没有藤甲/盾/防御力字段参与；`0x43EC54` 里唯一的"减伤"是 `if (!t || !a || !t->+0x84 || !a->+0x84) return 0`（对象不全则 0）。`[确认]`

`general+0x12` 是战场在用血量池（word）：`0x42D3A5` 处 `g->+0x12 = 0x40A020(g); g->+0x10 = g->+0x12;`，所以 `+0x10` 只是同值副本；`0x40A020` = `BaseHP + 等级*2*武力/100`（clamp 到 `[BaseHP, 0x7FFF]`）。`[确认 + 引用 04b]`

### 3.3 Process 3（士兵 0x43DDBF）：挨打即死 `[确认]`

13 项跳表 `@0x43E193`（`idx = msg-0x10001`）：

| idx | msg | 目标 | 行为 |
|---|---|---|---|
| 0 | OM_WALK | 0x43DE81 | 动画→2 |
| 1 | OM_WAIT | 0x43DEA6 | 动画→1 |
| 2 | OM_DEATH | 0x43E012 | `0x43DB0D(unit)` 减员；`0x43DC56(obj,param)` 尸体位移；动画 0x10→0x20 |
| 3 | **OM_PAIN** | **0x43E077** | 见下 |
| 4/5 | TOUCHER/TOUCHED | 0x43E176 | 转 `0x43E55C` |
| 6 | OM_INITATTACK | 0x43DF8F | 定朝向、选动画、抄 `0x4A6668` 必中旗标 |
| 8 | OM_DEATHSTOP | 0x43E0F8 | 停住 |
| 10 | 0x1000B | 0x43E0C2 | 动画 0x40 |
| 12 | 0x1000D | 0x43DECB | 把 `unit+0x3c` 折进 `unit+0x34`，复位动画 |

OM_PAIN（`0x43E077`）：

```c
0x469900("HIT01"/*0x490294*/, x, y, z, 0xFF);   // 命中特效
call [this+0x4C](this, 0x10003, param);          // 自转发 OM_DEATH ← 关键
return 1;
```

→ **士兵没有 HP 池，也不调用 `0x43EC54`。挨一下必死**，死完由 `0x43E012` 走 `0x43DB0D` 减员。`[确认]`

`OM_ATTACK`（0x43DF43）：

```c
if (this->+0x2c == 0) 0x43D686(this->+0x84, +1, this->+0x94);
else                  0x43D686(this->+0x84, -1, this->+0x94);
```

### 3.4 Process 4（主将 0x43EF64）：唯一的扣血点 `[确认]`

派发体在 `0x43EF6C`（`0x43EF64` 是 `jmp 0x453F84` 的 8 字节跳板）。14 项跳表 `@0x43F54F`：

| msg | 目标 | msg | 目标 |
|---|---|---|---|
| 0x10001 WALK | 0x43EFE8 | 0x10008 | 0x43F532 |
| 0x10002 WAIT | 0x43F00D | 0x10009 DEATHSTOP | 0x43F4B4 |
| 0x10003 DEATH | 0x43F27B | 0x1000A | 0x43F532 |
| **0x10004 PAIN** | **0x43F376** | 0x1000B | 0x43F245 |
| 0x10005/6 | 0x43F532 | 0x1000C | 0x43F532 |
| 0x10007 INITATTACK | 0x43F103 | 0x1000D | 0x43F08B |
| | | 0x1000E | 0x43F41D |

OM_PAIN（`0x43F376`）：

```c
if (0x42233D(this) == 0x20) return 0;              // 已在死亡动画
unit* u = this->+0x84;
if (u->+0x40->+0x54 == 1) return 0;                // ← 早退守卫，语义 [未解]
general* g = u->+0x40->+0x48;
int dmg = 0x43EC54(this, param);                   // ★ 这里
g->+0x12 -= (short)dmg;                            // word 减
if ((short)g->+0x12 <= 0) {
    g->+0x12 = 0;
    call [this+0x4C](this, 0x10003, param);         // 转 OM_DEATH
} else {
    0x421E1B(this, 0x10);                           // 受击动画
}
return 1;
```

OM_ATTACK（`0x43F032`）：

```c
int r = (this->+0x94 >= 0) ? 0x43D76C(this->+0x84, +1)
                           : 0x43D76C(this->+0x84, -1);
if (r == 1) 0x43D8D2(this->+0x84);   // 命中后处理：先看 0x43B50D(unit) & 0x4000
```

`0x43D8D2` 开头是 `if (0x43B50D(unit) & 0x4000) { ... }`，之后按 `unit+0x44->+0x94` 的正负取向；该标志位的语义 `[未解]`（疑似连击/追击/士气相关）。`[部分确认]`

OM_DEATH（`0x43F27B`）：`0x43DB9A(unit)` 写战斗结果 → `0x43DC56` 尸体位移 → 动画 0x40/0x20 → `0x4447B7` + 置 `unit->+0x80 |= 4`、`[0x4A665C] |= 3` → `0x41F740(0/1, 0x39, 0x421AD2(this))`（0x39 = 战败/退场事件）。`[确认]`

`0x43DB9A(unit)`（110B）：`unit->+0x44->+0x2c |= 0x2000`、`+0x10 += 0x360000`（尸体位移）、按阵营 `0x443CA8(4)` / `0x443CA8(8)` 写全局战斗结果。`[确认]`

### 3.5 Process 12（箭矢）与 Process 9 / 6（法术秒杀）`[确认]`

Process 12 `0x43E28B`（派发体 0x43E295），`+0x8C` = 已命中/已落地：

```c
// msg == 2 (TICK)
0x422AB1(this, msg, param);                         // 先跑动画
if (this->+0x8c == 0) {                             // 飞行中
    0x43A51D(this->+8>>16, this->+0xc>>16, &x, &y);
    obj* tgt = 0x43AF7A(x, y);
    obj* src = this->+0x74;                         // 发射者
    if (tgt && tgt != src && !0x43B663(src, tgt)) {
        int r = 0x43D862(src, tgt);                 // ← 命中判定 + 发 PAIN
        call [this+0x4C](this, 0x10003, r == 1 ? 0 : 1);   // 0=命中 1=落空
    } else {
        call [this+0x4C](this, 0x10003, 1);
    }
} else {
    if (--this->+0x90 <= 0) 0x421A43(this);          // 插地停留后删除
    this->+0x58 = min(this->+0x90, 0x10);
}
```

`OM_DEATH`（0x43E3F9）：命中 → `0x4224C1(this, angle, 1, 0)`、`+0x8C=1`、`+0x90=8`；落空 → 角度随机偏转（`±0xB0`、`rand(0x60)`）、`rand(3)+2` 步、`+0x1C = rand(0x40000)+0x80000`、`+0x90=0x18`。

Process 9 `0x43FDF0`：TICK 时取格上 `tgt`；`if (!tgt) return 0`；若 `tgt` 是武将单位则 `0x421E1B(this,0x20)` 自毁，否则直接 `call [tgt->+0x44+0x4C](tgt->+0x44, 0x10003, this)` **秒杀**。

Process 6 `0x43FC39`：同样 `0x43A51D` → `0x43AF7A` → 若有目标则 `OM_DEATH` 秒杀（`0x43FCAC`），**不判敌我、不判武将**。

### 3.6 Process 11（法术掩码）`[确认]`

`0x40AC82` → msg 2 转 `0x40A8CC`，其中 `0x40AB30-0x40ABE1` 是"效果位掩码"应用器：

```c
int mask = 0x40A878(caster_unit, target_unit);   // 该法术对该目标的生效位
if ((spell->+0x30 & mask) == 0) return;          // 不匹配 → 无效果
void* recv = target->+0x44;
if (mask & 0xA000000) call [recv+0x4C](recv, 0x10003, spell);   // 秒杀
else                  call [recv+0x4C](recv, 0x10004, spell);   // 走 PAIN
if (spell->+0x98) 0x41F740(caster, spell->+0x98, 0x421AD2(spell), 0x421AD2(recv));
```

注意：**法术发 PAIN 时 param 是法术对象**，不是武将对象；因此 `0x43EC54` 会走进"攻击方非武将"分支，用 `法术obj->+0x84->+0x70` 当战力。这条路径的数值是否就是游戏里看到的法术伤害，`[未解]`。

---

## 4 士兵死亡与减员

### 4.1 士兵是独立对象池 `[确认]`

战场单位（`0x4A8A60` = A 方 / `0x4B03A0` = B 方）：

| 偏移 | 含义 |
|---|---|
| +0x34 / +0x3C | `0x43DECB` 里做 `+0x34 += +0x3C; +0x3C = 0`，是"位移累加/清零"，具体语义 `[未解]` |
| +0x40 | 自指针（04b 记；代码里 `u->+0x40->+0x48` 等价于 `u->+0x48`）`[推测]` |
| +0x48 | `general*` |
| +0x54 | 守卫位，`==1` 时 Process 4 的 PAIN 直接返回 `[未解]` |
| +0x58 | 已占用槽数 |
| +0x5C | **存活士兵数** |
| +0xB4 | 士兵槽数组，stride **0x48**；槽 `+0x44` = 兵对象指针；槽 `+0x2C & 0x2000` = 已阵亡 |

取"随机一个活着的兵" `0x43A7AC(side)`（197B）：

```c
unit* u = side ? 0x4B03A0 : 0x4A8A60;
if (u->+0x5c == 0) return 0;
int r = 0x450117(u->+0x5c);
for (int i = 0; i < u->+0x58; i++) {
    slot = u + 0xB4 + i*0x48;
    if (0x43B556(slot)) continue;              // 已是尸体
    if (--r < 0) { obj* o = *(u + 0xF8 + i*0x48); return o ? o->+4 : 0; }
}
return 0;
```

→ **士兵确实是独立对象池**：槽位在战场单位内，每个槽挂一个 obj；阵亡只清"存活数"并给槽置 `0x2000`，槽位不回收。`[确认]`

### 4.2 一个兵的死：`0x43DB0D(unit)`（141B）`[确认]`

```c
if (0x43B6C9(unit) == 1) 0x43DA1A(unit);      // 骑兵阵亡特例，内部 [未解]
0x43B028(unit+8, unit+0xc, 0);                // 从空间索引里摘除
unit->+0x2c |= 0x2000;                        // 置阵亡位
if (unit->+0x40 == 0x4A8A60 || unit->+0x40 == 0x4B03A0)
    unit->+0x40->+0x5c -= 1;                  // ★ 存活数 -1
```

### 4.3 兵力字段：`general+0x42/+0x44` 不是战场计数 `[确认]`

- `general+0x42` = 帶兵數当前、`+0x44` = 帶兵數上限（04b 的标注正确），`+0x46/+0x48` = 騎兵數当前/上限。
- **战场的减员完全不走这两个字段**：全 `.text` 里写 `[reg+0x42]`（word）的真实指令**只有一条**——`0x40F294`，位于升级函数 `0x40F23C`：

```c
0x40F23C(general* g) {
    int hpOver = (short)g->+0x10 - 0x40A020(g);
    int mpOver = (short)g->+0x14 - 0x40A098(g);
    g->+0x2e += 1;                       // 等级 +1
    g->+0x42 = 0x409FB6(g);              // 帶兵數当前 ← 新上限
    g->+0x46 = 0x409FD8(g);              // 騎兵數当前 ← 新上限
    ...
}
```

- 战场开场由 `0x43A1C4(A, B)` 把武将字段拷进战场单位：`unit+0x14 <- g+0x44`、`+0x18 <- g+0x48`、`+0x1C <- g+0x10`、`+0x20 <- g+0x14`、`+0x24 <- g+0x12`、`+0x28 <- g+0x16`、`+0x2C <- g+0x38`(士氣)。`[确认]`

**结论（负面）：战场上的"还剩几个兵"只存在战场单位的 `+0x5C`，死亡只减它；战后怎么把存活数写回 `general+0x42`，本次没找到——全 EXE 没有第二处写 `+0x42` 的指令（可能是通过指针别名写入，或走 04b 记的 `0x410CA3` 结算但用了间接寻址）。这一点 04b 需要修正/补查。`[未解]`**

---

## 5 远程 / 骑乘差异

### 5.1 弓弩（Process 12）走独立路径，但共用命中与伤害 `[确认]`

```
弓兵 obj (Process 3/4) --SHOT1-3 动画--> 生成 ForceArrow obj (Process 12)
   Process12 TICK: 取当前格 → 0x43AF7A 找目标
       ├─ 有敌方目标 → 0x43D862(shooter, target)
       │      ├─ 0x43D400(shooter,target) 命中 → target 收 OM_PAIN(param=shooter->+0x44)
       │      └─ 未命中 → target 收 0x1000A（闪避）
       └─ 无目标/友军 → 自毁（落空）
```

- 判定函数与近战**完全相同**（`0x43D400`），没有"远程命中率修正"。`[确认]`
- 伤害也仍是受击方算：**箭矢本身不改血**，`+0x8C` 只标记"已落地"。`[确认]`
- 图中"弓兵 → 生成 ForceArrow"这一段是**结构重建**：`0x43E28B` 只证明"箭矢对象自己在 TICK 里找格、调 `0x43D862`、用 `+0x74` 当发射者"，谁把 `+0x74` 填进去、什么时候 `0x469900` 生成它，没定位。`[推测]`
- 法术箭（Process 9）、法术波（Process 6）**不走** `0x43D862`，直接发 `OM_DEATH` 秒杀兵，打武将只自毁——所以法术箭对武将无效（或被别处处理）`[确认代码 / 效果 推测]`。
- `MA?F*` 造型与 `SHOT1-3` 动画的挂接点（谁生成 Process 12 的 obj、`+0x74` 发射者何时写入）`[未解]`。

### 5.2 骑兵 `[确认]`

`unit->+0x2C & 4` 是"骑兵/特殊兵"位，它同时影响五处：

| 位置 | 效果 |
|---|---|
| `0x43D400` 命中 | 第一次判定失败后，`p*2/3` 再判一次（变相提高命中） |
| `0x43D4CB` 命中 | 当**目标**是骑兵时，攻方 `p` 用 `武力/3`（比对普通兵 `/2` 更低） |
| `0x43EC54` 伤害 | 攻方是骑兵时 `战力 ×120/100` |
| `0x43DC56` 尸体位移 | 骑兵用 `rand(0x10000)+0x30000`，普通兵 `+0x40000` |
| `0x43DB0D` | 骑兵死亡先调 `0x43DA1A`（内部 `[未解]`） |

---

## 6 未解

1. **战后兵力回写**：`general+0x42` 全 EXE 只有升级函数写它；战场减员只动 `unit+0x5C`。战后结算（`0x41048D`/`0x410CA3`/`0x410AC1`）如何把 `+0x5C` 落回武将字段，没找到。`[未解]`
2. **`unit+0x54 == 1` 的语义**：Process 4 的 PAIN 见到它就完全不掉血（`0x43F39A`）。是"免疫/无敌/已败/单挑中"？没追写入点。`[未解]`
3. **`obj+0x44` 的真实来源**：构造时从生成描述 `+0x10` 拷入（`0x4218D6`），但那个描述结构是 thingdef 还是 per-spawn 参数，没定。`[未解]`
4. **`0x4A6668` 必中旗标的触发条件**：已知 `0x43D2DC` 在 `0x43B961(unit) <= 1` 时以 1/8 概率置 1，`0x43B961` 的语义未读。`[未解]`
5. **骑兵阵亡特例 `0x43DA1A`**：未反汇编。`[未解]`
6. **法术伤害数值**：`0x40ABDD` 发 PAIN 时 param 是法术对象，`0x43EC54` 会用 `法术obj->+0x84->+0x70` 算 `p/48`。这个值是否等于游戏内法术伤害，未验证。`[未解]`
7. **Process 13/15/16/17/18/19/20/21**：只确认"它们不发 OM_PAIN"，没逐条读它们是否处理 PAIN（装饰类，理论上收不到）。`[推测]`
8. **`0x43E55C`（Process 3 的默认分支派发器）**：未展开，`0x43E168`（删对象）没有跳表项指向它，可能在这里被调用。`[未解]`

### 与 04b 的差异（不改 04b，仅在此记录）

| 04b 的说法 | 本次实测 | 依据 |
|---|---|---|
| `OM_PAIN` 之后扣血分散在各 Process | 对，但只有 P3/P4 两个 Process 真正反应；且 param 不含伤害值 | §1.3、§3 |
| `obj+0x08/+0x0C` 格坐标、`+0x10/+0x14` 像素 16.16 | `+0x08/+0x0C` 是**当前位置(16.16)**，`+0x10/+0x14` 是**目标位置(16.16)**（`>>16` 才得格号） | `0x43BE08`、`0x43D862` |
| `general+0x10/+0x12` = 體力当前/上限 | 扣血扣的是 **`+0x12`**；`+0x10` 是 `0x42D3A5` 处赋的同值副本 | `0x43F3DA`、`0x42D3A5` |
| 0x410CA3 结算写回 `+0x42` | 全 `.text` 仅 `0x40F294` 一处写 `+0x42`，且在升级函数里 | §4.3 |

---

## 7 复现命令

```powershell
$env:PYTHONIOENCODING='utf-8'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$py='C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe'

# 1) Process 注册表（21 个 id → 处理器）
& $py F:\sanguo\work\dd.py 0x430630 200

# 2) Process 3 全函数（含 13 项跳表 @0x43E193 与 PAIN 分支 0x43E077）
& $py F:\sanguo\work\dd.py 0x43DDBF 400

# 3) 扣血公式
& $py F:\sanguo\work\dd.py 0x43EC54 140

# 4) 武将 PAIN
& $py F:\sanguo\work\dd.py 0x43F376 90

# 5) 命中判定
& $py F:\sanguo\work\dd.py 0x43D400 60
& $py F:\sanguo\work\dd.py 0x43D4CB 70

# 6) 箭矢
& $py F:\sanguo\work\dd.py 0x43E28B 250

# 7) 任意地址的 xref（imm + 内存位移）
& $py F:\sanguo\work\xr.py 0x4C09E0 0x4A6668

# 8) 消息常量字节扫描（谁发 OM_PAIN / OM_DEATH）
& $py -c "
import pefile,struct
pe=pefile.PE(r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe')
t=[s for s in pe.sections if s.Name.startswith(b'.text')][0]
base=0x400000+t.VirtualAddress; buf=t.get_data()
for nm,v in (('PAIN',0x10004),('DEATH',0x10003),('MISS',0x1000A)):
    pat=struct.pack('<I',v); i=0; hits=[]
    while True:
        i=buf.find(pat,i)
        if i<0: break
        hits.append('%08X'%(base+i)); i+=1
    print(nm,len(hits),' '.join(hits))
"
```

已有 dump 文件（均在 `F:\sanguo\work\`）：

| 文件 | 内容 |
|---|---|
| `dis_dmg_p03_forceSolder.txt` | Process 3 全函数（331 行） |
| `dis_dmg_p04_pain.txt` | Process 4 DEATH/PAIN 分支 |
| `dis_dmg_p04_forceMajor.txt` | Process 4 派发与其它分支 |
| `dis_dmg_43EC54.txt` | 扣血公式（133 行） |
| `dis_dmg_p02_troop.txt` | Process 2 全函数 |
| `dis_dmg_p05_general.txt` | Process 5 |
| `dis_dmg_p0C_forceArrow.txt` | Process 12 箭矢 |
| `dis_dmg_defmsg_422847.txt` | 默认处理器 |
| `dis_dmg_40AB.txt` | 法术掩码应用器 |
| `dis_dmg_regproc_422BD0.txt` / `dis_dmg_procmap_422BEB.txt` | Process 表 setter/getter |
| `dis_dmg_43731D.txt` | INI `Process=` 读取 |
| `dis_dmg_ctor_4218E0.txt` | 物件构造（含 `+0x4C` 赋值） |
| `dis_dmg_fields.txt` | `+0x42`/`+0x5c` 字段读写全扫描 |

脚本：`F:\sanguo\work\dd.py`（线性反汇编 + GBK 字串注释）、`xr.py`（全 `.text` xref）、`scan_msgslot.py`（`call [reg+0x4c]` 扫点）、`scan_proctab_xref.py`、`scan_regproc_callers.py`。
