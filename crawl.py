#!/usr/bin/env python3
"""Polite crawler for nmlegis.gov/Sessions.

1. Discovers every session folder (1996 to now) from the /Sessions/ listing.
2. Reads only directory listings to record which documents exist per bill.
3. Slowly collects each bill's title from its introduced PDF (a capped number
   per run, newest sessions first, cached in data/titles.json). Titles are what
   lets the dashboard match bills across years, since bill numbers restart
   every session.

Output: data/tracker.json and data/titles.json
"""
import io, json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone
from urllib.parse import urljoin

BASE = "https://www.nmlegis.gov/Sessions/"
SKIP = {"aspnet_client", "template", "lfcforms", "legislator information",
        "other", "interimcommittees"}
DELAY = 1.0                     # seconds between requests (was 1.5)
MAX_DEPTH = 3
TITLE_BUDGET = int(os.environ.get("TITLE_BUDGET", "5000"))   # PDFs per run
FULL = os.environ.get("FULL") == "1"                         # re-crawl every session
REPO = os.environ.get("GITHUB_REPOSITORY", "local")
UA = f"NMBillTracker/2.0 (personal research; https://github.com/{REPO})"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "tracker.json")
TITLES = os.path.join(HERE, "data", "titles.json")

ROW = re.compile(
    r'(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)\s+(&lt;dir&gt;|<dir>|\d+)\s*'
    r'<A\s+HREF="([^"]+)">([^<]+)</A>', re.I)
SESS = re.compile(r'^(\d\d)\s*(Regular|Special\d*|Extraordinary)$', re.I)
NAME = re.compile(r'^(HB|SB|HJR|SJR|HJM|SJM|HM|SM|HR|SR|HCR|SCR)\s*0*(\d+)', re.I)

_last = 0.0
def get(url):
    """GET bytes with throttle, identifying UA and backoff on 429/5xx."""
    global _last
    wait = 30
    for _ in range(6):
        gap = DELAY - (time.time() - _last)
        if gap > 0:
            time.sleep(gap)
        _last = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404, 410):
                print(f"  HTTP {e.code} for {url}", file=sys.stderr)
                return None
            if e.code in (429, 500, 502, 503, 504):
                print(f"  {e.code} on {url}; backing off {wait}s", file=sys.stderr)
                time.sleep(wait); wait *= 2; continue
            return None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(wait); wait *= 2
    print(f"  giving up on {url}", file=sys.stderr)
    return None

def iso(d, t):
    return datetime.strptime(f"{d} {t.upper().replace(' ', '')}",
                             "%m/%d/%Y %I:%M%p").strftime("%Y-%m-%dT%H:%M")

def listing(url):
    raw = get(url)
    if raw is None:
        return []
    out = []
    for d, t, size, href, text in ROW.findall(raw.decode("utf-8", "replace")):
        isdir = size.lower() in ("&lt;dir&gt;", "<dir>")
        full = urljoin(url, href)
        if isdir and not full.endswith("/"):
            full += "/"
        out.append((isdir, text.strip(), full, iso(d, t), 0 if isdir else int(size)))
    return out

def walk_files(url, depth):
    for isdir, name, full, date, size in listing(url):
        if isdir:
            if depth < MAX_DEPTH:
                yield from walk_files(full, depth + 1)
        else:
            yield name, full, date

def crawl_session(url):
    """-> {"HB32": {"t","n","last","f": {folder: {"c": count, "u": newest url, "d": date}}}}"""
    bills = {}
    for isdir, folder, furl, _, _ in listing(url):
        if not isdir or folder.lower() in SKIP:
            continue
        for fname, full, date in walk_files(furl, 1):
            m = NAME.match(fname)
            if not m:
                continue
            typ, num = m.group(1).upper(), int(m.group(2))
            b = bills.setdefault(typ + str(num), {"t": typ, "n": num, "last": "", "f": {}})
            f = b["f"].setdefault(folder, {"c": 0, "u": "", "d": ""})
            f["c"] += 1
            if date >= f["d"]:
                f["d"] = date
                f["u"] = full[len(BASE):] if full.startswith(BASE) else full
            if date > b["last"]:
                b["last"] = date
    return bills

def load(path, default):
    try:
        with open(path) as fh:
            return json.load(fh)
    except Exception:
        return default

def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(obj, fh, separators=(",", ":"))

def year_of(n):
    return 1900 + n if n >= 90 else 2000 + n

def extract_title(pdf_bytes):
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(pdf_bytes))
    text = " ".join((r.pages[0].extract_text() or "").split())
    if len(text) < 300 and len(r.pages) > 1:
        text += " " + " ".join((r.pages[1].extract_text() or "").split())
    m = re.search(r'(?:AN ACT|A JOINT RESOLUTION|A JOINT MEMORIAL|A MEMORIAL|A RESOLUTION)\s+'
                  r'(.{8,700}?)(?=BE IT|WHEREAS|\bSection 1\b|$)', text)
    t = m.group(1) if m else text[:200]
    t = re.sub(r'(?:(?<=\s)|^)\d{1,2}(?=\s)', ' ', t)  # stray line numbers
    return " ".join(t.split())[:300]

def main():
    prev = load(OUT, {}).get("sessions", {})
    titles = load(TITLES, {})
    rows = [(name, url) for isdir, name, url, _, _ in listing(BASE)
            if isdir and SESS.match(name)]
    if not rows:
        raw = get(BASE)
        print("Could not read the Sessions index; leaving data unchanged.", file=sys.stderr)
        print(f"  index bytes: {None if raw is None else len(raw)}; "
              f"first 300 chars: {None if raw is None else raw[:300]!r}", file=sys.stderr)
        return
    info = {}
    for name, url in rows:
        m = SESS.match(name)
        info[name] = {"url": url, "y": year_of(int(m.group(1))),
                      "k": re.sub(r'\d+$', '', m.group(2)).title()}
    newest = max(i["y"] for i in info.values())
    sessions = {}
    for name in sorted(info, key=lambda n: (-info[n]["y"], n)):
        i = info[name]
        old = prev.get(name)
        old_ok = bool(old) and "y" in old
        if old_ok and not FULL and i["y"] < newest - 1:
            sessions[name] = old          # old sessions rarely change; refresh monthly
            continue
        print(f"Crawling {name}", file=sys.stderr)
        bills = crawl_session(i["url"])
        if not bills:
            if old_ok:
                sessions[name] = old
            continue
        sessions[name] = {"y": i["y"], "k": i["k"], "bills": bills}
    save(OUT, {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "sessions": sessions})

    # Titles: newest sessions first, capped per run.
    done = 0
    for name in sorted(sessions, key=lambda n: (-sessions[n]["y"], n)):
        cache = titles.setdefault(name, {})
        for key, b in sorted(sessions[name]["bills"].items(),
                             key=lambda kv: (kv[1]["t"], kv[1]["n"])):
            if key in cache:
                continue
            if done >= TITLE_BUDGET:
                break
            f = b["f"].get("bills") or b["f"].get("final")
            if not f:
                continue
            data = get(BASE + f["u"])
            done += 1
            try:
                cache[key] = extract_title(data) if data else ""
            except Exception:
                cache[key] = ""
            if done % 50 == 0:
                save(TITLES, titles)
        if done >= TITLE_BUDGET:
            break
    save(TITLES, titles)
    print(f"Titles fetched this run: {done}", file=sys.stderr)

if __name__ == "__main__":
    main()
