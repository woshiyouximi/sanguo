// 回收本轮验证遗留的 Edge 进程（只杀 user-data-dir 指向我们 profile 的，不碰用户自己开的 Edge）。
//
//   node work\cocos_verify\reap.mjs           只报告
//   node work\cocos_verify\reap.mjs --kill    真杀
//
// 为什么会需要：`cdpweb.mjs run` 中途抛错时，`close` 不会被执行，浏览器会一直留着，
// 每个 msedge 会占几百 MB 内存 + 若干渲染进程，连开十几轮 CPU 就上去了（用户 2026-11-25 报过）。
import { execFileSync } from 'node:child_process';

const KILL = process.argv.includes('--kill');
const MATCH = (process.argv.find((a) => a.startsWith('--match=')) || '--match=edgeprof').slice('--match='.length);
const ps = `
$procs = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -match '${MATCH.replace(/'/g, "''")}' })
$paths = @($procs | ForEach-Object {
  if ($_.CommandLine -match '--user-data-dir=([^" ]+)') { $matches[1] } else { '' }
})
[pscustomobject]@{ count = $procs.Count; pids = ($procs | ForEach-Object { $_.ProcessId }); profiles = $paths } |
  ConvertTo-Json -Compress
`;

let info;
try {
  info = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim());
} catch (e) {
  console.error('reap: 查询失败', e.message);
  process.exit(1);
}

const count = Number(info.count || 0);
const pids = Array.isArray(info.pids) ? info.pids : info.pids ? [info.pids] : [];
console.log(`遗留验证浏览器进程: ${count}${count ? ' · pids ' + pids.join(',') : ''}`);
if (!count) process.exit(0);

if (!KILL) {
  console.log('（只报告；加 --kill 才真杀）');
  process.exit(0);
}
for (const pid of pids) {
  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    /* 已经没了 */
  }
}
console.log(`已清理 ${pids.length} 个进程树`);
