#!/usr/bin/env python3
"""Adds richer bill metadata (title, sponsors, current location, action log)
from nmlegis.gov bill pages, and probes the LegInfo bulk download.

  python enrich.py probe                  # run this FIRST (one-time look at the real data)
  python enrich.py status all             # OFFICIAL STATUS for every regular session (one request each).
                                          # Run this early: it is cheap and powers the dashboard's status view.
  python enrich.py status "26 Regular"    # same, for one session
  python enrich.py pages "26 Regular"     # scrape bill pages for one session
  python enrich.py pages "26 Regular" --budget 200
  python enrich.py all                    # one-time backfill of EVERY regular session, newest first.
                                          # ~8,000 pages per run (about 3.5 hours at 1.5 s each); it
                                          # resumes where it left off, so run it until it reports
                                          # "0 bills remaining" (about 4 runs for the whole archive)

probe  : downloads LegInfo<YY>.zip (one file, ~4 MB), lists what is inside, and saves a
         short preview of each file plus the raw text of 3 sample bill pages to
         data/probe/. Read data/probe/report.txt to see what the data really looks like.
pages  : visits one page per bill (HB/SB), politely (1.5 s apart, cached, resumable),
         and writes data/meta_<session>.json. Needs: pip install beautifulsoup4

Bill-page parsing is label-driven (it looks for the words "Sponsors", "Current Location",
"Actions" in the page text), because I could not see the raw HTML when writing it.
If a page does not parse, the script saves its text under data/probe/ so it can be fixed.
"""
import io, json, os, re, sys, time, zipfile, urllib.request, urllib.error, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
PROBE = os.path.join(DATA, "probe")
SITE = "https://www.nmlegis.gov"
REPO = os.environ.get("GITHUB_REPOSITORY", "local")
UA = f"NMBillTracker/2.0 (personal research; https://github.com/{REPO})"
DELAY = 1.5
LEGTYPE = {"HB": ("H", "B"), "SB": ("S", "B"), "HJR": ("H", "JR"), "SJR": ("S", "JR"),
           "HJM": ("H", "JM"), "SJM": ("S", "JM"), "HM": ("H", "M"), "SM": ("S", "M"),
           "HR": ("H", "R"), "SR": ("S", "R")}

_last = 0.0
def get(url, binary=False):
    global _last
    wait = 30
    for _ in range(5):
        gap = DELAY - (time.time() - _last)
        if gap > 0:
            time.sleep(gap)
        _last = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                raw = r.read()
                return raw if binary else raw.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (403, 404, 410):
                print(f"  HTTP {e.code}: {url}", file=sys.stderr)
                return None
            print(f"  HTTP {e.code}; backing off {wait}s", file=sys.stderr)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            print(f"  {e}; backing off {wait}s", file=sys.stderr)
        time.sleep(wait); wait *= 2
    return None

def bill_url(session, key):
    m = re.match(r"([A-Z]+)(\d+)$", key)
    if not m or m.group(1) not in LEGTYPE:
        return None
    ch, lt = LEGTYPE[m.group(1)]
    yy = session.split()[0]
    q = urllib.parse.urlencode({"chamber": ch, "legType": lt, "legNo": m.group(2), "year": yy})
    return f"{SITE}/Legislation/Legislation?{q}"

# ---------------------------------------------------------------- probe
def looks_text(b):
    return b[:4000].count(b"\x00") == 0 and sum(c < 9 or 13 < c < 32 for c in b[:4000]) < 20

