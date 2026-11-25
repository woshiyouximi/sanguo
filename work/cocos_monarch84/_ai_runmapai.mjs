import { PLAYER_FORCE, runMonth as runAiMonth } from './_ai_AiRunner.mjs';
import { garrisonOf } from './_ai_garrison.mjs';
import { pathBetween } from './_ai_march.mjs';
const GameState = new Proxy({}, { get: (_t, k) => globalThis.__GS__[k] });
export function runMapAi(host) {
    const save = host.save;
    if (!save || !host.data)
        return null;
    const garrisonOfCity = (name) => {
        const data = host.data;
        if (!data)
            return null;
        const g = garrisonOf(data, 0, name);
        if (!g)
            return null;
        return {
            owner: g.owner,
            major: g.major,
            garrison: g.garrison,
            officers: g.officers.map((o) => ({ name: o.name, str: o.str, int: o.int, loyal: o.loyal, status: o.status })),
        };
    };
    // 型別橋接（唯一一處斷言）：`GameState.CityRuntime.officers` 目前宣告成 `string[]`，
    // 而 AI 的 `AiCity.officers` 是 `AiOfficer[]`（name/str/int/loyal/status 物件）。
    // 執行期沒差：
    //   - AI 自己的 `buildMeta/ensureMeta` 只從 `garrisonOf` 與 cities 補缺，不假設型別；
    //   - `normalize()` 的 `stringArray()` 會把物件濾掉（見報告「存檔補丁 B2」），
    //     所以 `loadSave()` 之後這個欄位只會是 `[]`，AI 會重新從 garrison.json 補。
    // 若把 GameState 的宣告改成物件陣列，這行斷言就可以刪掉。
    const out = runAiMonth(save, host.cities, host.generals, {
        playerId: PLAYER_FORCE,
        paths: host.paths,
        seed: (save.month + 1) * 7919, // 与 web 同一条种子公式
        garrisonOf: garrisonOfCity,
        capOf: (name) => {
            const city = host.cityByName(name);
            return city ? GameState.garrisonOf(city) : 0;
        },
    });
    for (const row of out.incoming) {
        const pathIndex = pathBetween(host.scenarioLike(), row.from, row.to);
        if (pathIndex === null)
            continue;
        // 有将带兵就用将名，没有就占位（与 spawnRaid 同口径）
        const general = row.cand?.generals?.[0] ?? '來犯之將';
        const army = {
            id: GameState.nextArmyId('B'),
            side: 'B',
            from: row.from,
            to: row.to,
            pathIndex,
            progress: 0,
            troops: Math.max(1, Math.round(row.troops)),
            general,
        };
        GameState.addArmy(army);
    }
    if (out.changed)
        GameState.persistSave();
    return out;
}
