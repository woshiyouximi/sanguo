/**
 * [115_release] 调试口统一开关（发布卫生）。
 *
 * 以前调试参数是裸的：`?sim=250`、`?freeze=1`、`?cast=41,10,7`、`?gen=關羽&seq=45`
 * 谁拿到 URL 都能用，等于把内部调试面直接发布出去。现在统一规则：
 *
 *   只有 `?dev=1` 时才认任何调试参数；没有 `?dev=1` 时下面四个函数全部"什么也读不到"。
 *
 * 用法（classic script，挂 window.SGDev，不是 ESM —— index.html 的内联脚本和
 * items.html 的内联 module 都要用，main.js 也读同一个对象）：
 *
 *   <script src="./devflags.js"></script>
 *
 *   SGDev.DEV            是否开发模式（true/false）
 *   SGDev.val(name)      string|null   调试参数原值；非 DEV 一律 null
 *   SGDev.on(name)       boolean       `?dev=1&freeze=1` / `?dev=1&freeze` → true
 *   SGDev.num(name, def) number        `?dev=1&sim=250` → 250；非法/缺省 → def
 *
 * 设计取舍：缺省是"关"，不是"开"。devflags.js 没加载成功（404、被 CSP 挡、被裁剪的
 * 发布包里漏了）时，main.js / items.html 里的 shim 退化成全关 —— 宁可少一个调试功能，
 * 也不让调试口裸奔。这一条由 release_check.mjs 的 C4 断言守着（[?&]dev=1 只许出现在本文件）。
 */
(function (global) {
  'use strict';
  var search = String((global.location && global.location.search) || '');
  var Q = new URLSearchParams(search);
  // [216_apk] 發佈形態（APK 殼 / ?rel=1）下 DEV 一律 false：`?dev=1` 也不再開任何調試口
  var DEV = !global.__RELEASE__ && /[?&]dev=1/.test(search);

  /** 调试参数原值；非开发模式返回 null（调用方按"没给"处理）。 */
  function val(name) {
    return DEV ? Q.get(name) : null;
  }

  /** 开关型调试参数：值为空 / 1 / true / yes / on 都算开。 */
  function on(name) {
    if (!DEV) return false;
    var v = Q.get(name);
    if (v === null) return false;
    return v === '' || /^(1|true|yes|on)$/i.test(v);
  }

  /** 数字型调试参数：给了但不是有限数就当没给。 */
  function num(name, dflt) {
    var v = val(name);
    if (v === null || v === '') return dflt;
    var n = Number(v);
    return Number.isFinite(n) ? n : dflt;
  }

  global.SGDev = {
    DEV: DEV,
    val: val,
    on: on,
    num: num,
    /** 原始 query（只读用途；业务参数不走这里，见 main.js 的 QUERY） */
    query: Q,
  };
})(typeof window !== 'undefined' ? window : globalThis);
