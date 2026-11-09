#!/usr/bin/env python3
"""Committee hearing schedules -> data/schedule.json

  python schedules.py [--year 2026] [--budget 120]

The legislature posts each day's committee schedule as a PDF in https://www.nmlegis.gov/Agendas/Standing/
(for example sSched021425.pdf = Senate schedule for Feb 14, 2025; MMDDYY in the name). This lists that folder,
downloads the schedules for the year that are new since the last run, and keeps a small summary:

  {"generated": "...", "year": 2026, "files": {"sSched021425.pdf": "<last modified>"},
   "hearings": [{"d": "2026-02-14", "ch": "S", "c": "FINANCE COMMITTEE", "chair": "George Munoz", "t": "9:30 am",
                 "room": "322", "tent": false, "src": "Agendas/Standing/sSched021425.pdf",
                 "bills": [{"k": "SB23", "t": "OIL & GAS ROYALTY RATE CHANGES", "sp": "MUNOZ/STEFANICS", "cs": false, "a": false}]}]}

House schedules are assumed to follow the same pattern (hSched...). The script saves anything it cannot read
under data/probe/ so the pattern can be corrected. Polite: shares amend.py's throttled, host-restricted downloader. Needs pypdf.
There is no folder listing on the site, so file names are built from dates and missing days are simply skipped.
"""
import io, json, os, re, sys, datetime
from amend import get

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
PROBE = os.path.join(DATA, "probe")
OUT = os.path.join(DATA, "schedule.json")
SITE = "https://www.nmlegis.gov"
FOLDER = SITE + "/Agendas/Standing/"
NAME = re.compile(r"^([hs])sched(\d{2})(\d{2})(\d{2})\w*\.pdf$", re.I)

DATE = re.compile(r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})")
TIME = re.compile(r"(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?|call of the chair|after (?:the )?floor session|\d+ minutes after floor session)", re.I)
ROOM = re.compile(r"Room\s+(\w+)", re.I)
CHAIR = re.compile(r"^(?P<c>[A-Z][A-Z ,&'’\-]+?COMMITTEE(?: ON [A-Z ,&]+)?)\s*[-–—,]\s*(?:Senator|Representative|Sen\.|Rep\.)\s+(?P<n>.+?)(?:,\s*Chair.*)?$")
CHAIR2 = re.compile(r"^(?P<c>[A-Z][A-Z ,&'’\-]+?COMMITTEE)\s*$")
BILL = re.compile(r"^(?P<cs>\*?\s*CS/\s*)?(?P<star>\*\s*)?(?P<t>HB|SB|HJR|SJR|HJM|SJM|HM|SM|HR|SR)\s*(?P<n>\d+)\s*(?P<a>/\s*\w+)?\s+(?P<title>.+?)(?:\s+\((?P<sp>[^)]*)\))?\s*$")
MONTHS = {m: i for i, m in enumerate(["January","February","March","April","May","June","July","August","September","October","November","December"], 1)}

def pdf_lines(raw):
    from pypdf import PdfReader
    out = []
    for p in PdfReader(io.BytesIO(raw)).pages:
        out += [" ".join(l.split()) for l in (p.extract_text() or "").splitlines()]
    return [l for l in out if l]

HEAD = re.compile(r"([A-Z][A-Z ,&'’\-]*?COMMITTEE(?: ON [A-Z ,&]+?)?)\s*[-–—]\s*(?:(?:SENATOR|REPRESENTATIVE|SEN\.|REP\.)\s+)?([^\n,]{3,60}?),?\s*CHAIR", re.I)
DAY = re.compile(r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})")
CLOCK = re.compile(r"(\d{1,2}(?::\d{2})?\s*[AP]\s?\.?M\.?)", re.I)
BILLX = re.compile(r"(?<![A-Za-z@/])(CS/\s*)?(HB|SB|HJR|SJR|HJM|SJM|HM|SM|HR|SR)\s*0*(\d{1,4})(\s*/\s*[a-z]+)?(?![\w@])")
STOPS = re.compile(r"\s\((?=[A-Z][A-Za-z .'’\-/]*\))|\n|For public comment|Any amendments|Zoom|Webinar|Join from|\bPage \d")

def clean_time(t):
    return re.sub(r"\s*([AP])\s?\.?M\.?", lambda m: " " + m.group(1).upper() + "M", t.strip(), flags=re.I).strip()

