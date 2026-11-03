#!/usr/bin/env python3
"""Amendment language: download -> extract text -> boil down to a small file.

  python amend.py fetch   "26 Regular" [--budget 1500]   # PDFs -> text files (resumable)
  python amend.py distill "26 Regular"                    # text files -> data/amend_<session>.json

fetch   keeps the FULL extracted text in text/<session>/ (big; NOT committed to git, it
        lives in the GitHub Actions cache). Re-running only fetches what's new.
distill reads that text and writes a compact file (the only thing committed): per bill,
        per amendment: kind, file link, date, word count, how many strike/insert
        instructions it has, and the first few "page X, line Y ..." instructions.
Needs: pip install pypdf
"""
import io, json, os, re, sys, time, urllib.request, urllib.error, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
TEXT = os.path.join(HERE, "text")
DATA = os.path.join(HERE, "data")
BASE = "https://www.nmlegis.gov/Sessions/"
FOLDERS = {"Committee_Subs_And_Amendments": "cs", "Floor_Amendments": "fa", "Amendments_In_Context": "ic"}
UA = f"NMBillTracker/2.0 (personal research; https://github.com/{os.environ.get('GITHUB_REPOSITORY', 'local')})"
DELAY = 1.5
ROW = re.compile(r'(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)\s+(&lt;dir&gt;|<dir>|\d+)\s*'
                 r'<A\s+HREF="([^"]+)">([^<]+)</A>', re.I)

_last = 0.0
def get(url):
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
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404, 410):
                return None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            pass
        time.sleep(wait); wait *= 2
    return None

def listing(url):
    raw = get(url)
    out = []
    for d, t, size, href, name in ROW.findall(raw.decode("utf-8", "replace") if raw else ""):
        isdir = size.lower() in ("&lt;dir&gt;", "<dir>")
        full = urllib.parse.urljoin(url, href)
        out.append((isdir, name.strip(), full + ("/" if isdir and not full.endswith("/") else ""), d))
    return out

def walk(url, depth=1):
    for isdir, name, full, d in listing(url):
        if isdir:
            if depth < 3:
                yield from walk(full, depth + 1)
        elif name.lower().endswith(".pdf"):
            yield name, full, d

def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s)

def extract(pdf_bytes):
    from pypdf import PdfReader
    r = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((p.extract_text() or "") for p in r.pages[:60])

def fetch(session, budget):
    sdir = os.path.join(TEXT, safe(session))
    os.makedirs(sdir, exist_ok=True)
    idx_path = os.path.join(sdir, "index.json")
    idx = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    base = BASE + urllib.parse.quote(session) + "/"
    done = 0
    for folder in FOLDERS:
        for name, url, d in walk(base + folder + "/"):
            key = f"{folder}/{name}"
            if key in idx:
                continue
            if done >= budget:
                print(f"budget reached ({budget}); run again to continue", file=sys.stderr)
                json.dump(idx, open(idx_path, "w"), separators=(",", ":"))
                return
            raw = get(url)
            done += 1
            try:
                text = extract(raw) if raw else ""
            except Exception:
                text = ""
            fn = safe(key) + ".txt"
            with open(os.path.join(sdir, fn), "w") as fh:
                fh.write(text)
            idx[key] = {"u": url[len(BASE):], "d": d, "t": fn, "c": len(raw or b"")}
            if done % 50 == 0:
                json.dump(idx, open(idx_path, "w"), separators=(",", ":"))
                print(f"  {done} fetched", file=sys.stderr)
    json.dump(idx, open(idx_path, "w"), separators=(",", ":"))
    print(f"fetched {done} new files; nothing left to fetch", file=sys.stderr)

BILL = re.compile(r"\b(HOUSE|SENATE)\s+(JOINT\s+)?(BILL|MEMORIAL|RESOLUTION)\s+(\d+)", re.I)
BILLS = re.compile(r"\b(HB|SB|HJR|SJR|HJM|SJM|HM|SM|HR|SR)\s*0*(\d+)\b")
INSTR = re.compile(r"(?:on\s+)?page\s+\d+[^.;]{0,40}?line[s]?\s+\d+[^.]{0,220}\.", re.I)

def bill_of(text):
    head = text[:1500]
    m = BILLS.search(head)
    if m:
        return m.group(1) + str(int(m.group(2)))
    m = BILL.search(head)
    if m:
        pre = ("H" if m.group(1).upper() == "HOUSE" else "S") + \
              ({"BILL": "B", "MEMORIAL": "M", "RESOLUTION": "R"}[m.group(3).upper()])
        if m.group(2):
            pre = pre[0] + "J" + pre[1]
        return pre + str(int(m.group(4)))
    return None

def distill(session):
    sdir = os.path.join(TEXT, safe(session))
    idx = json.load(open(os.path.join(sdir, "index.json")))
    out, unmatched = {}, 0
    for key, info in idx.items():
        text = open(os.path.join(sdir, info["t"])).read()
        folder = key.split("/")[0]
        bill = bill_of(text)
        if not bill:
            unmatched += 1
            bill = "?"
        flat = " ".join(text.split())
        rec = {"k": FOLDERS[folder], "f": info["u"], "d": info["d"], "w": len(flat.split()),
               "x": len(re.findall(r"\bstrike\b", flat, re.I)),
               "i": len(re.findall(r"\binsert\b", flat, re.I)),
               "s": [s[:220] for s in INSTR.findall(flat)[:6]]}
        out.setdefault(bill, []).append(rec)
    path = os.path.join(DATA, f"amend_{safe(session)}.json")
    os.makedirs(DATA, exist_ok=True)
    json.dump({"session": session, "unmatched": unmatched, "bills": out}, open(path, "w"), separators=(",", ":"))
    print(f"wrote {path}: {len(idx)} documents, {len(out)} bills, {unmatched} not matched to a bill; "
          f"{os.path.getsize(path):,} bytes", file=sys.stderr)

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["fetch"] and len(a) >= 2:
        fetch(a[1], int(a[a.index("--budget") + 1]) if "--budget" in a else 1500)
    elif a[:1] == ["distill"] and len(a) >= 2:
        distill(a[1])
    else:
        print(__doc__)
