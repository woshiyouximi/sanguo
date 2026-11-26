# 原作大地图时间流 —— 字节级取证报告

对象：`F:\sanguo\work\units_per_side\Sango2.exe`（PE32 i386，682496 B，ImageBase 0x400000）
工具：`llvm-objdump -d`（NDK 23.1）、自写 `pe.ps1`（PE 段解析 / Big5 字符串 / IAT 名称解析）
全量反汇编：`F:\sanguo\work\orig_time\full_dis.txt`（166105 行）；字符串表：`strings.tsv`（3761 条）
注意：llvm-objdump 把**绝对内存操作数打成十进制**（`movl $3600, 4993248`），xref 检索用十进制。本报告已把十进制换成 hex 标注。

---

## §0 一句话结论

原作大地图的时间是**一个按帧自动递减的整数计数器 T=[0x4C30E0]**（3600/年、300/月、10/天），
**每帧自动 −1，与玩家输入无关**；T 减到 0 时**自动**切进内政场景并在进入时 `year+1`，内政期间 T 冻结；
「內政終了」按钮只做**确认框 → 回调里把 T 重置为 3600 并切回大地图**。
**原作没有「月份推进函数」，也没有任何一次性跑 12 个月的代码**——"月"只是从 T 现算出来的显示值（`(3600−T)/300+1`），"年"是内政入口处唯一自增的全局 `0x4BD390`。

---

## §1 证据清单

### E1 主循环：唯一的「定时器」就是 for(;;) 主循环
`0x430422` 起（函数体 0x430430–0x430612，末尾 `jmp 0x430468` 无条件回跳）：

```
430422 calll 0x468680          ; 清 30 项 FPS 环形缓冲 @0x4D25E0，idx[0x4A7A00]=0
430427 calll 0x468530          ; [0x4A79F4]=0 ; [0x4A79F8]=0x450410()  帧计时器复位
43042c movl $1, 4969356        ; ★[0x4BD38C] = 本帧逻辑步数，默认 1
430436 cmpl $0, 4875512        ; 速度变量 [0x4A64F8]==0 ?
43043f movl 4875512, %edx
          movl %edx, 4969356   ; 否则 步数 = 速度变量
43044b calll 0x450410
430453 calll 0x468720
430468 cmpl $0, 4875500        ; [0x4A64EC] 退出标志
430475 calll 0x4685c0 ; testl ; je 0x43050d      ; ★逻辑帧闸门
430482 movl $0, -156(%ebp)                        ; i = 0
43049d cmpl 4969356, %ecx ; jge 0x430508          ; for (i < 步数)
4304ab   pushl $3
4304b0   pushl [0x4A6600]                          ; 当前场景对象
4304bc   calll *4(%eax)                            ; ★★ scene->handler(scene, 3) = update
4304bf   calll 0x468730
430501   calll 0x451eca ; jmp 0x43048e             ; i++
430508 calll 0x4685f0
43050d calll 0x468630 ; testl ; je 0x4305f5        ; 画帧闸门
4305b4 pushl $4 ; pushl [0x4A6600] ; calll *4(%ecx) ; draw
4305cd addl $1, -136(%ebp)                          ; 帧计数++
4305e1 pushl $5 ; pushl [0x4A6600] ; calll *4(%ecx) ; present / flip
430608 calll 0x43021f                               ; Win32 消息 + DirectInput 轮询
43060d jmp 0x430468                                 ; ← 无限循环
```
- 确认方式：函数入口 `0x430422` 的调用点即 `main`（0x4011xx 区），循环尾部 `43060d: jmp 0x430468`（相对回跳，objdump 直接给出目标）。
- **结论：没有 SetTimer、没有 WM_TIMER、没有逻辑线程。** timeSetEvent 只有 6 个调用点（0x40AFC2/0x40AFDA/0x40AFE4/0x40BB8C/0x40BB96 音频 waveOut 流、0x45136D=AVI 播放，见 E2-b），全部与游戏时钟无关。
- 时间推进只挂在 `msg==3`（update）上；大地图场景的 msg3 再调到时间核心（E5）。

### E2 帧计时：GetTickCount → 1/1024 秒定点
| 地址 | 指令 | 作用 |
|---|---|---|
| 0x450410 | `calll *5063648`（IAT 0x4D43E0 = **GetTickCount**，已用 IAT hint/name 解析确认）; `fildll`; `fmuls 0x47F5C4`; `fdivs 0x47F5C8`; `calll 0x46dab0` | 返回 `ms × 1024 / 1000`，**时间单位 = 1/1024 s ≈ 0.977 ms**。0x47F5C4=1024.0f、0x47F5C8=1000.0f（用 pe.ps1 读 float 确认） |
| 0x468570 | `now=0x450410(); dl=now-[0x4A79F8]; [0x4A79F8]=now; [0x4A79F4]+=dl; return [0x4A79F4]` | 帧间隔累加器 |
| 0x468550 | `[0x4A79F4]=arg; [0x4A79F8]=0x450410()` | 重设累加器 |
| 0x4685A0 | `a=0x468570(); a-=arg; 0x468550(a)` | 消耗累加器 |
| 0x4685C0 | `mode=[0x4A2C5C]; if(mode==1||mode==3) return (0x468570()>=17); return 1` | **逻辑定帧闸门：17/1024 s ≈ 16.6 ms ≈ 60 Hz**（`0x4685dc: cmpl $17`） |
| 0x4685F0 | `[0x4A79BC]++; 0x4685A0(17); if(0x468570()>272) 0x468550(272)` | 帧尾：消耗 17，追赶上限 272/1024≈265 ms |
| 0x468630 | `if([0x4A79BC]==0) return 0; if((mode==2||mode==3)&&0x468570()>=17&&[0x4A79BC]<16) return 0; return 1` | 画帧闸门 |
| 0x468670 | `[0x4A79BC]=0` | draw 后清帧忙 |
| 0x4686A0 | 把 `0x450410()` 写入环形缓冲 `[0x4D25E0+idx*4]`，idx=[0x4A7A00]，满 30 归 0 | FPS 统计 |
| 0x4686D0 | `return 29696/(ring[(i-1)%30]-ring[i])` | FPS 数值（29696=0x7400） |