def parse(lines, ch, src):
    """One schedule PDF -> list of hearings. Works on the whole text rather than line by line, because the House
    and Senate PDFs lay rows out differently (sponsors before or after the bill, rows run together)."""
    text = "\n".join(lines)
    heads = [(m.start(), m.end(), re.sub(r"^(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+", "", re.sub(r"\s+", " ", m.group(1)).strip().upper()), m.group(2).strip().title()) for m in HEAD.finditer(text)]
    days = [(m.start(), m.end(), m) for m in DAY.finditer(text)]
    marks = sorted([(h[0], "h", h) for h in heads] + [(d[0], "d", d) for d in days])
    hearings, committee, chair, cur = [], "", "", None
    for i, (pos, kind, item) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        if kind == "h":
            committee, chair, cur = item[2], item[3], None
            continue
        if not committee:
            continue
        m = item[2]
        try:
            d = datetime.date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))).isoformat()
        except (KeyError, ValueError):
            continue
        seg = text[item[1]:end]
        lead = seg[:160]
        tm = CLOCK.search(lead) or re.search(r"call of the chair|after (?:the )?floor session|\d+ minutes after floor session", lead, re.I)
        rm = ROOM.search(lead)
        cur = {"d": d, "ch": ch, "c": committee, "chair": chair, "t": clean_time(tm.group(1) if tm and tm.groups() else tm.group(0)) if tm else "",
               "room": rm.group(1) if rm else "", "tent": bool(re.search(r"tentative", seg, re.I)), "src": src, "bills": []}
        if re.search(r"will not be meeting|cancel", lead, re.I):
            continue
        seen = set()
        for bm in BILLX.finditer(seg):
            key = bm.group(2).upper() + str(int(bm.group(3)))
            if key in seen:
                continue
            seen.add(key)
            rest = seg[bm.end():bm.end() + 200]
            stop = STOPS.search(rest)
            title = " ".join((rest[:stop.start()] if stop else rest).split())[:140]
            sp = re.match(r"\s*\(([A-Z][A-Za-z .'’\-/]*)\)", rest[stop.start():]) if stop and rest[stop.start():].lstrip().startswith("(") else None
            cur["bills"].append({"k": key, "t": title, "sp": sp.group(1).strip() if (sp and ch == "H") else "", "cs": bool(bm.group(1)), "a": bool(bm.group(4))})
        hearings.append(cur)
    return [h for h in hearings if h["bills"] or h["t"]]

def candidates(year, today):
    """The site gives no folder listing, so build the file names from dates: sSched<MMDDYY>.pdf (Senate), hSched<MMDDYY>.pdf (House)."""
    days = set()
    d = datetime.date(year, 1, 1)
    while d <= datetime.date(year, 4, 15):            # a regular session always falls in here
        days.add(d); d += datetime.timedelta(days=1)
    for off in range(-7, 15):                          # and a window around today, for special sessions
        days.add(today + datetime.timedelta(days=off))
    return sorted(x for x in days if x.year == year)

def main():
    a = sys.argv[1:]
    today = datetime.date.today()
    year = int(a[a.index("--year") + 1]) if "--year" in a else today.year
    budget = int(a[a.index("--budget") + 1]) if "--budget" in a else 160
    doc = json.load(open(OUT)) if os.path.exists(OUT) else {}
    if doc.get("year") != year:
        doc = {"year": year, "files": {}, "hearings": []}
    todo = []
    for day in candidates(year, today):
        for ch in ("S", "H"):
            n = "%sSched%s.pdf" % (ch.lower(), day.strftime("%m%d%y"))
            seen = doc["files"].get(n)
            age = (today - day).days
            # settled: a file we already read that is more than 2 days old, or a gap more than 7 days in the past
            if seen == "ok" and age > 2: continue
            if seen == "none" and age > 7: continue
            todo.append((n, ch, day))
    # nearest to today first, so a tight budget still covers the days that matter
    todo.sort(key=lambda t: abs((t[2] - today).days))
    print("schedules: %d files to check for %d" % (len(todo), year), file=sys.stderr)
    for n, ch, day in todo[:budget]:
        raw = get(FOLDER + n)
        if not raw or raw[:4] != b"%PDF":
            doc["files"][n] = "none"; continue
        src = "Agendas/Standing/" + n
        try:
            lines = pdf_lines(raw); hs = parse(lines, ch, src)
        except Exception as e:
            print("  %s: %s" % (n, e), file=sys.stderr); hs, lines = [], []
        if not hs:
            os.makedirs(PROBE, exist_ok=True)
            open(os.path.join(PROBE, "sched_" + n + ".txt"), "w").write("\n".join(lines)[:20000])
        for h in hs:
            if not h["d"]: h["d"] = day.isoformat()
        doc["hearings"] = [h for h in doc["hearings"] if h["src"] != src] + hs
        doc["files"][n] = "ok"
    doc["hearings"].sort(key=lambda h: (h["d"], h["ch"], h["c"], h["t"]))
    doc["generated"] = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    json.dump(doc, open(OUT, "w"), separators=(",", ":"))
    print("schedules: %d hearings saved" % len(doc["hearings"]), file=sys.stderr)

if __name__ == "__main__":
    main()
