#!/usr/bin/env python3
"""Daily email digest of what changed in the current session.

  python digest.py            # build the digest; send it if BUTTONDOWN_API_KEY is set
  python digest.py --dry-run  # build and print it, never send

Compares today's data with data/digest_state.json (written by the previous run):
  - bills that did not exist yet (new)
  - bills whose official status text changed
If nothing changed, nothing is sent. The first run only records a baseline.
Sending uses Buttondown's API (https://buttondown.com). Subscribers sign up through the box on the
dashboard; Buttondown handles confirmation, unsubscribe links and the mailing list.
"""
import json, os, sys, html, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
STATE = os.path.join(DATA, "digest_state.json")
SITE = "https://wtintor.github.io/nm-bill-tracker/"
LEG = "https://www.nmlegis.gov/Legislation/Legislation?chamber={c}&legType={t}&legNo={n}&year={y}"
TYPES = {"HB": ("H", "B"), "SB": ("S", "B"), "HJR": ("H", "JR"), "SJR": ("S", "JR"), "HJM": ("H", "JM"),
         "SJM": ("S", "JM"), "HM": ("H", "M"), "SM": ("S", "M"), "HR": ("H", "R"), "SR": ("S", "R")}

def load(name, default):
    try:
        return json.load(open(os.path.join(DATA, name)))
    except Exception:
        return default

def bucket(t):
    """Reads the legislature's status codes, e.g. '[2] HAFC-HAFC [5] DP [6] PASSED/H (60-2) SGND BY GOV (Mar. 6) Ch. 9.'"""
    import re
    s = t.strip()
    signed = bool(re.search(r"SGND BY GOV|\bCh\.\s*\d|\bSGND\b", s))
    if signed: return "Signed into law"
    if "VETO" in s: return "Vetoed"
    if (re.search(r"\bAPI\.?\s*$", s) or "TBLD INDEF" in s or re.search(r"FAILED/[HS]\s*(\(\d+-\d+\))?\.?\s*$", s)
            or re.search(r"\btbld\.?\s*$", s)): return "Died or tabled"
    h, sn = "PASSED/H" in s, "PASSED/S" in s
    if h and sn: return "Passed both chambers"
    if h or sn: return "Passed one chamber"
    return "In progress"

def main():
    dry = "--dry-run" in sys.argv
    tr = load("tracker.json", None)
    if not tr: sys.exit("no tracker.json")
    sess = tr["sessions"]
    reg = [k for k in sess if sess[k]["k"] == "Regular"]
    cur = max(reg, key=lambda k: sess[k]["y"])
    year = sess[cur]["y"]
    status = load("status_%s.json" % cur.replace(" ", "_"), {})
    if status.get("_session") not in (None, cur):
        sys.exit("status file is for another session; not emailing")
    titles = load("titles.json", {}).get(cur, {})
    now = {}
    for key in sess[cur]["bills"]:
        s = status.get(key, {})
        now[key] = {"s": s.get("status", ""), "t": s.get("title") or ""}
    old = load("digest_state.json", None)
    os.makedirs(DATA, exist_ok=True)
    json.dump({"session": cur, "bills": now}, open(STATE, "w"), separators=(",", ":"))
    if not old or old.get("session") != cur:
        print("baseline recorded, nothing to send"); return
    ob = old["bills"]
    new = [k for k in now if k not in ob]
    moved = [k for k in now if k in ob and now[k]["s"] and now[k]["s"] != ob[k]["s"]]
    if not new and not moved:
        print("no changes, nothing to send"); return

    def line(k):
        b = sess[cur]["bills"][k]
        c, t = TYPES.get(b["t"], ("H", "B"))
        title = now[k]["t"] or titles.get(k, "") or ""
        title = title.title() if title.isupper() else title
        url = LEG.format(c=c, t=t, n=b["n"], y=str(year)[2:])
        return b, url, title

    watch = load("watch.json", {})        # {"keywords": ["groundwater"], "sponsors": ["Small"], "topics": []}
    kw = [w.lower() for w in watch.get("keywords", [])]; sp = [w.lower() for w in watch.get("sponsors", [])]
    def hit(k):
        s = status.get(k, {}); blob = (now[k]["t"] + " " + titles.get(k, "") + " " + now[k]["s"]).lower()
        who = " ".join(s.get("sponsors", [])).lower()
        return any(w in blob for w in kw) or any(w in who for w in sp)
    matches = [k for k in set(new) | set(moved) if (kw or sp) and hit(k)]
    parts, text = [], []
    def section(head, keys, show_status):
        if not keys: return
        parts.append("<h3>%s (%d)</h3><ul>" % (head, len(keys)))
        text.append("%s (%d)" % (head, len(keys)))
        for k in sorted(keys, key=lambda x: (sess[cur]["bills"][x]["t"], sess[cur]["bills"][x]["n"]))[:60]:
            b, url, title = line(k)
            st = now[k]["s"]
            parts.append('<li><a href="%s">%s %d</a> %s%s</li>' % (url, b["t"], b["n"], html.escape(title[:140]),
                         " <br><i>%s: %s</i>" % (bucket(st), html.escape(st[:160])) if show_status and st else ""))
            text.append("- %s %d %s%s" % (b["t"], b["n"], title[:140], (" [%s]" % bucket(st)) if show_status and st else ""))
        if len(keys) > 60:
            parts.append("<li>…and %d more on the dashboard.</li>" % (len(keys) - 60))
        parts.append("</ul>")
    section("Matches your watch rules", matches, True)
    signed = [k for k in moved if bucket(now[k]["s"]) in ("Signed into law", "Vetoed")]
    section("Signed or vetoed", signed, True)
    section("Status changes", [k for k in moved if k not in signed], True)
    section("New bills", new, False)
    parts.append('<p><a href="%s">Open the full dashboard</a></p>' % SITE)
    subject = "NM Legislature %s: %d status change%s, %d new bill%s" % (
        year, len(moved), "" if len(moved) == 1 else "s", len(new), "" if len(new) == 1 else "s")
    body = "".join(parts)
    print(subject); print("\n".join(text))
    key = os.environ.get("BUTTONDOWN_API_KEY")
    if dry or not key:
        print("(not sent: %s)" % ("dry run" if dry else "BUTTONDOWN_API_KEY is not set")); return
    req = urllib.request.Request("https://api.buttondown.email/v1/emails",
        data=json.dumps({"subject": subject, "body": body, "status": "about_to_send"}).encode(),
        headers={"Authorization": "Token " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        print("sent, HTTP", r.status)

if __name__ == "__main__":
    main()
