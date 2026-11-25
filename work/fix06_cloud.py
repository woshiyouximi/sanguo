import pathlib
p = pathlib.Path(r'F:\sanguo\project\06_美术量产与云算力方案.md')
t = p.read_text(encoding='utf-8')
old = "| 本机要跑多久？ | **约 22 GPU·小时**（Qwen 11 h + Wan 11 h），按 8 h/天算 = **3 个工作日** |"
new = "| 本机要跑多久？ | **约 22 GPU·小时**（Qwen 11 h + Wan 11 h），按 8 h/天算 = **3 个工作日** |\n| 云上实测多快？ | RTX 5090 上 **16 s/张（832×1216/20 步）**，比本机 3090 快 **3.0×**；V0 的 23 条 t2i **5.4 分钟**跑完。见 `07 §9.5` |"
assert old in t
t = t.replace(old, new)
p.write_text(t, encoding='utf-8')
print('06 updated')
