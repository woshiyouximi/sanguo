import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')

t = t.replace("""import { applyWise } from '../dist/core/wises.js';""",
"""import { applyWise } from '../dist/core/wises.js';
import { initMagicProgram } from '../dist/core/smartscript/runtime.js';""", 1)

# 开战前预加载 MAGIC.SO（浏览器/小游戏没有同步文件系统）
t = t.replace("""function startBattle() {
  const built = makeWorld();""",
"""async function startBattle() {
  // 首战前把 MAGIC.SO 拉进来：技能不再是"猜的三类"，而是真跑原作字节码
  try { await initMagicProgram('../data/'); } catch (e) { console.warn('[battle] MAGIC.SO 预加载失败，技能将退化为占位特效', e); }
  const built = makeWorld();""", 1)
p.write_text(t, encoding='utf-8')
print('main preload wired')
