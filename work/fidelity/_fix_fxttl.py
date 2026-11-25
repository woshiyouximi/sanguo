import io
p = r"F:\sanguo\work\fidelity\gen_expect.mjs"
s = io.open(p, encoding="utf-8").read()
old_what = "特效驻留 = clamp(round(帧数×2.2),24,132)，无帧时 30"
new_what = "特效驻留 = clamp(round(帧数×TICK_HZ/13.64),2*TICK_HZ,2*132)，无帧时 TICK_HZ；R192 起 TICK_HZ=60 ⇒ 等效 clamp(round(帧数×4.4),120,264)，无帧时 60"
assert old_what in s, "pattern not found"
s = s.replace(old_what, new_what)
old_ev = "fxTtl: '见 project/192（R192 修复：原始证据串在编码事故中损坏，数值期望未变）',"
new_ev = "fxTtl: '[钉] 本作 FX_TICK_PER_FRAME=TICK_HZ/13.64、clamp(2*TICK_HZ, 264)、无帧时回 TICK_HZ（battle.ts FX_TTL_* 常量，R192 起 TICK_HZ=60）；原作只有「帧停留 tick 数」（docs/05b:3），无逐技总时长证据',"
assert old_ev in s, "evidence pattern not found"
s = s.replace(old_ev, new_ev)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("patched gen_expect fxTtl texts")