**关键：帧限模式 `0x4A2C5C` 在整个 EXE 里只有 2 个读点（0x4685C0、0x46863C），0 个写点**
（在 full_dis.txt 里搜十进制 4861020，只命中这两条 `movl 4861020,%eax`）。
→ 它恒为 0 ⇒ `0x4685C0` 恒返回 1、`0x468630` 也不会跳帧 ⇒ **主循环不受限帧，按渲染速度空转**。
即「1 tick = 1 次主循环迭代」，帧率由 DirectDraw 渲染/flip 的实际耗时决定（未强制 vsync / 未强制 60fps）。

**timeSetEvent 只属于 AVI 播放**：`0x45136D calll *5063988`（IAT 0x4D4334 = timeSetEvent），
其所在函数 0x451300–0x451376 里先 `calll *80(%ecx)/*84(%ecx)`（stream 接口）、`pushl $480; pushl $640`（640×480 视频），
配对 `0x451519 calll *5063960`（timeKillEvent）。**与游戏时间无关。**

### E3 速度变量：0x4A64F8（每帧多跑几次 update）
- 唯一写点 `0x40B76B: movl %eax, 4875512`；上一行 `0x40B763 calll 0x46dbf0`（atoi）。
  上游 `0x40b70a: pushl $4747552`（=0x487120，命令行/配置键名表）→ `0x47db60`（strcmp）→ 取下一个参数字符串 atoi。
- `0x4A64F8` 位于 PE 未初始化区（文件中无初值）⇒ 默认 0 ⇒ 主循环用 **1 步/帧**。
- 另一个「步数」写点 `0x40501B: movl %ecx, 4969356` 也在同一段命令行/配置解析区（0x404E–0x4050）。

### E4 场景系统：SetScene = old(this,2) → 换指针 → new(this,1)
```
43014b push ebp; mov ebp,esp
43014e calll 0x41cd11
430153 cmpl $0, 4875776 ; je 0x43017c            ; [0x4A6600] 当前场景
43015c movl [0x4A6600],%eax ; cmpl $0,4(%eax) ; je 0x43017c
430167 pushl $2 ; pushl [0x4A6600] ; movl [0x4A6600],%edx ; calll *4(%edx)  ; ★旧场景 handler(old,2)=leave
43017c movl 8(%ebp),%eax ; movl %eax, 4875776   ; 当前场景 = 参数（描述符指针）
430184 movl 8(%ebp),%ecx ; movl (%ecx),%edx ; movl %edx, 4771096  ; [0x48CD18] = 场景 id
430192 cmpl $0, 4(%eax) ; je 0x4301a7
430198 pushl $1 ; pushl 8(%ebp) ; movl 8(%ebp),%edx ; calll *4(%edx) ; ★新场景 handler(new,1)=enter
```
描述符布局：`{+0: int 场景id, +4: handler(this, msg)}`。已知场景描述符表（pe.ps1 逐 dword 读出）：

| 地址 | id | handler | 猜测用途 |
|---|---|---|---|
| 0x48CD48 | 0 | 0x437DE7 | 未定 |
| 0x48CD50 | 3 | **0x423973** | **内政场景**（E9） |
| 0x48CD58 | 1 | **0x41B94A** | **大地图场景**（E5） |
| 0x48CD60 | 2 | 0x444459 | 未定 |
| 0x48CD68 | 4 | 0x447F39 | **战斗场景**（由 0x446A90 起战切入，E12） |
| 0x48CD70 | 5 | 0x435840 | 未定（菜单/势力地图类） |
| 0x48CD78 | 6 | 0x435FB7 | 未定 |
| 0x48CD80 | 7 | 0x406320 | 未定（启动/标题类） |

`0x43014B` 全程序 19 个调用点（行号：6831/33742/33765/33769/33861/38470/60779/60793/60891/60910/60925/64564/66810/67260/69952/72662/85672/88673/90546）。

### E5 大地图场景（id 1 = 0x41B94A）：msg3(update) 里推进时间
```
41b950 movl 12(%ebp),%eax ; subl $1 ; movl %eax,-48(%ebp)
41b95f cmpl $3,-48(%ebp) ; ja 0x41bbe1          ; msg 1..4 分发
41b96c jmpl *4307941(,%edx,4)                    ; 跳表 VA = 0x41BBE5
```
跳表 0x41BBE5 原始字节 `6a bb 41 00 | cd bb 41 00 | 73 b9 41 00 | e6 ba 41 00`
= **[msg1→0x41BB6A(enter), msg2→0x41BBCD(leave), msg3→0x41B973(update), msg4→0x41BAE6(draw)]**。

msg3 = 0x41B973（时间推进的唯一入口）：
```
41b973 calll 0x41bec1 ; testl ; jne 0x41b999   ; 模态面板打开 → 走 0x41ba1a（不减 T）
41b97c cmpl $0, 4875328 ; jne 0x41b999         ; 子状态 [0x4A6440] != 0
41b985 calll 0x44b084 ; testl ; jne 0x41b999
41b98e cmpl $0, 5055964 ; jne 0x41b999         ; [0x4D25DC]
41b99b movl $0, 4875360
41b9a5 calll 0x41f77f
41b9aa pushl $2 ; calll 0x4226ab
41b9b9 calll 0x41b127        ; ★实体/行军推进（E12）
41b9be calll 0x41b184
41b9c3 calll 0x41b613
41b9c8 calll 0x46c340
41b9cd pushl $5055936 ; calll 0x40e4e5
41b9da pushl $5055936 ; calll 0x44af6b
41b9e7 calll 0x41bec1 ; testl ; je 0x41b9ff
41b9f0 movl $0, 4875360 ; jmp 0x41bbe1        ; ★模态又打开 → 直接 return，T 不减
41b9ff calll 0x434761
41ba04 calll 0x41c24e
41ba09 calll 0x44ac6b
41ba0e calll 0x41152c
41ba13 calll 0x41b699        ; ★★★ 时间核心（全程序唯一调用点）
41ba18 jmp 0x41ba4d
41ba1a …（模态/子状态非0 分支：只做 UI 更新，落到 0x41ba4d，不减 T）
```
**确认被调用**：全量反汇编里 `calll 0x41b699` 只有 `41ba13` 一处；`calll 0x41b973` 只来自 0x41BBE5 跳表的第 3 项。

