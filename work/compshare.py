"""CompShare OpenAPI 客户端（UCloud 风格签名），用于查余额、列实例、开机、关机。

签名规则（与 tools/dsh-plugin-cloud-server/index.js 一致）：
  把除 Signature 外的所有参数按 key 名排序，拼成 key+value 字符串，末尾接私钥，SHA1 取 hex。

用法：
  python compshare.py balance
  python compshare.py list
  python compshare.py start <UHostId>
  python compshare.py stop  <UHostId>
  python compshare.py wait  <UHostId> --state Running --timeout 600
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request

API_BASE = "https://api.compshare.cn/"
PUB = os.environ.get("COMPSHARE_PUBLIC_KEY", "4ed3QWAKoE8KNHvUemPmTfDBNTkxibIHe3ytkhy")
PRIV = os.environ.get("COMPSHARE_PRIVATE_KEY", "3gTylxpEX2XHanr7WbFdirEsWmrIrgjhW4iEDcMNo9oDM2Pmu")

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def sign(params, private_key):
    raw = ""
    for k in sorted(params):
        v = params[k]
        if v is None or v == "":
            continue
        raw += str(k) + str(v)
    return hashlib.sha1((raw + private_key).encode("utf-8")).hexdigest()


def call(action, **params):
    payload = {"Action": action, "PublicKey": PUB}
    payload.update({k: v for k, v in params.items() if v is not None and v != ""})
    payload["Signature"] = sign(payload, PRIV)
    url = API_BASE + "?" + urllib.parse.urlencode(payload)
    with urllib.request.urlopen(url, timeout=25) as r:
        text = r.read().decode("utf-8", "replace")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise SystemExit("非 JSON 响应：%s" % text[:300])
    if isinstance(data.get("RetCode"), int) and data["RetCode"] != 0:
        raise SystemExit("API 错误 RetCode=%s：%s" % (data["RetCode"], data.get("Message")))
    return data


def instances():
    rows, offset = [], 0
    for _ in range(10):
        r = call("DescribeCompShareInstance", Limit=100, Offset=offset)
        batch = r.get("UHostSet") or []
        rows.extend(batch)
        offset += len(batch)
        total = r.get("TotalCount") or r.get("Total")
        if len(batch) < 100:
            break
        if isinstance(total, (int, float)) and offset >= total:
            break
    return rows


def show(rows):
    if not rows:
        print("（账号下没有实例）")
        return
    print("%-24s %-12s %-12s %-10s %-22s %-6s" % ("UHostId", "State", "Region", "Zone", "Name", "GPU"))
    for h in rows:
        print("%-24s %-12s %-12s %-10s %-22s %-6s" % (
            str(h.get("UHostId", ""))[:24], str(h.get("State", ""))[:12],
            str(h.get("Region", ""))[:12], str(h.get("Zone", ""))[:10],
            str(h.get("Name", "") or h.get("UHostName", ""))[:22],
            str(h.get("GpuType", "") or h.get("Gpu", ""))[:6]))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("balance")
    sub.add_parser("list")
    for name in ("start", "stop"):
        p = sub.add_parser(name)
        p.add_argument("id")
    p = sub.add_parser("wait")
    p.add_argument("id")
    p.add_argument("--state", default="Running")
    p.add_argument("--timeout", type=int, default=900)
    a = ap.parse_args()

    if a.cmd == "balance":
        r = call("GetBalance")
        print(json.dumps(r.get("AccountInfo", r), ensure_ascii=False, indent=1))
        return
    if a.cmd == "list":
        show(instances())
        return
    rows = instances()
    target = next((h for h in rows if str(h.get("UHostId")) == a.id), None)
    if not target:
        raise SystemExit("没找到实例 %s；先跑 list" % a.id)
    if a.cmd in ("start", "stop"):
        action = "StartCompShareInstance" if a.cmd == "start" else "StopCompShareInstance"
        r = call(action, Region=target.get("Region"), Zone=target.get("Zone"), UHostId=a.id)
        print("%s → %s" % (action, json.dumps(r, ensure_ascii=False)[:300]))
        return
    if a.cmd == "wait":
        t0 = time.time()
        while time.time() - t0 < a.timeout:
            rows = instances()
            cur = next((h for h in rows if str(h.get("UHostId")) == a.id), None)
            state = str(cur.get("State")) if cur else "?"
            print("[%4.0fs] %s" % (time.time() - t0, state), flush=True)
            if state == a.state:
                print("\n到达 %s。实例详情：" % a.state)
                print(json.dumps(cur, ensure_ascii=False, indent=1)[:2000])
                return
            time.sleep(10)
        raise SystemExit("等待超时（%ds），当前状态 %s" % (a.timeout, state))


if __name__ == "__main__":
    main()
