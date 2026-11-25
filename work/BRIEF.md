# 三国群英传2 逆向工程 — 共享简报（BRIEF）

> 所有子任务开工前先读完本文件。目标：为"参考《三国群英传2》设计新游戏"产出完整拆解文档。

## 0. 环境硬约束

- 本机**没有**系统 python。唯一可用的解释器：
  `C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`
- 已安装：capstone 5.0.9、pefile 2024.8.26、Pillow 12.3.0、xlrd 2.0.2、pandas 3.0.1、numpy。
- PowerShell 默认代码页不是 UTF-8。任何会输出中文的命令前先加两行：
  ```powershell
  $env:PYTHONIOENCODING='utf-8'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8
  ```
- 路径含中文与空格：PowerShell 里一律用 `-LiteralPath` 或双引号。
- 文件策略 danger-full-access，**审批被禁用**：不要请求提权。
- 文本文件编码：**PAK 里的 INI 全是 cp950（Big5 繁体）**，不是 GBK！实测 `MAGIC.INI/MESSAGE.INI/SANGO.INI/THINGS.INI/TIMES1-5.INI` 用 `gbk` 解码都在第一个中文字节处 `UnicodeDecodeError`，用 `cp950` 全部 OK（例：`A9 52 C0 F8 B3 4E` → `命療術`）。
  ```python
  txt = raw.decode('cp950')                      # 先按 Big5 解
  simple = txt.encode('gb18030', 'ignore').decode('gb18030')  # 如需要简体，再走一次转换表
  ```
  外层目录的中文 `.txt` 说明是 **GBK**（那是国内玩家写的），两者不要混。写出的 md/json 统一 UTF-8。

## 1. 目录

