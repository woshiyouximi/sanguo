"""R163 收尾：删掉本轮 A/B 实验残留的 TEMP-AB / SS_DBG 调试钩子。"""
import io

RT = r'F:\sanguo\game\src\core\smartscript\runtime.ts'
SC = r'F:\sanguo\game\src\core\smartscript\syscalls.ts'

s = io.open(RT, encoding='utf-8').read()
s = s.replace(
    "    vm.setEngineValue(5, process.env['SS_OLD_G5'] === '1' ? this.direction : this.side === 'A' ? 0 : 1);",
    "    vm.setEngineValue(5, this.side === 'A' ? 0 : 1);",
)
s = s.replace(
    "    if (process.env['SS_DBG'] === '1' && (hits.length || cbHits.length)) {\n"
    "      console.error(`DBG frame=${this.framesRun} geo=${hits.length} cb=${cbHits.length} killed=${this.killed - killed0}`);\n"
    "    }\n",
    "",
)
s = s.replace(
    "    if (process.env['SS_DBG'] === '1') {\n"
    "      console.error(`DBG rect camp=${camp} side=${side} [${loX}..${hiX}]x[${loY}..${hiY}] -> ${found.length}`);\n"
    "    }\n",
    "",
)
s = s.replace("    if (process.env['SS_NO_CB'] === '1') return hits; // TEMP-AB\n", "")
s = s.replace(
    "        if (process.env['SS_DBG'] === '1') {\n"
    "          console.error(`DBG cb obj=${o.handle} res=${o.resource} cb=${o.param98} victim=${victim} standing=${standing} perHit=${perHit} gx=${gx} gy=${gy}`);\n"
    "        }\n",
    "",
)
io.open(RT, 'w', encoding='utf-8', newline='\n').write(s)

s2 = io.open(SC, encoding='utf-8').read()
s2 = s2.replace("      else if (process.env['SS_OLD_125'] === '1') ctx.applyHpDelta(a(0), a(2)); // TEMP-AB\n", "")
s2 = s2.replace("      if (process.env['SS_OLD_12A'] === '1') return r(1); // TEMP-AB\n", "")
io.open(SC, 'w', encoding='utf-8', newline='\n').write(s2)
print('stripped')
