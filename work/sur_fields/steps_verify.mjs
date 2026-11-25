// R196 运行时校验（浏览器内，非 node）：动态 import 页面自己的 /web/saves.js，
// 验 generalRecord 这个可选字段在「写档 → 读档 → 归一化」整条链上真的往返、且不删未知键。
//   $env:MATCH='campaign.html'; $env:PORT='9333'; node cdpweb.mjs run steps_verify.mjs
export default async ({ s, evaluate, log }) => {
  await s('Page.bringToFront');
  const out = await evaluate(`(async () => {
    const S = await import('/web/saves.js');
    const r = {};
    r.version = S.SNAPSHOT_VERSION;
    // ① 旧档（v3 无 generalRecord）读档不炸、不补键
    const old = { v: 3, month: 2, wins: 4 };
    r.oldRecord = S.generalRecordOf(old, '呂布');
    r.oldHasKey = Object.prototype.hasOwnProperty.call(old, 'generalRecord');
    // ② 落账只加一个键
    const save = { v: 3, wins: 4, losses: 1, streak: 2, bestStreak: 5, fooUnknown: 'keep', tire: { 呂布: 20 } };
    const wrote = S.noteGeneralResult(save, '呂布', false);
    r.wrote = wrote;
    r.after = S.generalRecordOf(save, '呂布');
    r.unknownKept = save.fooUnknown === 'keep';
    r.winsKept = save.wins === 4 && save.losses === 1 && save.streak === 2 && save.bestStreak === 5;
    r.tireKept = JSON.stringify(save.tire) === JSON.stringify({ 呂布: 20 });
    // ③ 过一遍 ensureSnapshotShape / upgradeSnapshot（写档前的归一化）不丢字段
    const up = S.upgradeSnapshot(JSON.parse(JSON.stringify(save)));
    r.upSteps = up.steps;
    r.upRecord = up.snapshot.generalRecord;
    r.upUnknown = up.snapshot.fooUnknown;
    // ④ JSON 往返（localStorage 就是这样存的）
    const back = JSON.parse(JSON.stringify(up.snapshot));
    r.rt = S.generalRecordOf(back, '呂布');
    // ⑤ 页面本身的存档键里现在有没有 generalRecord（截图探针不写档 → 应无）
    r.pageHasRec = !!S.generalRecordOf(JSON.parse(localStorage.getItem('sg_saves_v3') || '{}'), '呂布');
    return r;
  })()`);
  log('verify ' + JSON.stringify(out, null, 1));
  return out;
};