### E6 时间核心 0x41B699：T −= 1，归零分支
```
41b69c subl $132,%esp
41b6a2 cmpl $0, 4875328 ; je 0x41b6b0          ; [0x4A6440]==0 才倒计时
41b6b0 cmpl $1, 4748048 ; jne 0x41b709         ; [0x487310]==1（游戏模式）才倒计时
41b6b9 movl 4993248,%eax
41b6be subl $1,%eax
41b6c1 movl %eax, 4993248                       ; ★T = T - 1（每帧一次）
41b6c6 cmpl $0, 4993248 ; jg 0x41b709           ; 未到 0 → 继续
41b6cf movl $1, 4875516                         ; [0x4A64FC] = 1（新年标志）
41b6d9 movl $0, 4875452                         ; [0x4A64BC] = 0
41b6e3 pushl $4757580                           ; 0x48984C = "%D200%內政時間到了....%k%%e%"
          movl 4875504,%ecx ; … pushl $0
41b6f? calll 0x4347b6                           ; 播放该文本/对话
41b6ff movl $1, 4875328                         ; ★[0x4A6440] = 1 → 下一帧切内政
41b709 calll 0x41b643
41b70e testl %eax,%eax ; jne 0x41b71f           ; 0x41B643()!=0 → 播统一结局文本 0x48986C
41b712 movl 4880840,%ecx ; andl $64,%ecx ; test ; je 0x41b77d   ; ESC/右键位
41b71f … pushl 4757612(0x48986C) … movl $2, 4969348 ; [0x4BD384]=2
                                       movl $3, 4875328 ; [0x4A6440]=3
41b77d … andl $2 … calll 0x40975e … movl $1, 4969348 ; [0x4BD384]=1
                                       movl $3, 4875328 ; [0x4A6440]=3
41b7ee retl
```
- `0x41B643`：遍历链表头 `0x4094C0`（next 字段 +0x346），若存在「非当前场景对象」的节点 → 返回 0；
  全都没有 → 返回 1 ⇒ 视为**已统一天下**（配合 0x48986C 的结局文案）。
- **单位是「帧/tick」，不是毫秒**。T 的初始/重置值 3600 见 E8。

### E7 T（[0x4C30E0]=4993248）的全部写点 / 读点
（在 full_dis.txt 里搜十进制 `4993248`，共 9 处）
- **写**：`0x40E21A movl $10, T`（输入位 [0x487314]&0x100000000 的调试键）、
  `0x41BC1F movl $3600, T`（内政終了回调，E8）、
  `0x42C214 movl %ecx, T`（ecx=0：新游戏初始化 0x42C1F4 起）、
  `0x433AB3 movl %ecx, T`（ecx = 存档块 [0x4BD268]+0x30，**读档**）。
- **读/减**：`0x41B6B9/0x41B6C1`（−1）、`0x41B6C6`（判 0）、`0x41B84E`（HUD 日期）、
  `0x41B8C3`（T/60 且结果未使用＝死代码）、`0x41BBF8`（判 0）、`0x43216F`。

### E8 「內政終了」按钮 → 确认框 → T=3600 + 切回大地图
1) 按钮记录：**表 @0x48A4F0，stride 0x38**，字段 `{+0=0x12, +4=x, +8=0x64, +0xC=0x14, +0x18=handler, +0x1C=data(0x48A598)}`。
   三条：0x48A4F0→handler 0x4288C3、0x48A528→0x42893E、**0x48A560→0x427FE0（标签 0x48B420="內政終了"）**。
   字节搜索确认：dword `0x00427FE0` 在整个 EXE 只出现在 VA 0x48A578（=0x48A560+0x18）。
2) `0x427FE0` 的 msg2（绘制）：
```
4280xx pushl $32898  ; 0x8082
       pushl $63748  ; 0xF904
       pushl $33808  ; 0x8410
       pushl $65535  ; 0xFFFF
       pushl $4764704 ; 0x48B420 = "內政終了"
       pushl this
       calll 0x41DEF3 ; 6 参数 cdecl 文本绘制封装
```
   ⇒ **0x8082 / 0xF904 / 0x8410 / 0xFFFF 是绘制参数（颜色/标志），不是窗口消息号或控件 id**（同一组常量在 0x468A10 的绘制调用里也成对出现）。
3) `0x427FE0` 的 msg4（激活）：
```
428021 pushl $255 ; pushl $4764716(0x48B42C="ACCEPT") ; calll 0x4697b0   ; 音效
428033 pushl $4758912(0x489D80) ; calll 0x41c889                       ; 设当前对话框记录
428040 pushl $4358102(0x427FD6) ; calll 0x41f706                       ; ★注册"确认后回调"
42804d pushl $400 ; pushl $400 ; pushl $4758912 ; calll 0x41bed5         ; 摆出模态确认框
```
4) `0x41F706` = 纯 setter：`movl 8(%ebp),%eax; movl %eax,4875416(0x4A6498); ret`。
   注册点共 8 处：0x41F576、0x428045、0x428BA4、0x428E7E、0x4383B1、0x449134、0x44ED7F、0x44EE71。
5) 确认框 handler `0x41F62D` 的 msg4 分支（0x41F65F）：
```
41f6xx pushl $255 ; pushl $4759860(0x48A134="ACCEPT") ; calll 0x4697b0   ; 音效
       pushl $1024 ; … calll 0x41cAB5                                  ; memcpy(obj+0x1C)
41f685 cmpl $0, 4875416(0x4A6498) ; je …
41f68e calll *4875416                                                  ; ★调用注册的回调
```
6) 回调 `0x427FD6`：`push ebp; mov ebp,esp; calll 0x41BBF5; pop ebp; ret`（唯一调用点 0x427FD9）。
7) `0x41BBF5`：
```
41bbf8 cmpl $0, 4993248 ; jne 0x41bc29     ; T!=0 → 跳过重置
41bc01 calll 0x4094c0                       ; 链表头（next=+0x346）
41bc06 testl %eax,%eax ; je 0x41bc1f
41bc0a movl $0, 44(%eax)                    ; 每节点 +0x2C = 0（年度重置标记）
41bc11 movl 838(%eax),%eax ; jmp 0x41bc06
41bc1f movl $3600, 4993248                  ; ★T = 3600（新一年）
41bc29 pushl $4771160                       ; 0x48CD58 = 大地图场景描述符 {1, 0x41B94A}
41bc2e calll 0x43014b                       ; SetScene(大地图)
```
⇒ **按钮本身不改月份、不跑模拟**：它只是「ACCEPT 音效 + 弹确认框」，确认后回调把 **T 重置成 3600** 并切场景。时间之所以「开始流动」，是因为回到大地图场景后每帧都会执行 E5/E6。

