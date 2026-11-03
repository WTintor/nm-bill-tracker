#!/usr/bin/env python3
"""Polite crawler for nmlegis.gov/Sessions directory listings.

Only fetches directory listings (a few dozen small HTML pages per session).
It never downloads the PDFs, it just records their names, dates and sizes,
and links to them. Output: data/tracker.json
"""
import json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
from urllib.parse import urljoin, unquote

BASE = "https://www.nmlegis.gov/Sessions/"
# Edit this list. Most recent first. Add "26 Special" etc. if wanted.
SESSIONS = ["26 Regular", "25 Regular"]
# Subfolders worth indexing. "bills" has house/ and senate/ below it.
FOLDERS = ["bills", "final", "firs", "votes", "Committee_Subs_And_Amendments",
           "Floor_Amendments", "Amendments_In_Context", "LESCAnalysis",
           "AgencyAnalysis", "Tabled_Reports", "ExecMessages"]
DELAY = 2.0          # seconds between requests
MAX_DEPTH = 3
# No email needed: identify by the GitHub repo (set automatically in Actions).
REPO = os.environ.get("GITHUB_REPOSITORY", "local")
UA = f"NMBillTracker/1.0 (personal research; https://github.com/{REPO})"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "tracker.json")

ROW = re.compile(
    r'(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)\s+(&lt;dir&gt;|<dir>|\d+)\s*'
    r'<A\s+HREF="([^"]+)">([^<]+)</A>', re.I)
NAME = re.compile(r'^(HB|SB|HJR|SJR|HJM|SJM|HM|SM|HR|SR|HCR|SCR)\s*0*(\d+)', re.I)

_last = 0.0
def get(url):
    """GET with throttle, identifying UA, and exponential backoff on 429/5xx."""
    global _last
    wait = 30
    for attempt in range(6):
        gap = DELAY - (time.time() - _last)
        if gap > 0:
            time.sleep(gap)
        _last = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (429, 500, 502, 503, 504):
                print(f"  {e.code} on {url}; backing off {wait}s", file=sys.stderr)
                time.sleep(wait); wait *= 2; continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(wait); wait *= 2
    print(f"  giving up on {url}", file=sys.stderr)
    return None

def iso(d, t):
    return datetime.strptime(f"{d} {t.upper().replace(' ', '')}", "%m/%d/%Y %I:%M%p").strftime("%Y-%m-%dT%H:%M")

def walk(url, depth=0):
    html = get(url)
    if html is None:
        return
    for d, t, size, href, text in ROW.findall(html):
        full = urljoin(url, href)
        if size.lower() in ("&lt;dir&gt;", "<dir>"):
            if depth < MAX_DEPTH:
                yield from walk(full if full.endswith("/") else full + "/", depth + 1)
        else:
            yield {"name": text.strip(), "url": full, "date": iso(d, t), "size": int(size)}

def main():
    prev = {}
    if os.path.exists(OUT):
        try: prev = json.load(open(OUT))
        except Exception: pass
    out = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "sessions": {}}
    for s in SESSIONS:
        print(f"Session {s}", file=sys.stderr)
        bills, other = {}, []
        for folder in FOLDERS:
            url = f"{BASE}{s.replace(' ', '%20')}/{folder}/"
            for f in walk(url):
                f["folder"] = folder
                m = NAME.match(f["name"])
                if not m:
                    other.append(f); continue
                key = m.group(1).upper() + str(int(m.group(2)))
                b = bills.setdefault(key, {"type": m.group(1).upper(), "num": int(m.group(2)), "files": []})
                b["files"].append(f)
        for b in bills.values():
            b["last"] = max(f["date"] for f in b["files"])
            b["folders"] = sorted({f["folder"] for f in b["files"]})
        out["sessions"][s] = {"bills": bills, "unmatched": len(other)}
        # If a crawl came back empty (site down), keep the previous data.
        if not bills and s in prev.get("sessions", {}):
            out["sessions"][s] = prev["sessions"][s]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), separators=(",", ":"))
    print("Wrote", OUT, file=sys.stderr)

if __name__ == "__main__":
    main()