- 原游戏目录（只读参考）：
  `C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\`
  - `Sango2.exe`（682,496 B）、`Sango2.PAK`（117,739,089 B）、`MP3\01-17.mp3`、`可选补丁\`
  - `群英2修正版1.05+说明.txt`、`重新打包说明.txt`、`群英2宝典修订版.xls`、`兵种 阵法克制表.png`
- 工作区 `F:\sanguo\`
  - `tools\` 工具脚本（见下）
  - `extract\pak\` PAK 解包结果（11110 个文件，完整目录树）
  - `extract\json\` 由 XLS/INI 导出的 JSON
  - `export\` 导出的美术资源（PNG 等）
  - `docs\` **最终交付文档**
  - `work\` 中间产物、反汇编 dump、funcmap.tsv、strings_xref.tsv

## 2. PAK 格式（已验证，11110 个文件）

- 头 24 B：`"PAKS"` + u16 版本标记 `0x662B`('f+') + u32 索引偏移 + u32 过期计数(不可信, 16447) + 8 B 0。
- 数据区从 0x18 起，**无压缩无加密**；文件数据首尾相接。
- 索引项 64 B：u32 size + u32 offset + 24 B 保留 + **char name[40]**（NUL 结尾；不是 16 B！）。
- 工具：`tools\pak_extract2.py`（正确版）。已解包，无需再跑。

## 3. SHP 精灵格式（10969 个，全部校验通过）

`"TLHS"` 头 0x24 + 偏移表 + 行数据。字段：
| 偏移 | 类型 | 含义 |
|---|---|---|
| +0x00 | char[4] | "TLHS" |
| +0x04 | u32 | 0 |
| +0x08 | u32 | 恒 2 → RGB565 |
| +0x0C | u32 | 0 |
| +0x10 | u32 | 透明色键（0x07C0 为主，其次 0、0xFFFF、0x07E0） |
| +0x14 | u32 | 宽 width |
| +0x18 | u32 | 行数 = 高 height = 偏移表项数 |
| +0x1C | i32 | offsetX（绘制原点） |
| +0x20 | i32 | offsetY |
| +0x24 | u32[+0x18] | 每行数据偏移 |

- 行数据：`u16 x` + `u16 n` + `u16 colors[n]`，行以 0xFFFF 字结束（**加载时会被改写成 0**，x 字段是"该行第一个不透明像素的 x"）。
- 一个 SHP = **一张静止图**。动画由多个 SHP + `THINGS.INI` 的序列驱动。
- 校验规则：`offs[0] == 0x24 + 4*height`（10969/10969 成立）。
- 工具 `tools\sango_shp.py`：
  ```python
  import sango_shp
  s = sango_shp.load(path)          # -> Shp(width,height,key,offx,offy,rows)
  img = sango_shp.to_image(s)       # PIL RGBA（mode='565' 默认）
  sango_shp.save_png(src, dst)
  ```
- 大图（MAP/CHINAMAP*.SHP、POLICY/*.SHP）是 640×480 级整屏图。

## 4. 其它资源格式

- **TEX**（7 个）：头 0x14 = u32 0x00020000 / u32 0 / u32 0 / u16 640 / u16 480 / u32 0x10，之后 640×480 像素——**像素是 R4G5B5（bit10-13=R, bit5-9=G, bit0-4=B）且行序自下而上**（实测与同图 .SHP 比，R4G5B5+垂直翻转误差 26.12，565 无翻转 74.68）。例外：`SHAPE\MAP\TEXTURE.TEX` 头为 0x2C（多 24 B）。
- **TGA**（12 个）：`SHAPE\BG\FLOOR00-11.TGA`，标准 TGA，Pillow 直接开。
- **MSK**（4 个）：`SHAPE\MAP\CHINAMAP1-4.MSK`，**头 0x80 字节**：`+0x00` 4 字节签名 `0A 05 01 08`、`+0x04` 4 零、`+0x08` u16 639 / `+0x0A` u16 479 / `+0x0C` u16 640 / `+0x0E` u16 480、`+0x10` 起 16×3 字节 RGB 调色板（实际只用前 12 色）；`0x80` 起是 **PCX 式 RLE**：`b & 0xC0` 非零 → 低 6 位=重复次数、下一字节=色值；否则 b 就是像素值。解出**恰好 307,200 像素**（640×480），取值只有 `0..11` 与 `255`（255=未使用/边界）。解码器 VA `0x44FD1B`，调用点 `0x40DF43` 后接 `"%s Terrain=%d"` → 语义=**地形编号图**。
- **字体点阵**：`SANGO.20`(832020B)、`SANGO.15`(416010B)、`MINGASC.20`(10240B)、`OLDASC.15`(3840B)、`SANGO.IDX`(38000B)；`SANGO.INI` 的 `[FONTS01..]` 98 段给出字宽/高/字节数，可据此切字模。
- **WAV**：99 个（`SOUND\`），标准 PCM。
- **SO 脚本**：`SCRIPT\MAGIC.SO`(259KB，全部武将技脚本)、`SYSTEM.SO`；头 `"Smart Script"`+0x10 版本 0x100 +0x14 代码起点 0x40，之后是 DWORD 记号流。解释器待逆。

## 5. INI 数据表（**cp950 / Big5**）

| 文件 | 内容 |
|---|---|
| `THINGS.INI` | 620 个 `[OBJECT]`：兵种/武将造型/动画序列/特效；键：Type/Flags/Life/Process/SPACE/Directory/Sequence/Sprite |
| `MAGIC.INI` | 177 个 `[MAGIC]` + `[WISE]`：武将技/军师技（SEQUENCE/NAME/TITLE/POWER/Attack/Script/Attrib/Active；WISE 另加 Rate/Execute/WiseLevel） |
| `TIMES1-5.INI` | 5 个剧本的君主/武将/城池初始数据（段 `KING01..`、`CITY01..`） |
| `SANGO.INI` | `[SYSTEM]` + 98 个字体段 |
| `COMBINE.INI` | 8 行 `SHAPE=x,y,路径`：**复合造型**（如躯干+头+武器 4 格 2×2 拼合） |
| `MESSAGE.INI` | 529 行游戏提示文本 |

武将字段：CITY/STATUS/SKILL/WISESKILL/BattleArray/FORCE/USEFORCE/FACE/THING/WEAPON/HORSE/GENERAL/NAME/FLAGS/BASEHP/BASEMP/BASEEXP/CONSTANCY/TYPE/LOYAL/BLOOD
城池：NAME/MONEY/DEFENSE/POPULATION/FLAGS/Rate
物品：ITEM/ONLYONE/USED/JEWEL_WEAPON/JEWEL_THING/JEWEL_HORSE/JEWEL_MISC/Sequence/Name/Sprite/Level/Rate/MaxHP/MaxMP/Force/Battle/Skill/Speed/Spirit/Loyal/Tire/WeaponType/WeaponObject/SearchType/Sort/Attrib/Type/DESCRIPTION
地形：TERRAIN/Sequence/SoundTrack/Name/Floor/Foreground/Midground/Background

## 6. 《群英2宝典修订版.xls》（社区数值表，12 sheet）

已导出到 `F:\sanguo\extract\json\xls_<sheet>.json`（`{sheet, header, rows}`），形状 `[行][列]`，数值是 float，中文已修好。
- `群英2`：400 武将 × 61 列（武力/智力/合/必杀技×7带等级/军师技×8带等级/5 剧本出场城市与状态/武器/阵形/兵种/情义君主/血统/节操/图形类型/旗帜）
- `武将技`：110 行（序号/名称/消耗技力/能量（气）/攻击力/调用代码/属性/官衔/注释,级别/目标）
- `军师技`：67 行（序号/执行代码/军师技等级/名称/属性/等级/目标）
- `物品` 77×25、`城池` 60×6、`路径` 118×5、`兵种` 13×14 相克、`阵法` 9×10 相克、`增技`19×2、`恢技`24×2、`增体`19×2、`恢体`27×2
- 辅助：`tools\jshow.py <json> <n>`

## 7. EXE 逆向工具链

`Sango2.exe`：PE32 / MSVC6 / ImageBase 0x400000 / Entry 0x6ED80 / 1999-04-08 / 无 MSVCRT 导入（静态 CRT）。
段：`.text` VA 0x1000 raw 0x400（VA↔文件偏移 = VA-0x1000+0x400）。

- `tools\sango_dis.py <VA\|RVA> <指令数>` — capstone 反汇编，自动注释字符串与 IAT 名。
  （注意：必须从**函数首字节**开始，否则 capstone 直接无输出）
- `tools\exe_funcmap.py` → `work\funcmap.tsv`（1803 个函数，含字符串/IAT 引用）
- `tools\fm_at.py <地址>` — 查该地址落在哪个函数；`tools\fm_grep.py <子串>` — 按字符串搜函数
- `tools\exe_strxref.py` → `work\strings_xref.tsv`（1451 条字符串 + 引用地址）、`work\string_paths.txt`

已定位的关键函数：
| VA | 大小 | 作用 |
|---|---|---|
| 0x40B00A | 547 | WinMain（RegisterClass/CreateWindowEx "SANGO II"） |
| 0x40B46E | 1786 | 命令行解析（-VER/-AUTO/-BATTLE/-SPEED/-AIOFF/-INFO…） |
| 0x40BBA8 | 276 | 注册表读写 |
| 0x42FFC5 | 286 | PAK/SHAPE 资源初始化 |
| 0x42F3C8 | 1369 | MAGIC.INI 解析（MagicDef/WiseDef） |
| 0x43031D | 772 | TIMES*.INI 剧本装载 |
| 0x43207C | 851 | SAVES 存档读写 |
| 0x441E61 | 2164 | Things.ini 装载 |
| 0x42C21E | 344 | CITY 段解析 |
| 0x42AB50 | 5369 | FORCE\MA* 造型装载 |
| 0x441212 | 1934 | MENU\WAR0x 战斗界面 |
| 0x467B50 | 4176 | SCREEN%02d.TGA |
| 0x47C1C6 | — | 引擎主循环 + 消息泵（__thiscall，this+0x188 运行标志） |
| 0x46B3D0 | — | SHP 加载修正 |
| 0x47C67E | — | timeSetEvent 包装 |

`MagicDef` 布局：+0x00 name*、+0x04 title*、+0x08 u16 sequence、+0x0A u16 POWER、+0x0C u16 Attack、+0x0E u16 Attrib、+0x10 u16 Active、+0x12 u32 Script。

## 8. 交付物约定

- 文档放 `F:\sanguo\docs\`，**简体中文 Markdown**，文件名 `NN_主题.md`。
- 每篇开头写"一句话结论 + 证据来源（文件/VA/样本）"，正文尽量给**可直接用于新游戏设计的数值与规则**，不要只描述"这里有个函数"。
- 表格优先于长段落。所有结论必须能指回具体证据（文件路径 / 十六进制偏移 / VA），无法确认的写明"未验证/推测"。
- 原始数据另存 `F:\sanguo\extract\json\`，文档里引用相对路径。

## 9. 已知待解问题（谁有空谁上）

1. MSK 的 RLE 编码（叠加 CHINAMAP*.SHP 验证）。
2. `TEXTURE.TEX` 头 0x14..0x2C 的 24 字节。
3. `Smart Script`(.SO) 字节码指令集与解释器。
4. 战斗伤害公式、兵种/阵法相克如何参与计算、气（能量）与技力消耗。
5. AI 决策（大地图 + 战场）的主要分支。
6. 存档 SAVES 的二进制结构。
