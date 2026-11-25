# -*- coding: utf-8 -*-
"""A3 step2：解 BODY/WEAPON/HORSE 三层 offx/offy 语义 + 残差统计。

候选语义（P = 地面锚点，y 向下）：
  F1  draw = P - (offx, offy)          [off = 锚点在图内的位置；loader 取负后直接加]
  F2  draw = P + (offx, offy)          [off = 图左上角相对锚点]
  F3  draw = P + (-offx, +offy)
  F4  draw = P + (+offx, -offy)
  F5  draw = P - (w/2, h)              [不用 off，朴素底边中点]

判据全部只用像素：
  T1 坐骑层  蹄底必须落在地面 y=0
  T2 身体层  死亡序列底边 -40 → ≈0（骑在马上 → 落地）
  T3 身体层  站立/动作帧底边 = 同一鞍高（IQR 即残差）
  T4 跨层    武器<->身体 alpha 最小距离（接触判据）
  T5 握把    重叠区质心投影到武器主轴 p∈[0,1]，端点=握把
  T6 遮挡    身体压住坐骑"头部盒"的比例
几何全部在世界坐标点集上算（像素坐标 + draw 偏移），不铺画布，避免大画布开销。
"""
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"F:\sanguo")
OUT = ROOT / "work" / "gen_sprites"
INV = json.loads((OUT / "inventory.json").read_text(encoding="utf-8"))
FILES = INV["files"]
PNG = ROOT / "export" / "png" / "SHAPE" / "MAJOR"