### E9 内政场景（id 3 = 0x423973）：进内政 = year+1，内政期间 T 冻结
```
423979 movl 12(%ebp),%eax ; sub 1 …  jmpl *4340634(,%edx,4)   ; 跳表 VA 0x423B9A
        → [msg1=0x423A2A, msg2=0x423B75, msg3=0x42399C, msg4=0x4239DE]
```
- **msg1 enter (0x423A2A)**：
```
423a2a movl $143, 4771116      ; [0x48CD2C]=143（背景/面板号；大地图 enter 用 144）
423a34 movl $2, 4875404
423a3e movl $0, 4875444
423a48 calll 0x46b580
423a4d calll 0x4238af          ; ★★ 年 +1（唯一调用点）
423a52 pushl $52 ; pushl $0 ; calll 0x41f740
423a5e cmpl $0, 4875444 ; jne … ; calll 0x4238d9
423a6c pushl $4 ; pushl 4875504 ; calll 0x409c1d
```
- **msg3 update (0x42399C)**：`0x41F77F`、`0x41BEC1`（模态?）→`0x4238D9`、`0x46C340`、`0x437B90`、`0x434761`、`0x41C24E`、`0x469A70`。
  **这一支不读也不写 [0x4C30E0] ⇒ 内政期间时间完全停住。**
- **年++ 函数 0x4238AF**（唯一调用点 0x423A4D）：
```
4238b2 cmpl $1, 4875516(0x4A64FC) ; jne 0x4238d7   ; 只在新年标志==1 时做
4238bb movl 4969360,%eax ; addl $1,%eax ; movl %eax,4969360   ; ★[0x4BD390] = year + 1
4238c8 calll 0x423885        ; 年度结算（0x423681/0x423765/0x42379e/0x4237a6 + 0x423824）
4238cd movl $0, 0x4A64FC     ; 清标志
```
- 「内政時間到了」文案 `0x48984C = "%D200%內政時間到了....%k%%e%"`（E6 里 T 归零时播）。
- 内政界面相关 Big5：`0x48B420="內政終了"`、`0x48B3A0="%s城"`、`0x48B3C0="力增加%d。"`、`0x48B3E0="的武將。%K%"`、`0x48B400="禦力最高了。%%K%%"`、`0x48B440="ACCEPT"`、`0x48B460="MENU\D1_1B"`。

### E10 年/月/日显示公式（HUD 0x41B7F2）
```
41b7f8 calll 0x41bec1 ; testl ; jne ret        ; 模态打开则不画
41b849 b8 10 0e 00 00  movl $3600,%eax          ; ★TICKS_PER_YEAR=3600
41b84e 2b 05 e0 30 4c 00 subl 4993248,%eax      ; eax = 3600 - T = 已流逝 tick
41b854 99              cltd
41b855 b9 2c 01 00 00  movl $300,%ecx           ; ★TICKS_PER_MONTH=300
41b85a f7 f9           idivl %ecx               ; eax=月序(0..12), edx=月内余数(0..299)
41b85c 83 c0 01        addl $1,%eax             ; month = 商+1
41b85f 83 f8 01 / 7d 05 / movl $1  →  clamp 下界 1
41b869 83 f8 0c / 7e 05 / movl $12 →  clamp 上界 12
41b873 89 d1           movl %edx,%ecx  (余数)
41b879 b9 0a 00 00 00  movl $10,%ecx            ; ★TICKS_PER_DAY=10
41b87e f6 f9           idivb %cl                ; al = 余数/10（0..29）
41b881 0f be c8        movsbl %al,%ecx
41b884..41b892         clamp 0..29 → 然后 +1
41b89a 52              pushl %edx   ; month
41b89c 8b 0d 90 d3 4b 00 movl 4969360,%ecx      ; ★year = [0x4BD390]
41b8a2 51              pushl %ecx   ; year
41b8a3 68 e4 98 48 00  pushl $4757732            ; 0x4898E4 = "%3d年%2d月%2d日"
41b8a8..41b8bb         颜色/尺寸参数 + calll 0x468a10   ; printf 风格文本绘制 (x=30,y=14,1023,0xFFFF,0x8410,fmt,year,month,day)
```
- 日期格式串 `0x4898E4` 在全程序**只有一个 xref = 0x41B8A3**（搜十进制 4757732 确认）。
- **月份/日期都不是存出来的，是从 T 现算的**；**year 是独立全局 0x4BD390**。
- year 的旁证：0x423023/33/3F/59/65/7F/8B 用 `cmpl $187/$195/$194/$205/$204/$214/$213` 比较它（三国历史事件年份表）。

### E11 时间也是存档字段（读档会恢复 T 和 year）
```
433a98 a1 68 d2 4b 00   movl 4969064,%eax        ; [0x4BD268] = 存档/剧本状态块指针
433a9d 8b 48 58         movl 88(%eax),%ecx       ; +0x58
433aa0 89 0d 90 d3 4b 00 movl %ecx,4969360         ; ★year = state+0x58
433aa6 0f bf 48 5c      movswl 92(%eax),%ecx ; movl %ecx,4875452   ; [0x4A64BC] = state+0x5C
433ab0 8b 48 30         movl 48(%eax),%ecx       ; +0x30
433ab3 89 0d e0 30 4c 00 movl %ecx,4993248         ; ★T = state+0x30
433abb 0f bf 50 5e      movswl 94(%eax),%edx ; movl %edx,4875516     ; [0x4A64FC] = state+0x5E
```
⇒ 状态块 `[0x4BD268]` 的 `+0x30 = T`、`+0x58 = year`。新游戏初始化 `0x42C214` 则把 T 置 0（随后由 E8 的回调置 3600）。

