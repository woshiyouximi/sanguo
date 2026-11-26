/* R221 F-01 勝者門取證：7.5 在預設 opts（無 lastBattle）下為何拿到 null */
import * as M from '../cocos_surrender/_sim/SurrenderModel.js';
import * as R from '../cocos_surrender/_sim/core/roster.js';

const DATA = {
  generals: [
    { NAME: '張遼', STR: 92, INT: 78, Loyal: 52, CONSTANCY: 4 },
    { NAME: '程昱', STR: 62, INT: 90, Loyal: 20, CONSTANCY: 5 },
    { NAME: '華佗', STR: 22, INT: 88, Loyal: 80, CONSTANCY: 4 },
    { NAME: '劉備', STR: 74, INT: 72, Loyal: 99, CONSTANCY: 9 },
    { NAME: '守將', STR: 50, INT: 40, Loyal: 60, CONSTANCY: 3 },
    { NAME: '死士', STR: 40, INT: 30, Loyal: 20, CONSTANCY: 4 },
    { NAME: '曹操', STR: 96, INT: 92, Loyal: 100, CONSTANCY: 9 },
  ],
  scenarios: [{ kings: [{ NAME: '劉備' }] }],
  troops: [],
  formations: [],
  magics: [],
  wises: [],
  terrains: [],
  items: [],
};
const HOME = '許昌';

function freshSave() {
  return {
    owned: ['許昌'],
    wins: 3,
    losses: 1,
    month: 118,
    gold: 900,
    cities: { 許昌: { troops: 400, pop: 90000, money: 300 } },
    roster: { 許昌: ['曹操', '夏侯惇'] },
    captured: ['張遼', '程昱'],
    executed: ['華佗', '死士'],
  };
}
const open = (save, opts) => M.openOf(M.saveOf(save), DATA, HOME, opts);

const save = M.saveOf(freshSave());
console.log('decideBattleWon(freshSave)=', R.decideBattleWon(save));
console.log('ourForceNames=', R.ourForceNames(save));

const rosterMine = freshSave();
rosterMine.captured = ['夏侯惇', '張遼'];
const s0 = M.saveOf(rosterMine);
console.log('decideBattleWon(rosterMine)=', R.decideBattleWon(s0));
console.log('surrenderCandidates default=', JSON.stringify(R.surrenderCandidates(s0, DATA, HOME, {})));
console.log('default open =', open(rosterMine) === null ? 'null' : open(rosterMine).cards.map((c) => c.name));

const sWin = open(rosterMine, { won: true });
console.log('won:true open =', sWin === null ? 'null' : sWin.cards.map((c) => c.name));
const sLose = open(rosterMine, { won: false });
console.log('won:false open =', sLose === null ? 'null' : 'not null');
