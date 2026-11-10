#!/usr/bin/env python3
"""Current legislators (name, chamber, district, party) -> data/legislators.json.

Source: https://www.nmlegis.gov/Members/Legislator_List?T=H (House) and ?T=S (Senate). Rows look like
'Heather Berghmans - (D) District 15' with a link containing SponCode=SBERG. The site only lists the sitting members;
for earlier years the app uses the sponsor names printed on that year's own bill list, which are by definition the
legislators of that year."""
import json, os, re, sys, datetime
from enrich import get, DATA

def parse(html, chamber):
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        sys.exit("pip install beautifulsoup4")
    out = []
    for a in BeautifulSoup(html, "html.parser").find_all("a", href=re.compile(r"SponCode=", re.I)):
        code = re.search(r"SponCode=([A-Za-z]+)", a["href"]).group(1).strip().upper()
        cell = a.find_parent(["tr", "li", "div"])
        txt = " ".join((cell or a).get_text(" ").split())
        m = re.match(r"(.+?)\s+-\s+\((\w)\)\s+District:?\s*(\d+)", txt)
        if m:
            out.append({"n": m.group(1).strip(), "c": chamber, "p": m.group(2), "d": int(m.group(3)), "code": code})
    return out

def main():
    people = []
    for ch, t in (("H", "R"), ("S", "S")):   # the site calls the House list T=R
        html = get("https://www.nmlegis.gov/Members/Legislator_List?T=" + t)
        got = parse(html, ch) if html else []
        print("roster %s: %d" % (ch, len(got)), file=sys.stderr)
        people += got
    if len(people) < 80:        # 112 sitting members; a partial read must not overwrite a good file
        sys.exit("roster looked incomplete (%d); keeping the old file" % len(people))
    json.dump({"generated": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "people": people},
              open(os.path.join(DATA, "legislators.json"), "w"), separators=(",", ":"), ensure_ascii=False)

if __name__ == "__main__":
    main()