### E12 行军/兵团推进：**每帧推进，不存在"每月移动"**
大地图 msg3 → `0x41B127`：`head = *(0x4A62B4)`；`while (p) { 0x41AFAB(p); p = p->[+0xA6]; }`
`0x41AFAB`（关键指令，全部逐条 objdump 核对）：
```
41afb1 push p ; calll 0x405499 ; if (ret==1) goto 0x41b03d   ; 0x405499 = (p->[+0x9E]==2)，行军中则不重算倒计时
41afc5 movl 154(%p),%edx ; subl $1 ; movl %edx,154(%p)       ; ★p->[+0x9A] 倒计时--（每帧 1）
41afda cmpl $0, 154(%p) ; jg 0x41b03d                        ; 未到 0 → 跳过
41afe3 push p ; calll 0x41af58                               ; ★推进一格
41aff2 eax=4980 ; idivl 130(%p) ; movl %eax,154(%p)           ; 倒计时 = 4980 / p->[+0x82]
41b00a ecx = 999 - 142(%p)                                    ; 999 - p->[+0x8E]
41b01e eax = 154(%p)*ecx ; ecx=2997 ; idivl %ecx ; addl %eax,154(%p)   ; 再按 (999-速度)/2997 加权
41b03d cmpl $0, 20(%p) ; jne … ; movl $0, 134(%p) ; movl $0, 146(%p)   ; if(p->[+0x14]==0){进度=0;累积=0}
41b060 movl 4880840,%eax ; andl $2,%eax ; …                   ; 输入位加速：p->[+0x92] += 10
41b0a8 遍历 p->[+0x24] 链（next=+0xE3），while (p->[+0x30] < movswl p->[+0x44])
41b0bd   if (p2->[+0x91]==2) { calll 0x406f3f(p2) ; p->[+0x30]++ }   ; 逐个放出子单位（遭遇）
41b0e9 p->[+0x86] = min(p->[+0x86], p->[+0x82])               ; 进度夹到总步数
```
`0x41AF58`（推进一格）：
```
if (p->[+0x92] < 100) return;      ; 累积进度不足 100
if (p->[+0x86] >= p->[+0x82]) return;  ; 已到终点
p->[+0x86]++ ; p->[+0x92] -= 100 ;
```
命令下达处的常量（`0x427A84` 与 `0x42DA20` 两处同构）：
```
0x427a8f calll 0x405499 ; if (p->[+0x9E]==2) return 0     ; 已在行军 → 不能再下命令
0x427aa5 cmpl $1000000, 138(%p) ; jl …                    ; p->[+0x8A] 距离 < 1,000,000
…  movl %eax, 130(%p) ; cmpl $600, 130(%p)                ; p->[+0x82] = 110 + p->[+0x8A]/2500，夹 600
    movl $0, 134(%p)                                       ; 进度清零
…  movl %eax, 158(%p)                                      ; p->[+0x9E] = 状态（数据表取值）
   calll 0x406056(p)                                       ; 速度/时长换算（读 p->[+0x8A]）
```
结构偏移小结（链表 `[0x4A62B4]`，next = +0xA6）：

| 偏移 | 含义（由用法推断） |
|---|---|
| +0x24 / +0xE3 | 子单位链表头 / next |
| +0x30 | 已放出子单位数 |
| +0x44 | 该军团子单位总数（word） |
| +0x82 | 总步数 = 110 + 距离/2500（≤600） |
| +0x86 | 已推进步数 |
| +0x8A | 距离（<1,000,000） |
| +0x8E | 速度权重（0..999，值越大越快：999 → 不加成） |
| +0x92 | 累积进度（每满 100 推一格） |
| +0x9A | 距下一格的倒计时 tick 数 |
| +0x9E | 状态：0 待命 / 1 ? / 2 行军中（0x405499 判定） |
| +0xA6 | next |

**关键否定结论：整条推进链没有任何"月份/日"判断，也没有读 [0x4C30E0]。行军按帧推进，与日历无关。**

### E13 已排除的假设（都用字节证据排除）
| 假设 | 排除依据 |
|---|---|
| 用 `SetTimer`/`WM_TIMER` 驱动 | 导入表无 SetTimer；USER32 只有 GetMessage/PeekMessage/DispatchMessage/TranslateMessage/WaitMessage；timeSetEvent 只用于 AVI（E2-b） |
| 0x8082 / 0xF904 / 0x8410 / 0xFFFF 是窗口消息号/控件 id | 它们只作为参数进入绘制封装 0x41DEF3 / 0x468A10（E8-2） |
| 0x41DEF3 = "注册定时器" | 它是 6 参数文本绘制封装（内部 0x46CA60/0x46CAB0 成对、0x46C970 设矩形、0x46CCC0 出文本） |
| 0x4A6478 / 0x4A647C / 0x489900 = 年/月/日三个整数 | 它们是"当前数据表指针 / 当前子记录指针 / 索引"，由 0x41C889 维护（56 字节定长记录，idx=rec+0x20，cur=base+idx*56） |
| 有"每月结算函数"被定时调用 | T 的 9 个 xref 里没有任何按月分支；0x41B699 只有 T-- 与 T==0 两个分支 |
| 帧率被锁 60 Hz | 帧限模式 [0x4A2C5C] 无写点，恒 0 → 0x4685C0 恒返回 1（E2 末） |

---

## §2 状态机（文字版）

```
                        ┌──────────────────────────────────────────────┐
                        │  大地图场景  id=1  handler=0x41B94A           │
                        │  每帧 msg3 → 0x41B973 → … → 0x41B699: T -= 1 │
                        │  HUD: month=(3600-T)/300+1, day=((3600-T)%300)/10+1 │
                        └───────────────┬──────────────────────────────┘
                                        │ T 减到 0（0x41B6C6 jg 未跳）
                                        │ 播 0x48984C「內政時間到了」；[0x4A6440]=1
                                        ▼
                        ┌──────────────────────────────────────────────┐
                        │  内政场景  id=3  handler=0x423973             │
                        │  enter: year+1（0x4238AF）+ 年度结算          │
                        │  update: 不碰 T ⇒ 时间冻结                    │
                        │  玩家在此做内政/下令                          │
                        └───────────────┬──────────────────────────────┘
                                        │ 按「內政終了」→ msg4(0x428021)
                                        │  ACCEPT 音效 + 注册回调 0x427FD6 + 模态确认框
                                        │ 确认(msg4 @0x41F68E) → *0x4A6498
                                        ▼
                        0x427FD6 → 0x41BBF5：清链表各节点 +0x2C；T=3600；
                                             SetScene(0x48CD58 = 大地图 id=1)
                                        │
                                        └──────────► 回到大地图，时间继续流动

   任一时刻 [0x48CD18] != 1（非大地图场景）⇒ T 不可能变（唯一 −1 指令在 0x41B6C1，只被 0x41B699 执行，
   而 0x41B699 只被大地图 msg3 的 0x41BA13 调用）⇒ 战斗/其他场景自动冻结时间。
   大地图内部暂停条件（0x41B973 的两处 0x41BEC1 判定 + [0x4A6440] + 0x44B084 + [0x4D25DC]）：
   模态面板打开、子状态非 0 时不减 T。
```

---

## §3 「每月」执行序列 —— 实际是按帧，没有月边界函数

时间轴以 **tick（=1 次 update = 1 帧）** 为单位，一个循环如下：

