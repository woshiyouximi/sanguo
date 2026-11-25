// 取 scenario 1 的城市名、以及幾個武將的 city_by_times[0]（實機取證要挑「出發城 + 城裡真的有武將」）。
// 輸出寫檔（中文經 PowerShell 會被 CP936 弄壞，用 read 工具看）。
import { readFileSync, writeFileSync } from 'node:fs';

const D = 'F:\\sanguo\\game\\data\\';
const scen = JSON.parse(readFileSync(D + 'scenarios.json', 'utf8'));
const gens = JSON.parse(readFileSync(D + 'generals.json', 'utf8'));
const s1 = scen[0];
const lines = [];
lines.push(`scenarios: ${scen.length}, scenario[0].id=${s1.id} NAME=${s1.NAME ?? ''}`);
lines.push(`cities(${s1.cities.length}): ${s1.cities.map((c) => `${c.NAME}(${c.POPULATION}/${c.MONEY})`).join(' ')}`);
const want = ['曹操', '袁紹', '袁绍', '劉備', '刘备', '孫堅', '孙坚', '公孫瓚', '公孙瓒', '張飛', '关羽', '關羽'];
for (const g of gens) {
  if (!want.includes(g.NAME)) continue;
  lines.push(`general ${g.NAME}: city0=${g.city_by_times?.[0]} st0=${g.status_by_times?.[0]} BaseEXP=${g.BaseEXP} UseForce=${g.UseForce} BattleArray=${g.UseBattleArray} WISESKILL=${JSON.stringify(g.WISESKILL)}`);
}
// 陳留 / 南皮 各有哪些將（scenario 1）
for (const city of ['陳留', '南皮', '平原', '北平']) {
  const who = gens.filter((g) => g.city_by_times?.[0] === city && g.status_by_times?.[0] !== '未').map((g) => g.NAME);
  lines.push(`city ${city}: ${who.join(',') || '(none)'}`);
}
writeFileSync('F:\\sanguo\\work\\march_flow\\_data_probe.txt', lines.join('\n') + '\n', 'utf8');
console.log('wrote _data_probe.txt lines=' + lines.length);
