#!/usr/bin/env python3
"""Log what actually happened: compare today's status line for each bill with the last snapshot.
  python changes.py <session>   -> data/changes.json  {"session","generated","snap":{key:status},"log":[{"d","k","from","to"}]}
Keeps the newest 3000 entries. First run records a baseline only (no fake 'changes')."""
import json, os, sys, datetime
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
def main():
    ses = sys.argv[1]
    p = os.path.join(D, "status_%s.json" % ses)
    if not os.path.exists(p): sys.exit("no status file " + p)
    cur = {k: v.get("status", "") for k, v in json.load(open(p)).items() if k != "_session" and isinstance(v, dict)}
    out = os.path.join(D, "changes.json")
    old = json.load(open(out)) if os.path.exists(out) else {}
    if old.get("session") != ses: old = {}
    snap, log = old.get("snap"), old.get("log", [])
    now = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    suspect = False
    if snap is not None and snap:
        moved = sum(1 for k, t in cur.items() if k in snap and snap[k] != t)
        gone = sum(1 for k in snap if k not in cur)
        # A partial or garbled download looks like "everything changed" or "half the bills vanished".
        if moved > 0.3 * len(snap) or gone > 0.2 * len(snap) or len(cur) < 0.8 * len(snap):
            suspect = True
            print("changes: SUSPECT run (%d changed, %d missing of %d); not logging, keeping old snapshot" % (moved, gone, len(snap)), file=sys.stderr)
    if suspect and old.get("suspects", 0) < 2:   # after 3 nights in a row, accept it as real (e.g. a new session started)
        old["suspect"] = now; old["suspects"] = old.get("suspects", 0) + 1
        json.dump(old, open(out, "w"), separators=(",", ":")); return
    if snap is not None:
        for k, t in cur.items():
            if k in snap and snap[k] != t: log.append({"d": now, "k": k, "from": snap[k], "to": t})
            elif k not in snap: log.append({"d": now, "k": k, "from": "", "to": t})
    json.dump({"suspects": 0, "session": ses, "generated": now, "baseline": old.get("baseline") or now, "snap": cur, "log": log[-3000:]}, open(out, "w"), separators=(",", ":"))
    print("changes: %d bills, %d logged" % (len(cur), len(log)), file=sys.stderr)
if __name__ == "__main__": main()
