import pathlib
# 1) 03：双视角可行性已验证
p3 = pathlib.Path(r'F:\sanguo\project\03_美术风格与资源规范.md')
t = p3.read_text(encoding='utf-8')
anchor = '## 4.'
add = '''### 3.13.8 双视角可行性已验证（本机 Qwen，2026-11-24）

同一 seed（901）+ 同一段主体描述，只把视角后缀换成"背视图：从正后方看，看不见脸……"/"正视图：从正前方看，能看见脸……"，Qwen-Image 2.1 一次就给出了**结构自洽的一对**（斗笠朝向、枪的持握侧、甲片分层、腰带结的位置全部对得上）。

![](../project/art_ref/_two_views.jpg)

- 产物：`project/art_ref/soldier_back.png`、`soldier_front.png`、拼版 `_two_views.jpg`；脚本 `work/comfy_two_views.py`。
- 成本：512×768 / 24 步 / 每张 **27–30 s**（RTX 3090）。
- 结论：§3.13.6 的 620 帧不是纸面推算，双视角可以按"同 seed 成对出图"的方式批量生产；剩下的仍是 §3.13.1 说的**精修**（78% 重绘率是人的活，不是模型的活）。

'''
if anchor not in t: print('MISS anchor 03')
else: t = t.replace(anchor, add + anchor, 1)
p3.write_text(t, encoding='utf-8')

# 2) 06：生产线 A 补双视角实证
p6 = pathlib.Path(r'F:\sanguo\project\06_美术量产与云算力方案.md')
t6 = p6.read_text(encoding='utf-8')
key = '## 4.'
note = '''> **双视角已实测可行**（2026-11-24）：同 seed + 视角后缀，Qwen-Image 2.1 一次给出结构自洽的背/正一对（见 `art_ref/_two_views.jpg`，512×768 / 24 步 / 27–30 s 每张）。所以 620 帧的身体动画可按"成对出图"排产；瓶颈依旧是精修（`03 §3.13.1`）。

'''
if key not in t6: print('MISS anchor 06')
else: t6 = t6.replace(key, note + key, 1)
p6.write_text(t6, encoding='utf-8')
print('ok')