| 顺序 | 发生的事 | 地址 |
|---|---|---|
| 1 | 主循环取帧时间、算本帧步数 N（默认 1） | 0x430422–0x43043F |
| 2 | 逻辑帧闸门（恒真） | 0x4685C0 |
| 3 | 重复 N 次：`scene->handler(1, 3)` → 大地图 update | 0x4304AB |
| 4 | └ 若模态/子状态忙 ⇒ 只做 UI，返回（T 不减） | 0x41B973 开头/0x41B9F0 |
| 5 | └ `0x41F77F`、`0x4226AB(2)` | |
| 6 | └ **`0x41B127` 遍历 [0x4A62B4] 链表 → `0x41AFAB` 推进每个实体一格** | 0x41B127/0x41AFAB/0x41AF58 |
| 7 | └ `0x41B184`（另一条链表，按 [0x4A7A04] 相位判定）、`0x41B613`、`0x46C340`、`0x40E4E5`、`0x44AF6B` | |
| 8 | └ 再判模态：忙 ⇒ 返回 | 0x41B9E7 |
| 9 | └ `0x434761`、`0x41C24E`、`0x44AC6B`、`0x41152C` | |
| 10 | └ **`0x41B699`：T = T−1；T==0 时播文本 + [0x4A6440]=1；判统一/ESC** | 0x41B699 |
| 11 | └ 子状态分支：[0x4A6440]==1 ⇒ SetScene(内政) | 0x41BA4D–0x41BA6D |
| 12 | 画帧闸门；`scene->handler(1, 4)` → HUD（含日期 `0x41B7F2`） | 0x4305B4 / 0x41BAE6 / 0x41BB59 |
| 13 | `scene->handler(1, 5)` present | 0x4305E1 |
| 14 | Win32 消息 + DirectInput | 0x43021F |

年度边界（T 从 1→0）之后的一帧：SetScene(内政) → 内政 enter 的 `year+1` + 年度结算 → 内政停表 →
玩家按「內政終了」→ 确认 → T=3600 → SetScene(大地图)。
**除此之外，月/日变化不产生任何事件**——`(3600−T)/300` 的商一变，只是 HUD 上数字变一次。

---

## §4 与我方现有实现的差异

我方源码：
- Cocos：`F:\sanguo\game\cocos\assets\scripts\CampaignRoot.ts`
  - `endInterior()` @ **2545**：`for (i < steps) { advanceMonth(...); advanceArmiesMonth(); runMapAi(); }`（steps 来自 `GameState.advanceSteps(from)` @2548），**整个循环在一个函数调用内同步跑完**，结束后写提示“跑完 N 个月”。
  - 触发点 `doAction('advance')` @ **2601–2607**。
  - **该文件里没有 `update()` / `schedule()` / `deltaTime`（已 grep 全文：0 命中）** ⇒ Cocos 侧完全没有逐帧逻辑。
- web：`F:\sanguo\game\web\campaign.html`
  - `endMonth()` @ **2520**：校验正月（`Saves.monthOfYear(save.month) !== 1` → 拒）→ `markMonthActed` → **`advanceMonth(12)` @2535**。
  - `advanceMonth(n)` @ **5392**：`for (i<n) { advanceOneMonth(save, …) }`，同步一次跑完。
  - 没有 setInterval/requestAnimationFrame 时钟（时间只在函数被调用时前进）。

| 项目 | 原作（字节证据） | Cocos `CampaignRoot.ts` | web `campaign.html` |
|---|---|---|---|
| 时间谁在动 | 主循环每帧：`scene->handler(1,3)` → `T-=1`（0x41B6C1） | 无逐帧时钟；按按钮时 `endInterior()` 一次跑完 | 无逐帧时钟；`endMonth()` → `advanceMonth(12)` 一次跑完 |
| 时间状态量 | 单个 T=[0x4C30E0]，初始/重置 3600（0x41BC1F） | `save.month` 自增（月计数） | `save.month` 自增 |
| 一年长度 | 3600 tick（0x41B849），一月 300，一天 10（0x41B855 / 0x41B879） | 12 次按月循环（`advanceSteps` 决定步数） | 12 次按月循环 |
| 月/日怎么来 | **从 T 现算**，不储存（0x41B849–0x41B899） | 存在 `save.month`，逐月 +1 | 存在 `save.month`，逐月 +1 |
| 年自增 | 只在**进内政**时 +1（0x4238C3），触发条件是 T 归零置的标志 0x4A64FC==1（0x4238B2） | 在 `advanceMonth` 的年进位里 | 在 `advanceOneMonth` 的年进位里 |
| 内政何时开 | **T 归零自动开**（0x41B6FF 置 [0x4A6440]=1 → 0x41BA5F~0x41BA6D SetScene） | 玩家按「內 政 終 了」→ 跑 12 个月 → 停在次年正月，然后才可进内政 | 玩家按「內政終了」→ 跑 12 个月 → 停在次年正月 |
| 「內政終了」语义 | 确认后 **T=3600 + 切回大地图**（0x41BBF5）；不跑任何月度模拟 | 一帧内跑 12 个月的模拟（含年税/行军/AI/战斗中断） | 一帧内跑 12 个月（`advanceOneMonth` ×12） |
| 时间流速 | 每帧 1 tick；速度变量 [0x4A64F8] 可让每帧跑 N 次（默认 1） | 无速率概念，瞬间完成 | 同左（`?adv=N` 只是批量次数） |
| 暂停条件 | 非大地图场景、模态面板、子状态非 0、`0x44B084()!=0`、`[0x4D25DC]!=0` | 无（不存在可暂停的时钟） | 无 |
| 行军 | 每帧推进：倒计时 `4980/总步数` tick 推一格；进度 +0x86 / 总步数 +0x82（0x41AFAB/0x41AF58） | `advanceArmiesMonth()` 按月推进（@4106） | 按月推进 |
| 时间与存档 | T、year 都在状态块 [0x4BD268] 的 +0x30/+0x58（0x433AA0–0x433AB3 读档恢复） | `save.month` 自存 | `save.month` 自存 |
| 战斗时时间 | 场景切走后 T 停止（0x41B699 只在大地图 msg3 里） | `endInterior()` 遇 `moved.battle` 立刻 return（2557–2566） | 批量模式就地结算 |

---

## §5 建议怎么改

