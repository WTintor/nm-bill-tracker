#!/usr/bin/env python3
"""Version comparison: how a bill changed between introduction and its latest text.

  python versions.py "26 Regular" [--budget 300]

For each House/Senate bill that has BOTH an introduced PDF and a latest-text ("final") PDF, this
downloads the two, compares them word by word, and writes data/versions_<session>.json:
  {"HB2": {"iw": 812, "fw": 2310, "add": 1650, "rem": 90, "sim": 0.31, "sn": [["+","new wording..."],["-","removed wording..."]], "seen": "<last>"}}
Only that small summary is committed; the PDFs are not kept. Resumable: bills already compared are skipped
unless the bill has new activity. Polite: one request per 1.5 s (shared with amend.py).
Needs: pip install pypdf
"""
import difflib, io, json, os, re, sys
from amend import get, BASE

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

def pdf_text(raw):
    from pypdf import PdfReader
    pages = [(p.extract_text() or "") for p in PdfReader(io.BytesIO(raw)).pages[:80]]
    lines = []
    for l in "\n".join(pages).splitlines():
        l = re.sub(r"^\s*\d{1,2}\s+", "", l.strip())          # margin line numbers (only at the start of a line)
        if l and not re.fullmatch(r"\d{1,3}", l) and not re.match(r"^\.?\d{5,}", l):
            lines.append(l)
    t = " ".join(" ".join(lines).split())
    k = t.find("BE IT ENACTED")
    return t[k:] if k >= 0 else t        # compare the operative text, not the cover/title block

def compare(a, b):
    A, B = a.split(), b.split()
    sm = difflib.SequenceMatcher(None, A, B, autojunk=False)
    add = rem = 0; chunks = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        rem += i2 - i1; add += j2 - j1
        if op in ("delete", "replace") and i2 > i1:
            chunks.append((i2 - i1, "-", " ".join(A[i1:i2])))
        if op in ("insert", "replace") and j2 > j1:
            chunks.append((j2 - j1, "+", " ".join(B[j1:j2])))
    chunks.sort(key=lambda c: -c[0])
    sn = [[k, (t if len(t) <= 240 else t[:240].rsplit(" ", 1)[0] + " …")] for _, k, t in chunks[:6]]
    return {"iw": len(A), "fw": len(B), "add": add, "rem": rem, "sim": round(sm.ratio(), 2), "sn": sn}

def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    session = args[0]
    budget = int(args[args.index("--budget") + 1]) if "--budget" in args else 300
    tr = json.load(open(os.path.join(DATA, "tracker.json")))["sessions"].get(session)
    if not tr:
        sys.exit("unknown session")
    path = os.path.join(DATA, "versions_%s.json" % session.replace(" ", "_"))
    out = json.load(open(path)) if os.path.exists(path) else {}
    todo = [k for k, b in sorted(tr["bills"].items()) if b["t"] in ("HB", "SB") and b["f"].get("final")
            and b["f"].get("bills", {}).get("i") and out.get(k, {}).get("seen") != b["last"]]
    print(f"{session}: {len(todo)} bills to compare (budget {budget})", file=sys.stderr)
    done = 0
    for k in todo[:budget]:
        b = tr["bills"][k]
        ra, rb = get(BASE + b["f"]["bills"]["i"]), get(BASE + b["f"]["final"]["u"])
        if not ra or not rb:
            out[k] = {"missing": True, "seen": b["last"]}; continue
        try:
            res = compare(pdf_text(ra), pdf_text(rb))
        except Exception as e:
            print(f"  {k}: {e}", file=sys.stderr); out[k] = {"missing": True, "seen": b["last"]}; continue
        res["seen"] = b["last"]; out[k] = res; done += 1
        if done % 25 == 0:
            json.dump(out, open(path, "w"), separators=(",", ":"))
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print(f"{session}: compared {done}, {max(0, len(todo) - budget)} left", file=sys.stderr)

if __name__ == "__main__":
    main()
