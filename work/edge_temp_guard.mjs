/**
 * 无头 Edge 临时 profile（--user-data-dir=%TEMP%\edge-*）泄漏防护工具。
 *
 * 2026-11-25 事故：F:\sanguo 的截图/调试脚本用 mkdtemp 建临时 profile 后没清掉，
 * 10 小时攒了 218 个目录、57GB，把 C 盘吃到只剩 2GB。
 *
 * 两个坑：
 *  1) spawn 出来的 msedge.exe 往往只是"转发器"（把参数交给真正的浏览器进程后自己退出），
 *     所以拿 proc.pid 去 taskkill 常常杀不到真正的浏览器 → 改成按 profile 目录名匹配命令行里的
 *     --user-data-dir，把真正的浏览器的整组进程（含 renderer/gpu/crashpad）全部杀掉。
 *  2) 浏览器还活着时 rm 会反复重试卡很久 → 杀干净后再删，且删除有超时，删不掉就留给下次启动清扫。
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 本项目所有临时 profile 都是 edge-<用途>-<6位随机>，例如 edge-shot-a1B2c3
const TAG_RE = /^edge-[a-z]+-[A-Za-z0-9]{6}$/;

// 只用 profile 目录名（随机 6 位）做匹配，避免路径里的反斜杠/引号进 PowerShell 造成转义问题
function killByTags(tags) {
  if (!tags.length) return;
  const list = tags.map((t) => "'" + t + "'").join(',');
  const psCmd =
    '$ts=@(' + list + '); ' +
    'Get-CimInstance Win32_Process -Filter "Name=' + "'msedge.exe'" + '" | ' +
    'Where-Object { $c=$_.CommandLine; ($ts | Where-Object { $c -like ("*"+$_+"*") }) } | ' +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
  try {
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      stdio: 'ignore',
      timeout: 25000,
    });
  } catch {
    /* ignore */
  }
}

/** 杀掉以该 profile 为 --user-data-dir 的全部 msedge 进程（整组） */
export function killEdgeForProfile(profile) {
  const tag = String(profile).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  if (tag && TAG_RE.test(tag)) killByTags([tag]);
}

/** 杀进程 + 等一会儿 + 有界删除；删不掉不报错，交给下次启动清扫 */
export async function cleanupProfile(profile) {
  killEdgeForProfile(profile);
  await new Promise((r) => setTimeout(r, 800));
  await Promise.race([
    rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {}),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
}

/** 启动时清扫：超过 maxAgeMs 的旧 profile 目录，先杀掉还赖着的浏览器，再删 */
export function sweepStaleProfiles(maxAgeMs = 3600000) {
  let entries = [];
  try {
    entries = readdirSync(tmpdir());
  } catch {
    return;
  }
  const stale = [];
  for (const n of entries) {
    if (!TAG_RE.test(n)) continue;
    try {
      if (Date.now() - statSync(join(tmpdir(), n)).mtimeMs > maxAgeMs) stale.push(n);
    } catch {
      /* 可能正被占用 */
    }
  }
  if (!stale.length) return;
  killByTags(stale);
  for (const n of stale) {
    rm(join(tmpdir(), n), { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }).catch(() => {});
  }
}
