import pathlib
p0 = pathlib.Path(r'F:\sanguo\project\00_立项书.md')
t = p0.read_text(encoding='utf-8')
a = "| `06_美术量产与云算力方案.md` | 资产盘点、产量清单、GPU 预算、开云条件 | 制作人/美术 |"
b = ("| `06_美术量产与云算力方案.md` | 资产盘点、产量清单、GPU 预算、批次计划 | 制作人/美术 |\n"
     "| `07_云GPU提速与快速验证方案.md` | **云环境怎么搭、V0 验证包、断点续跑、10 天冲刺** | 制作人/美术/主程 |")
if a not in t: print('MISS 00 row')
t = t.replace(a,b)
a2 = "完整产量与算力方案见 **`06_美术量产与云算力方案.md`**（765 张静态 + 172 条动作视频 + 约 4,900 帧序列帧；本机 22 GPU·h；云端 ¥200~800）。"
b2 = ("完整产量与算力方案见 **`06_美术量产与云算力方案.md`**（765 张静态 + 172 条动作视频 + 约 4,900 帧序列帧；22 GPU·h）。"
      "**云已改为立即开启**（用户 m01938），环境、V0 验证包与 10 天冲刺见 **`07_云GPU提速与快速验证方案.md`**。")
if a2 not in t: print('MISS 00 §11 line')
t = t.replace(a2,b2)
p0.write_text(t, encoding='utf-8')

pr = pathlib.Path(r'F:\sanguo\project\README.md')
r = pr.read_text(encoding='utf-8')
a3 = "| 制作人 | [`05_里程碑与任务拆解.md`](05_里程碑与任务拆解.md) ｜ [`06_美术量产与云算力方案.md`](06_美术量产与云算力方案.md) |"
b3 = ("| 制作人 | [`05_里程碑与任务拆解.md`](05_里程碑与任务拆解.md) ｜ [`06_美术量产与云算力方案.md`](06_美术量产与云算力方案.md) |\n"
      "| 想立刻看到东西 | [`07_云GPU提速与快速验证方案.md`](07_云GPU提速与快速验证方案.md) ｜ [`../cloud/README.md`](../cloud/README.md) |")
if a3 not in r: print('MISS README row')
r = r.replace(a3,b3)
pr.write_text(r, encoding='utf-8')
print('ok')