FORMULAS = {
    "F1_neg_both": lambda r: (-r["offx"], -r["offy"]),
    "F2_pos_both": lambda r: (r["offx"], r["offy"]),
    "F3_negx_posy": lambda r: (-r["offx"], r["offy"]),
    "F4_posx_negy": lambda r: (r["offx"], -r["offy"]),
    "F5_bottom_center": lambda r: (-r["w"] // 2, -r["h"]),
}

_cache = {}


def points(sub, stem):
    """世界坐标 ink 点集（相对锚点）, 返回 (N,2) float"""
    key = (sub, stem)
    if key in _cache:
        return _cache[key]
    a = np.asarray(Image.open(PNG / sub / (stem + ".png")).convert("RGBA"))[..., 3]
    ys, xs = np.nonzero(a)
    _cache[key] = (np.vstack([xs, ys]).T.astype(np.float64), a.shape)
    return _cache[key]


def world_pts(sub, stem, f):
    pts, shape = points(sub, stem)
    dx, dy = f(FILES[sub][stem])
    return pts + np.array([dx, dy])


def _mask_at(pts, origin, shape):
    m = np.zeros(shape, bool)
    x = np.round(pts[:, 0] - origin[0]).astype(int)
    y = np.round(pts[:, 1] - origin[1]).astype(int)
    ok = (x >= 0) & (y >= 0) & (x < shape[1]) & (y < shape[0])
    m[y[ok], x[ok]] = True
    return m


def _dil(m):
    p = m.copy()
    p[1:, :] |= m[:-1, :]
    p[:-1, :] |= m[1:, :]
    q = p.copy()
    q[:, 1:] |= p[:, :-1]
    q[:, :-1] |= p[:, 1:]
    return q


def min_dist(A, B, cap=14):
    """两个点集的最小距离（栅格化后用膨胀计步；>cap 一律报 cap）"""
    if len(A) == 0 or len(B) == 0:
        return float("inf")
    # 便宜的包围盒下界：分轴间隙的 max 就是 Chebyshev 距离下界
    a0, a1 = A.min(0), A.max(0)
    b0, b1 = B.min(0), B.max(0)
    lb = max(max(0.0, a0[0] - b1[0], b0[0] - a1[0]), max(0.0, a0[1] - b1[1], b0[1] - a1[1]))
    if lb > cap:
        return float(cap) + 0.5
    lo = np.floor(np.minimum(A.min(0), B.min(0))) - (cap + 2)
    hi = np.ceil(np.maximum(A.max(0), B.max(0))) + (cap + 2)
    shape = (int(hi[1] - lo[1]) + 1, int(hi[0] - lo[0]) + 1)
    if shape[0] * shape[1] > 4_000_000:
        return -1.0
    ma = _mask_at(A, lo, shape)
    mb = _mask_at(B, lo, shape)
    if (ma & mb).any():
        return 0.0
    for k in range(1, cap + 1):
        ma = _dil(ma)
        if (ma & mb).any():
            return float(k)
    return float(cap) + 0.5


def bottom(sub, stem, f):
    r = FILES[sub][stem]
    dx, dy = f(r)
    return dy + r["bbox"][3]


def main():
    body, weap, horse = FILES["BODY"], FILES["WEAPON"], FILES["HORSE"]
    rep = {}
    print("== T1 坐骑蹄底 y（应≈0，允许阴影 0..8）==")
    t1 = {}
    for name, f in FORMULAS.items():
        bs = np.array([bottom("HORSE", k, f) for k in horse])
        t1[name] = {"median": float(np.median(bs)), "iqr": float(np.percentile(bs, 75) - np.percentile(bs, 25)),
                    "abs_median": float(np.median(np.abs(bs)))}
        print("   %-18s median=%7.1f IQR=%4.1f |median|=%7.1f" % (name, t1[name]["median"], t1[name]["iqr"], t1[name]["abs_median"]))
    rep["T1_horse_ground"] = t1

    # ---- T2/T3 用 things_parsed 的真实帧序 ----
    seqs = {}
    for o in INV["objects"]:
        if "BODY" in o["dir"].upper():
            seqs[o["seq"]] = o
    print("\n== T2 死亡序列底边 y（10 步，中位跨 30 套造型）==")
    t2 = {}
    for name, f in FORMULAS.items():
        rows = []
        for sq, o in sorted(seqs.items()):
            fr = [x["shape"] for x in o["actions"]["Death"]["frames"]]
            rows.append([bottom("BODY", x, f) if x in body else np.nan for x in fr])
        arr = np.array(rows, float)
        m = np.nanmedian(arr, axis=0)
        t2[name] = [round(float(v), 1) for v in m]
        print("   %-18s %s" % (name, t2[name]))
    rep["T2_death_bottom"] = t2

    print("\n== T3 按动作码的底边统计（F1，F 除外）==")
    by_code = defaultdict(list)
    for k, r in body.items():
        by_code[r["code"]].append(bottom("BODY", k, FORMULAS["F1_neg_both"]))
    t3 = {}
    for code in sorted(by_code):
        v = np.array(by_code[code])
        t3[code] = {"n": len(v), "median": round(float(np.median(v)), 1),
                    "iqr": round(float(np.percentile(v, 75) - np.percentile(v, 25)), 1),
                    "p05": round(float(np.percentile(v, 5)), 1), "p95": round(float(np.percentile(v, 95)), 1)}
        print("   %-3s n=%4d median=%7.1f IQR=%5.1f p05..p95=%.1f..%.1f" %
              (code, len(v), t3[code]["median"], t3[code]["iqr"], t3[code]["p05"], t3[code]["p95"]))
    rep["T3_by_code"] = t3
    stand = [v["median"] for c, v in t3.items() if c not in ("F",)]
    rep["T3_stand_median_range"] = [round(min(stand), 1), round(max(stand), 1)]
    print("   站立类动作码的底边中位范围:", rep["T3_stand_median_range"])

    # ---- 抽样对 ----
    shapes = list("123456789ABCDE0")
    pairs_w, pairs_h = [], []
    for camp in "LR":
        for sh in shapes:
            for slot, cls in ((1, "A1"), (2, "B1"), (3, "C1"), (4, "D1")):
                for fr in ("0001", "0006", "0009"):
                    b, w = "%s%sW%s%s" % (camp, sh, slot, fr), "%sW1%s" % (cls, fr)
                    if b in body and w in weap:
                        pairs_w.append((b, w))
                for fr in ("0002", "0006", "0009"):
                    b, w = "%s%sA%s%s" % (camp, sh, slot, fr), "%sA1%s" % (cls, fr)
                    if b in body and w in weap:
                        pairs_w.append((b, w))
            for cod in "ABCDEFGH":
                pairs_h.append(("%s%sW1%s" % (camp, sh, "0001"), "H%sW1%s" % (cod, "0001")))
    print("\n抽样：武器对 %d，坐骑对 %d" % (len(pairs_w), len(pairs_h)))

    # ---- T4 跨层最小距离 ----
    print("\n== T4 武器<->身体 alpha 最小距离 ==")
    t4 = {"weapon": {}, "horse": {}}
    for name, f in FORMULAS.items():
        ds = [min_dist(world_pts("WEAPON", w, f), world_pts("BODY", b, f)) for b, w in pairs_w]
        ds = np.array(ds)
        t4["weapon"][name] = {"contact_pct": float(100 * (ds <= 1.5).mean()), "median": round(float(np.median(ds)), 2),
                              "p95": round(float(np.percentile(ds, 95)), 2)}
        print("   %-18s 接触率=%5.1f%%  中位=%7.2f  p95=%7.2f" % (name, t4["weapon"][name]["contact_pct"],
                                                               np.median(ds), np.percentile(ds, 95)))
    print("== T4b 身体<->坐骑 alpha 最小距离 ==")
    for name, f in FORMULAS.items():
        ds = np.array([min_dist(world_pts("BODY", b, f), world_pts("HORSE", h, f)) for b, h in pairs_h])
        t4["horse"][name] = {"contact_pct": float(100 * (ds <= 1.5).mean()), "median": round(float(np.median(ds)), 2),
                             "p95": round(float(np.percentile(ds, 95)), 2)}
        print("   %-18s 接触率=%5.1f%%  中位=%7.2f  p95=%7.2f" % (name, t4["horse"][name]["contact_pct"],
                                                               np.median(ds), np.percentile(ds, 95)))
    rep["T4_contact"] = t4

    # ---- T5/T6 只在 F1 上做 ----
    f = FORMULAS["F1_neg_both"]
    pvals, ovl, gaps = [], [], []
    for b, w in pairs_w:
        B, Wp = world_pts("BODY", b, f), world_pts("WEAPON", w, f)
        gaps.append(min_dist(Wp, B))
        # 重叠（像素栅格化后的交集近似：用 B 的掩膜做点内判定）
        r = FILES["BODY"][b]
        a = np.asarray(Image.open(PNG / "BODY" / (b + ".png")).convert("RGBA"))[..., 3] > 0
        dx, dy = f(r)
        gx = np.round(Wp[:, 0] - dx).astype(int)
        gy = np.round(Wp[:, 1] - dy).astype(int)
        ok = (gx >= 0) & (gy >= 0) & (gx < a.shape[1]) & (gy < a.shape[0])
        inside = np.zeros(len(Wp), bool)
        inside[ok] = a[gy[ok], gx[ok]]
        ovl.append(100.0 * inside.mean())
        if inside.sum() >= 5:
            c = Wp.mean(0)
            M = np.cov(Wp.T)
            ev, evec = np.linalg.eigh(M)
            ax = evec[:, -1]
            proj = (Wp - c) @ ax
            ip = (Wp[inside] - c) @ ax
            lo, hi = proj.min(), proj.max()
            p = (ip.mean() - lo) / max(1e-6, hi - lo)
            pvals.append(min(p, 1 - p))   # 距最近端点的归一化位置
    pvals = np.array(pvals)
    ovl = np.array(ovl)
    rep["T5_grip"] = {"n": len(pvals), "p_median": round(float(np.median(pvals)), 3),
                      "p_lt_0.15": round(float(100 * (pvals < 0.15).mean()), 1),
                      "p_lt_0.25": round(float(100 * (pvals < 0.25).mean()), 1),
                      "overlap_pct_median": round(float(np.median(ovl)), 1),
                      "overlap_pct_p95": round(float(np.percentile(ovl, 95)), 1)}
    print("\n== T5 握把端位置（F1；p 为重叠质心到最近端点的归一化距离）==")
    print("   ", rep["T5_grip"])
    rep["T6_residual"] = {"weapon_gap_median": round(float(np.median(gaps)), 2),
                          "weapon_gap_p95": round(float(np.percentile(gaps, 95)), 2),
                          "weapon_gap_max": round(float(np.max(gaps)), 2)}
    print("== T6 装配残差（F1，武器到身体的最小距离）==", rep["T6_residual"])

    (OUT / "align_report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nwrote", OUT / "align_report.json")


if __name__ == "__main__":
    main()

