// 只读探针：从 MuMu 模拟器拉 Cocos 的 localStorage（databases/jsb.sqlite）并解析，
// 用来确认「討伐董卓/劉備」存档的剧本号、runKey、城兵、以及 deploy 相关键。
// 用法：node work/march_deploy/probe_device.mjs [device] [outfile]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const ADB = String.raw`F:\devtools\android\sdk\platform-tools\adb.exe`;
const PKG = 'com.sanguo.sango2';
const dev = process.argv[2] || '127.0.0.1:16384';
const out = process.argv[3] || String.raw`F:\sanguo\work\march_deploy\jsb.sqlite`;

const raw = execFileSync(ADB, ['-s', dev, 'shell', `run-as ${PKG} cat databases/jsb.sqlite | base64`], {
  maxBuffer: 32 * 1024 * 1024,
});
const buf = Buffer.from(String(raw).replace(/\s+/g, ''), 'base64');
writeFileSync(out, buf);
console.log(`wrote ${out} (${buf.length} B)`);

const db = new DatabaseSync(out, { readOnly: true });
const tables = db.prepare("select name from sqlite_master where type='table'").all();
console.log('tables:', tables.map((t) => t.name).join(', '));
for (const t of tables) {
  const rows = db.prepare(`select * from ${t.name}`).all();
  console.log(`-- ${t.name} rows=${rows.length}`);
  for (const row of rows) {
    const cols = Object.keys(row);
    const key = String(row[cols[0]] ?? '');
    const val = String(row[cols[1]] ?? '');
    if (key !== 'sanguo_campaign_v1') {
      console.log(`   ${key.slice(0, 48)} -> ${val.slice(0, 120)}`);
      continue;
    }
    let save = null;
    try {
      save = JSON.parse(val);
    } catch {
      console.log(`   ${key} (unparsable, ${val.length} ch)`);
      continue;
    }
    console.log('   runKey:', save.runKey, '| owned:', JSON.stringify(save.owned), '| month:', save.month);
    console.log('   keys:', Object.keys(save).sort().join(','));
    const cities = save.cities || {};
    for (const name of Object.keys(cities)) {
      const c = cities[name];
      if (!c || typeof c !== 'object') continue;
      const troops = c.troops;
      if (troops !== undefined) {
        console.log(`   city ${name}: troops=${troops} pop=${c.pop} money=${c.money} owner=${c.owner} major=${c.major} officers=${Array.isArray(c.officers) ? JSON.stringify(c.officers) : String(c.officers)}`);
      }
    }
    console.log('   armies:', JSON.stringify(save.armies));
    if (save.roster) console.log('   roster keys:', Object.keys(save.roster).slice(0, 20).join(','));
  }
}