### 5.1 共同目标
把「时间」从"按钮触发的同步批处理"改成"逐帧递减的时钟 + 事件触发"：
- 引入 `T`（0..3600）与 `speed`（每帧步数，默认 1）；
- 时间只在**大地图**推进；内政/战斗/模态面板时暂停；
- **月边界 = `(3600−T)/300` 的商变化**，此时才调用一次既有的月度结算（保留现有 `advanceMonth` 流水线，但每次只跑 1 个月）；
- **T==0 = 年边界**：自动进内政（相当于现在"停在次年正月"的那一步），进内政时做年度进位/结算；
- 「內政終了」= 确认后 `T = 3600` + 关内政面板（回到大地图），**不再跑 12 个月**。

### 5.2 Cocos（CampaignRoot.ts）
```ts
// ---- 新增常量与字段 ----
const TICKS_PER_YEAR = 3600;   // 0x41B849
const TICKS_PER_MONTH = 300;   // 0x41B855
const TICKS_PER_DAY   = 10;    // 0x41B879
const MS_PER_TICK_60FPS = 1000 / 60;   // 原作不限帧，这里取 60fps 作基准（见 §6）

private mapTick = TICKS_PER_YEAR;   // 对应 T=[0x4C30E0]
private tickAcc = 0;                // 毫秒累加器（对应 0x4A79F4 的 1/1024s 累加器）
private lastMonth = 1;
/** 时间暂停条件：内政面板、城市面板、任何模态、战斗场景、非大地图 */
private clockPaused(): boolean {
  return !this.save
      || this.cityPanel?.isOpen?.() === true      // 对应 0x41BEC1「模态打开」
      || this.sceneId !== 'campaign'              // 对应 [0x48CD18] != 1
      || this.battlePending;                      // 对应遭遇战/进战斗
}

// ---- 新增逐帧驱动（原作 0x4304AB：主循环每帧调 scene->handler(1,3)）----
update(dt: number) {
  if (this.clockPaused()) return;                 // 原作：非大地图/模态 ⇒ T 不减
  this.tickAcc += dt * 1000 * this.speed;
  while (this.tickAcc >= MS_PER_TICK_60FPS) {
    this.tickAcc -= MS_PER_TICK_60FPS;
    this.stepClock();
  }
}

private stepClock() {
  // 1) T -= 1（0x41B6C1）
  this.mapTick = Math.max(0, this.mapTick - 1);
  const elapsed = TICKS_PER_YEAR - this.mapTick;

  // 2) 月/日派生（0x41B84E–0x41B8A3）
  const month = Math.min(12, Math.max(1, Math.floor(elapsed / TICKS_PER_MONTH) + 1));
  const day   = Math.min(30, Math.max(1, Math.floor((elapsed % TICKS_PER_MONTH) / TICKS_PER_DAY) + 1));
  this.hudMonth = month; this.hudDay = day;

  // 3) 月边界 → 只跑 1 个月的既有结算（原来 endInterior 里循环体的那三步）
  if (month !== this.lastMonth) {
    this.lastMonth = month;
    GameState.advanceMonth(this.cities, { data: this.data });   // 月税/补兵
    const moved = this.advanceArmiesMonth();                    // 行军/抵达
    if (moved.battle) { this.save = GameState.loadSave(); return; }
    this.runMapAi();
    this.save = GameState.loadSave();
    this.refresh();
  }

  // 4) T == 0 → 自动开内政（0x41B6FF → 0x41BA6D）；年度进位/结算放这里
  if (this.mapTick === 0) this.enterInterior();
}

/** 对应 0x41B699 T==0 分支 + 0x41BA5F~0x41BA6D SetScene(0x48CD50) */
private enterInterior() {
  this.year += 1;                     // 0x4238C3（唯一自增点）
  this.runAnnualSettlement();         // 0x423885 年度结算（现有年度逻辑挪到这里）
  this.tickAcc = 0;
  this.openInteriorScene();           // 或 this.cityPanel? 打开内政面板 + 暂停时钟
}

/** 「內政終了」按钮：确认框 → 回调（0x427FE0 → 0x41F706 → 0x41F62D → 0x41BBF5） */
private onInteriorEndConfirmed() {
  this.clearYearlyActionFlags();      // 0x41BC01/0x41BC0A：链表节点 +0x2C = 0
  this.mapTick = TICKS_PER_YEAR;      // 0x41BC1F：T = 3600
  this.lastMonth = 1; this.tickAcc = 0;
  this.closeInteriorScene();          // 0x41BC2E：SetScene(大地图)
}
```
要点：
- 删除/停用 `endInterior()` 里的 `for (i<steps)` 循环（2545–2599），改为上面的逐帧 `stepClock()`；`doAction('advance')` 改为只发"确认"事件（`onInteriorEndConfirmed`）。
- 内政窗口的门槛从"正月"改成"T==0 自动进"，玩家不再按月/年按钮推进。
- `advanceArmiesMonth()` 语义也需改成逐 tick 推进（或至少改成"每帧推进一段"），否则行军仍是跳月。原作速率：每推一格需要 `4980/总步数` tick，并按 `(999−速度)/2997` 加权（0x41AFAB/0x41AF58）。
- 暂停条件对照原作：`0x41BEC1`（模态）、`[0x4A6440]!=0`（子状态）、`0x44B084`、`[0x4D25DC]`。

