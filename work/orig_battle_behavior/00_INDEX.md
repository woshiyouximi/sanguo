# orig_battle_behavior · 原作战斗行为证据包（173 号任务的原始材料）

配套文档：`F:\sanguo\project\173_原作战斗行为真相.md`
EXE：`C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe`
反汇编器：`F:\sanguo\work\army_step\rq.py`（`f` 线性到 ret / `s a b` 区间 / `c` callers / `m` 内存操作 / `i` 立即数）

| 文件 | 覆盖地址 | 证明什么 |
|---|---|---|
| `01_squad_frame_43D0F1.txt` | 0x43D0F1–0x43D3C0 | 小队行动帧 `0x43D125`：闸门 → 探敌 → 攻击/走位；攻击帧不发移动 |
| `02_general_frame_43EB50.txt` | 0x43EAA0–0x43EC60 | 主将行动帧 `0x43E964`：与小队逐行同构，攻击锁定恒 1 |
| `03_adjacent_enemy_43BCA7.txt` | 0x43BCA7–0x43BD64 | 探敌入口：先扣 `+0x38`，撤退态只探面朝方向 |
| `04_probe_adj_43BBE6.txt` | 0x43BBE6–0x43BCA7 | **同排 ±x 1..射程** 扫描，友军置 x=−99 挡视线 |
| `05_anim_len_406717.txt` | 0x406717–0x406830 | 攻击锁定帧读取器（表 `0x4862BC+0x1C`） |
| `06_isenemy_43B663.txt` | 0x43B663–0x43B6E0 | 同阵营判定 + `0x4000`/`0x1`/`0x4` 位测试 |
| `07_anim_table_4862D8.txt` / `07b_unit_table_4862BC.txt` | 表 0x4862BC | 13 条单位类型记录：射程 / 锁定帧 |
| `08_msg_10007_handler.txt` | 0x43E4C0–0x43E660 | 攻击消息 `0x10007` → 朝向 + 播 anim 4 |
| `09_writes_cmdarray.txt` | 全 EXE 扫描 | `[reg+0x94]` 只有 9 条写指令，5 条在 0x43ADxx |
| `10_cmd_pointer_table.txt` | 0x43CF8D / 0x43D0C9 | 主将 / 小队 命令 → handler 跳转表 |
| `11_army_init_43A114.txt` | 0x43A114 起 | army 初始化只清 `+0x84/+0x88/+0x8c/+0x90`；士气 `0x43A14D` |
| `12_cmd_writer_43AE00.txt` | 0x43AE00–0x43AF3B | `0x43ADED`/`0x43AEB2`/`0x43AF1A`/`0x43AF3B` 实体 |
| `13_ai_dispatcher_445000.txt` | 0x445000–0x4451C0 | 命令→美术帧选择桥（**不是** AI） |
| `14_spawn_init_43A1C4.txt` | 0x43A250–0x43A2C0 | **单位槽初始化：`+0x34=0`、`+0x38=0`、`+0x3c=0`** |
| `15_gate_43B574.txt` | 0x43B574–0x43B662 | 行动闸门：40 / 撤退 46 + 速度差 |
| `16_pixel_43BE42.txt` | 0x43BE42–0x43BF26 | 补间：格心 + ±24/±18 抖动 → clamp → delta/40 |
| `17_align_43C084.txt` | 0x43C084–0x43C100 | 没走成 → 40 帧滑回格心 |
| `18_grid_43AF54.txt` | 0x43AF54 | 网格 71×14 |
| `19_spawn_caller_44873F.txt` | 0x4486C0–0x448760 | 唯一调用 `0x43A1C4` 的战斗单位工厂 |
| `20_sampler_sim.txt` + `sim_q7.py` / `sim_q7b.py` | — | 抽样器蒙特卡洛（20 万次/格况），第 7 问的分布表 |
| `21_r178_gate_speed.txt` | 0x43B574 / 0x43BF26 / 0x43D282 / 0x43EB87 / 0x402FA7 | **R178 复核**：闸门 40 两处共用、无 2 格步进、dir==0 → 走位、AI 权重 w0=100 |

## 结论速查（详见 173 文档）
- 开局双方 8 个命令槽全 0（`0x43AEB2`@`0x4430FE/0x44369C`），首帧就"行动"但待機 ⇒ **开局站桩**。
- 主将/小队共用闸门+探敌+攻击，差别只有命令表与锁定帧（1 vs 表查 1..3）。**无压后阵代码**。
- AI `0x402EA5` 每 60 帧一次（`0x4443FA`/`0x444437`），7 权重默认 `w0=100`，突擊 +12/+150/+1000。
- 攻击动画 anim 4，10 帧，出手当帧起播。`+0x34`(闸门)/`+0x38`(攻击锁定)/`+0x2c`(状态字) 三个字段互不相干。
- `0x43BD64` = 撤退态且背对敌人 → 跳过攻击；**155 文档 §3 第 3 条作废**。