def magic(b):
    if b[:4] == b"PK\x03\x04": return "zip/xlsx/docx"
    if b[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1": return "OLE (xls/doc)"
    if b[:4] == b"\x00\x01\x00\x00" and b[4:8] == b"Stan": return "Access .mdb"
    if b[:1] in (b"\x03", b"\x83", b"\xf5"): return "maybe dBase .dbf"
    if b[:5] == b"SQLit": return "SQLite"
    return "binary" if not looks_text(b) else "text"

def probe():
    os.makedirs(PROBE, exist_ok=True)
    out = []
    for yy, sess in (("26", "26%20Regular"),):
        url = f"{SITE}/Sessions/{sess}/other/LegInfo{yy}.zip"
        out.append(f"== {url}")
        raw = get(url, binary=True)
        if not raw:
            out.append("  could not download"); continue
        out.append(f"  downloaded {len(raw):,} bytes")
        try:
            z = zipfile.ZipFile(io.BytesIO(raw))
        except Exception as e:
            out.append(f"  not a readable zip: {e}"); continue
        for info in z.infolist():
            data = z.read(info)
            kind = magic(data)
            out.append(f"  - {info.filename}  {info.file_size:,} bytes  [{kind}]")
            if kind == "text":
                txt = data[:700].decode("utf-8", "replace")
                lines = txt.splitlines()[:8]
                out.append("      first lines: " + " | ".join(l[:160] for l in lines))
            else:
                out.append(f"      first bytes: {data[:48]!r}")
    for key in ("HB2", "SB1", "HM1"):
        url = bill_url("26 Regular", key)
        html = get(url)
        if not html:
            out.append(f"== bill page {key}: could not download"); continue
        path = os.path.join(PROBE, f"page_{key}.html")
        with open(path, "w") as fh:
            fh.write(html[:250000])
        text = page_text(html)
        with open(os.path.join(PROBE, f"page_{key}.txt"), "w") as fh:
            fh.write(text[:20000])
        out.append(f"== bill page {key}: {len(html):,} bytes html, saved page_{key}.html/.txt")
    with open(os.path.join(PROBE, "report.txt"), "w") as fh:
        fh.write("\n".join(out) + "\n")
    print("\n".join(out))

# ---------------------------------------------------------------- pages
def page_text(html):
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        sys.exit("pip install beautifulsoup4")
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript"]):
        t.decompose()
    lines = [" ".join(l.split()) for l in soup.get_text("\n").splitlines()]
    return "\n".join(l for l in lines if l)

DATE = re.compile(r"^\d{1,2}/\d{1,2}/\d{2,4}$")
LABELS = {"title", "sponsors", "sponsor", "current location", "actions", "votes", "analysis",
          "committee reports", "floor amendments", "gov. vetoes", "text", "charts",
          "committee substitutions & amendments"}

def parse_page(text):
    """Label-driven parse of the page's text. Returns a dict; missing fields are omitted."""
    lines = text.splitlines()
    low = [l.lower().rstrip(":") for l in lines]
    res = {}

    def after(label, n=1):
        for i, l in enumerate(low):
            if l == label and i + n < len(lines):
                return lines[i + n]
        return None

    def block(label):
        for i, l in enumerate(low):
            if l == label:
                got = []
                for j in range(i + 1, min(i + 40, len(lines))):
                    if low[j] in LABELS or re.match(r"^(sponsors|votes|analysis|actions)\s*\(\d+\)", low[j]):
                        break
                    got.append(lines[j])
                return got
        return []

    t = after("title")
    if t: res["title"] = t
    loc = after("current location")
    if loc: res["location"] = loc
    sp = block("sponsors") or block("sponsor")
    if sp: res["sponsors"] = sp[:12]
    # action log: a date line followed by text lines until the next date
    start = next((i for i, l in enumerate(low) if l == "actions" or l.startswith("actions (")), None)
    acts = []
    if start is not None:
        i = start + 1
        while i < len(lines):
            if DATE.match(lines[i]):
                d, j, bits = lines[i], i + 1, []
                while j < len(lines) and not DATE.match(lines[j]) and low[j] not in LABELS:
                    bits.append(lines[j]); j += 1
                acts.append({"date": d, "text": " ".join(bits)[:300]})
                i = j
            else:
                i += 1
    if acts: res["actions"] = acts
    return res

# ---------------------------------------------------------------- official status (list page)
ID = re.compile(r"^(HB|SB|HJR|SJR|HJM|SJM|HM|SM|HR|SR)\s*0*(\d+)$", re.I)

def parse_list(html):
    """Rows of the Legislation_List page -> {"HB2": {"title","sponsors","status"}}."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        sys.exit("pip install beautifulsoup4")
    soup = BeautifulSoup(html, "html.parser")
    out = {}
    for tr in soup.find_all("tr"):
        cells = [" ".join(td.get_text(" ").split()) for td in tr.find_all(["td", "th"])]
        if len(cells) < 4:
            continue
        m = ID.match(cells[0])
        if not m:
            continue
        out[m.group(1).upper() + str(int(m.group(2)))] = {
            "title": cells[1], "sponsors": [s.strip() for s in cells[2].split(",") if s.strip()], "status": cells[3]}
    return out

def list_urls(session, year):
    kind = "Regular" if "Regular" in session else session.split(" ", 1)[1]
    return [f"{SITE}/Legislation/Legislation_List?Session={urllib.parse.quote(kind)}&Year={year}",
            f"{SITE}/Legislation/Legislation_List?year={year}&session={urllib.parse.quote(kind)}"]

def status(session, year):
    """One request per session: the list page carries title, sponsors and the status sentence
    (e.g. 'Passed House 54-2 and Senate 39-0; signed by Governor ... as Ch. 1') for every bill."""
    os.makedirs(PROBE, exist_ok=True)
    got = {}
    for url in list_urls(session, year):
        html = get(url)
        got = parse_list(html) if html else {}
        print(f"  {url}: {len(got)} rows", file=sys.stderr)
        if got:
            break
    if not got:
        if html:
            with open(os.path.join(PROBE, f"list_{session.replace(' ', '_')}.html"), "w") as fh:
                fh.write(html[:250000])
        return 0
    with open(os.path.join(DATA, f"status_{session.replace(' ', '_')}.json"), "w") as fh:
        json.dump(got, fh, separators=(",", ":"))
    return len(got)

def status_all():
    """Every session on the server, regular AND special (special-session list pages are unverified)."""
    tracker = json.load(open(os.path.join(DATA, "tracker.json")))
    s = tracker["sessions"]
    for session in sorted(s, key=lambda k: (-s[k]["y"], k)):
        n = status(session, tracker["sessions"][session]["y"])
        print(f"{session}: {n} bills with status", file=sys.stderr)

def meta_path(session):
    return os.path.join(DATA, f"meta_{session.replace(' ', '_')}.json")

def todo_for(session, bills, meta):
    return [k for k, b in sorted(bills.items(), key=lambda kv: (kv[1]["t"], kv[1]["n"]))
            if b["t"] in ("HB", "SB") and (k not in meta or bills[k]["last"] > meta[k].get("seen", ""))]

def pages(session, budget):
    """Fetch up to `budget` bill pages for one session. Returns how many were fetched."""
    tracker = json.load(open(os.path.join(DATA, "tracker.json")))
    if session not in tracker["sessions"]:
        sys.exit(f"session {session!r} not in tracker.json")
    bills = tracker["sessions"][session]["bills"]
    out_path = meta_path(session)
    meta = json.load(open(out_path)) if os.path.exists(out_path) else {}
    os.makedirs(PROBE, exist_ok=True)
    todo = todo_for(session, bills, meta)
    print(f"{session}: {len(todo)} bills to fetch (budget {budget})", file=sys.stderr)
    bad = done = 0
    for key in todo[:budget]:
        html = get(bill_url(session, key))
        done += 1
        if not html:
            meta[key] = {"missing": True, "seen": bills[key]["last"]}   # don't retry forever
            continue
        info = parse_page(page_text(html))
        info["seen"] = bills[key]["last"]
        meta[key] = info
        if "location" not in info and "actions" not in info and bad < 5:
            bad += 1
            with open(os.path.join(PROBE, f"unparsed_{session.replace(' ', '_')}_{key}.txt"), "w") as fh:
                fh.write(page_text(html)[:20000])
        if done % 50 == 0:
            json.dump(meta, open(out_path, "w"), separators=(",", ":"))
            print(f"  {done}/{min(budget, len(todo))}", file=sys.stderr)
    if meta or done:
        json.dump(meta, open(out_path, "w"), separators=(",", ":"))
    ok = sum(1 for v in meta.values() if "location" in v or "actions" in v)
    print(f"  {session}: {len(meta)} bills saved, {ok} parsed", file=sys.stderr)
    return done

def sessions_newest_first(tracker):
    """Regular sessions only: special sessions may need a different page URL (unverified)."""
    s = tracker["sessions"]
    return sorted((k for k in s if s[k]["k"] == "Regular"), key=lambda k: -s[k]["y"])

def backfill(budget):
    """One-time backfill of every earlier year. Resumable: run it again until it says 0 remaining."""
    tracker = json.load(open(os.path.join(DATA, "tracker.json")))
    left = budget
    for session in sessions_newest_first(tracker):
        if left <= 0:
            break
        left -= pages(session, left)
    remaining = 0
    for session in sessions_newest_first(tracker):
        p = meta_path(session)
        meta = json.load(open(p)) if os.path.exists(p) else {}
        remaining += len(todo_for(session, tracker["sessions"][session]["bills"], meta))
    print(f"BACKFILL: fetched {budget - left} pages this run; {remaining} bills remaining", file=sys.stderr)

if __name__ == "__main__":
    a = sys.argv[1:]
    num = lambda flag, d: int(a[a.index(flag) + 1]) if flag in a else d
    if a[:1] == ["probe"]:
        probe()
    elif a[:1] == ["status"]:
        if len(a) >= 2 and a[1] != "all":
            tr = json.load(open(os.path.join(DATA, "tracker.json")))
            print(status(a[1], tr["sessions"][a[1]]["y"]), "bills with status")
        else:
            status_all()
    elif a[:1] == ["all"]:
        backfill(num("--budget", 8000))
    elif a[:1] == ["pages"] and len(a) >= 2:
        pages(a[1], num("--budget", 600))
    else:
        print(__doc__)