### 5.3 web（campaign.html）
```js
// ---- 新增全局时钟（原作主循环 0x430430 的对应物）----
const TICKS_PER_YEAR = 3600, TICKS_PER_MONTH = 300, TICKS_PER_DAY = 10;
const MS_PER_TICK = 1000 / 60;          // 60fps 基准
let mapTick = TICKS_PER_YEAR, tickAcc = 0, lastMonth = 1, clockRunning = false;

function clockPaused() {
  return !gameStarted || !clockRunning
      || document.querySelector('.modal.show')   // 对应 0x41BEC1
      || battleActive                            // 战斗场景
      || interiorOpen;                           // 内政场景
}

let lastTs = performance.now();
function clockFrame(ts) {          // requestAnimationFrame 驱动
  const dt = ts - lastTs; lastTs = ts;
  if (!clockPaused()) {
    tickAcc += dt * (Number(qs.get('speed')) || 1) * GAME_SLOWDOWN;
    while (tickAcc >= MS_PER_TICK) { tickAcc -= MS_PER_TICK; stepClock(); }
  }
  requestAnimationFrame(clockFrame);
}
requestAnimationFrame(clockFrame);

function stepClock() {
  mapTick = Math.max(0, mapTick - 1);
  const elapsed = TICKS_PER_YEAR - mapTick;
  const month = Math.min(12, Math.max(1, Math.floor(elapsed / TICKS_PER_MONTH) + 1));
  const day   = Math.min(30, Math.max(1, Math.floor((elapsed % TICKS_PER_MONTH) / TICKS_PER_DAY) + 1));
  save.month = month; save.day = day; renderDate();     // 日期是派生的，不从存档自增
  if (month !== lastMonth) {                            // 月边界：跑 1 个月的既有流水线
    lastMonth = month;
    advanceMonth(1);                                    // 复用现有 advanceMonth
  }
  if (mapTick === 0) enterInterior();                   // 自动开内政（0x41B6FF）
}

function enterInterior() {
  clockRunning = false;              // 内政期间时间冻结
  save.year += 1;                    // 0x4238C3
  runAnnualSettlement();             // 0x423885
  showInterior();                    // 切内政界面
}

/** 「內政終了」按钮 —— 只确认、不跑模拟 */
function endMonth() {
  if (!interiorOpen) return;
  if (!confirm('結束本年內政？')) return;   // 对应 0x41F62D 确认框
  clearYearlyActionFlags();                 // 0x41BC0A
  mapTick = TICKS_PER_YEAR; tickAcc = 0; lastMonth = 1;   // 0x41BC1F
  hideInterior(); clockRunning = true;      // 0x41BC2E SetScene(大地图)
}
```
要点：
- `advanceMonth(12)`（2520–2536 的 `endMonth`）不再被"内政終了"调用；保留 `?adv=N` / `?auto=1` 作为**调试快进**（仍然一次跑 N 月，但不掩盖默认流程）。
- `save.month` 从"权威状态"降级为"派生显示值"（原作就是这么做的，E10）；存档里另存 `mapTick`。
- 暂停条件与 Cocos 共用同一组：模态/内政/战斗。

---

## §6 不确定项（没坐实，别当结论用）

1. **视觉节奏没有硬证据**：原作**不限帧**（E2：帧限模式 0x4A2C5C 无写点），实际流速 = 渲染帧率。
   所以"一年 = 3600 帧"是确定的，但"一年 = 多少秒"取决于当年的机器（60fps → 60 s；30fps → 120 s）。
   §5 里建议统一取 60fps 作基准，并暴露一个 `speed` 倍率。
   未查：`0x46CE20`（主循环里的 flip）是否等 vsync。
2. **行军实体身份**：`[0x4A62B4]` 链表上的节点到底是什么（军团 / 部队 / 城池记录），只能从
   `+0x82/+0x86/+0x8A/+0x92/+0x9A/+0x9E` 的用法与"距离 < 1,000,000、总步数 = 110 + 距离/2500"
   推断是**出征部队**；没有找到创建该节点的构造函数与绘制函数来做交叉确认。
3. **到达/进城/对峙/遭遇的判定**未定位：`0x41AF58` 在 `进度 >= 总步数` 时只是停止推进；
   真正的"到达结算"没找到（`0x41AFAB` 里只看到 `p->[+0x30] < p->[+0x44]` 时逐个 `0x406F3F(p2)` 放出子单位，
   像是"沿途放出部队/遭遇"，但触发条件与结算函数未坐实）。
4. **场景 id 2/4/5/6/7/0 的身份**：4 号（0x447F39）疑似战斗场景（0x446A90 起战 → 0x446B46 `SetScene(0x48CD68)`），
   5/6/7/0 只有 handler 与少量字符串，未逐个坐实（可能对应 势力地图 / 武将资料 / 标题 / 结局）。
5. **UI 消息号语义**：场景用 1=enter/2=leave/3=update/4=draw/5=present（已由跳表与主循环证实）；
   但**控件**用 1/2/4/8/16/512/1024 混合（0x41F5A9 vs 0x4358B4 两套），"msg4 = 点击/激活"是从
   0x427FE0 的 msg4 行为（音效 + 注册回调 + 弹框）反推的，没有 dispatch 端证据。
6. **0x41DEF3 / 0x468A10 的颜色参数**：0x8082 / 0xF904 / 0x8410 / 0xFFFF 具体是 RGB565 + 标志位怎么组合，
   未解码（只确定它们不是窗口消息号）。
7. **0x4A64F8（速度）的命令行键名**：只追到 `0x40B70A` 里 `strcmp(0x487120, …)` 的键表，未解出具体开关名。
8. **年度结算细节**（0x423885 → 0x423681/0x423765/0x42379E/0x4237A6/0x423824）未展开，
   与本任务（时间流动）关系较远，未逐条核对。

---

## 附：关键地址速查

| 名字 | 地址 | 说明 |
|---|---|---|
| 主循环 | 0x430422–0x430612 | 无限循环；每帧 msg3/4/5 |
| GetTickCount 换算 | 0x450410 | ms×1024/1000 |
| 帧累加器 | 0x468570 / 0x468550 / 0x4685A0 | 1/1024 s |
| 逻辑帧闸门 | 0x4685C0 | 17/1024s（mode 1/3 才生效） |
| 帧限模式全局 | [0x4A2C5C] | **无写点 ⇒ 0** |
| 每帧步数 | [0x4BD38C] ← [0x4A64F8] | 默认 0 → 1 步 |
| SetScene | 0x43014B | (old,2) → 换 → (new,1) |
| 场景描述符表 | 0x48CD48–0x48CD80 | {id, handler} 8B/条 |
| 大地图 handler | 0x41B94A | 跳表 0x41BBE5 |
| 大地图 update | 0x41B973 | 含时间推进唯一调用 |
| 时间核心 | 0x41B699 | `T -= 1` @0x41B6C1 |
| T | [0x4C30E0] | 3600/年 → 0 |
| 年份 | [0x4BD390] | 仅 0x4238C3 自增 |
| 内政 handler | 0x423973 | 跳表 0x423B9A |
| 年++ | 0x4238AF | 内政 enter 调用 |
| HUD 日期 | 0x41B7F2 | 3600/300/10 |
| 內政終了按钮 | 0x427FE0 | 表 0x48A4F0+0x70 |
| 确认回调槽 | 0x41F706 → [0x4A6498] | 触发 0x41F68E |
| 回调实现 | 0x427FD6 → 0x41BBF5 | T=3600 + SetScene |
| 实体推进 | 0x41B127 → 0x41AFAB → 0x41AF58 | 每帧，非每月 |
| 状态块 | [0x4BD268] | +0x30=T, +0x58=year |
