import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadMagicProgram, primeMagicProgram } from '../src/core/smartscript/runtime.ts';

/**
 * R224 P0-2 的回归测试。
 *
 * 原生包点技能格会崩在 `Cannot read properties of undefined (reading 'toLowerCase')`：
 * Cocos native 的 `URL` 是 jsb-adapter 垫片（用 `document.createElementNS('a')` 取 protocol），
 * 而 `loadMagicProgram()` 的同步 XHR 兜底会 `new URL('magic_so.bin', DATA_URL)`。
 * 现在原生侧改走 `primeMagicProgram()` 直接塞字节，**整条路径不碰 URL、不发请求**。
 */

const DATA = new URL('../data/', import.meta.url);
const BIN = readFileSync(new URL('magic_so.bin', DATA));
const SYM = JSON.parse(readFileSync(new URL('magic_so.symbols.json', DATA), 'utf8'));

test('primeMagicProgram：塞过字节后 loadMagicProgram 不发请求、不碰 URL', () => {
    const savedFetch = globalThis.fetch;
    let fetchCalls = 0;
    (globalThis as unknown as { fetch: unknown }).fetch = () => {
        fetchCalls += 1;
        return Promise.reject(new Error('不應該發請求'));
    };
    try {
        primeMagicProgram(BIN, SYM);
        const program = loadMagicProgram();
        assert.ok(program, '拿不到程序');
        assert.ok(program.functions.length > 400, `函数数異常：${program.functions.length}`);
        assert.equal(program.bytes.length, BIN.length);
        assert.equal(fetchCalls, 0, '預載之後不該再發請求');
    }
    finally {
        (globalThis as unknown as { fetch: unknown }).fetch = savedFetch;
    }
});

test('primeMagicProgram：不依賴全局 URL（模擬 native 墊片會拋）', () => {
    const g = globalThis as unknown as { URL: unknown; XMLHttpRequest: unknown };
    const savedUrl = g.URL;
    const savedXhr = g.XMLHttpRequest;
    g.URL = function NativeUrlShim() {
        throw new TypeError("Cannot read properties of undefined (reading 'toLowerCase')");
    };
    g.XMLHttpRequest = undefined;
    try {
        primeMagicProgram(BIN, SYM);
        const program = loadMagicProgram();
        assert.ok(program.functions.length > 400);
    }
    finally {
        g.URL = savedUrl;
        g.XMLHttpRequest = savedXhr;
    }
});
