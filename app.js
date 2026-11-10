if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (e) { document.documentElement.style.display = 'none'; } }
const BASE = "https://www.nmlegis.gov/Sessions/";
const SUBSCRIBE_USER = "";   // your Buttondown username; leave empty to hide the email sign-up box
const KIND = {
  bills:["Introduced","turq"], firs:["Fiscal impact report","gold"], LESCAnalysis:["LESC analysis","gold"], AgencyAnalysis:["Agency analysis","gold"],
  Committee_Subs_And_Amendments:["Committee sub / amendment","terra"], Floor_Amendments:["Floor amendment","terra"], Amendments_In_Context:["Amendment in context","terra"],
  votes:["Vote record","sky"], final:["Latest text","red"], ExecMessages:["Governor's message","red"], Tabled_Reports:["Tabled","mute"], capitaloutlays:["Capital outlay","mute"]
};
const ORDER = Object.keys(KIND);
const GROUPS = { new:["New","turq",["bills"]], analysis:["Analyses","gold",["firs","LESCAnalysis","AgencyAnalysis"]],
  amend:["Amendments","terra",["Committee_Subs_And_Amendments","Floor_Amendments","Amendments_In_Context"]], votes:["Votes","sky",["votes"]], final:["Gov. & text","red",["final","ExecMessages"]] };
const KG = {}; for (const [g, v] of Object.entries(GROUPS)) for (const k of v[2]) KG[k] = g;
const STAGES = [["bills","Introduced only","turq"],["firs","Fiscal report posted","gold"],["Committee_Subs_And_Amendments","Committee action","terra"],
                ["Floor_Amendments","Floor amendments","terra"],["votes","Vote record","sky"],["final","Latest text posted","red"]];
const TYPES = ["HB","SB","HJR","SJR","HJM","SJM","HM","SM","HR","SR"];
const MEMORIAL = new Set(["HM","SM","HJM","SJM","HR","SR"]);
const LEGTYPE = {HB:["H","B"],SB:["S","B"],HJR:["H","JR"],SJR:["S","JR"],HJM:["H","JM"],SJM:["S","JM"],HM:["H","M"],SM:["S","M"],HR:["H","R"],SR:["S","R"]};
const TOPICS = [
  ["Cannabis, alcohol & gaming", /cannabis|marijuana|liquor|alcohol|tobacco|vaping|e-cigarette|gambling|gaming|casino|\bracing/g],
  ["Water", /\bwater|groundwater|aquifer|acequia|irrigat|\bstreams?\b|\brivers?\b|drought|\bdams?\b|interstate stream|wastewater/g],
  ["Agriculture", /agricultur|livestock|\bfarm|\branch|\bhemp|dairy|\bcattle|\bcrops?\b|\bbrand inspection/g],
  ["Tribal, culture & veterans", /\bindian|tribal|\btribes?\b|pueblo|navajo|apache|cultural|museum|historic|\blanguages?\b|veteran|military|national guard|land grant/g],
  ["Transportation", /highway|transportation|motor vehicle|\broads?\b|\bdrivers?\b|driving|\bvehicle|aviation|airport|railroad|\brail\b|transit|\btraffic|spaceport/g],
  ["Energy & environment", /energy|electric|solar|renewable|utility|utilities|\boil\b|natural gas|methane|\bmining|emission|climate|environment|air quality|wildlife|\bforest|hydrogen|nuclear|pollution|\bwaste\b|\bpublic regulation commission|\bgame and fish|carbon|\bhunting|\bfishing|\bfish\b/g],
  ["Education", /school|education|student|teacher|universit|college|scholarship|literacy|early childhood|child care|pre-?k|\bcurricul|\bcharter|lottery scholarship/g],
  ["Public safety & courts", /\bcrim|firearm|\bgun|police|law enforcement|correction|prison|juvenile|\bcourts?\b|\bjudges?\b|judicial|sentenc|penalt|domestic violence|\bvictim|offender|detention|public safety|\bsheriff|\bbail\b|\bjustice|probation|parole|\bfelony|\bmisdemeanor|\bdwi\b|identity theft|\bfraud|surveillance|\bimmigra/g],
  ["Elections & government", /election|\bvoter|\bvoting|ballot|campaign|legislat|\bgovernor|state agenc|public employee|procurement|ethics|public records?|open meetings|lobby|secretary of state|redistrict|\bstate (personnel|auditor|treasurer)|\bcommission|state government|\bstate (board|department)|constitution/g],
  ["Housing & local government", /housing|landlord|tenant|zoning|municipal|\bcount(y|ies)\b|local government|homeless|mortgage|\brent\b|\bcity\b|\bcities\b|\bvillage|\bannex|\bmanufactured home|eviction|land use/g],
  ["Taxes & revenue", /\btax|gross receipts|revenue|exemption|deduction|rebate|tax credit|\bfees?\b|\bsurcharge/g],
  ["Health & human services", /health|medical|medicaid|medicare|hospital|behavioral|\bmental|insurance|opioid|pharmac|\bnurs|physician|disabilit|\bseniors?\b|\baging\b|nutrition|\bfood\b|human services|\bchildren|\bfoster|\bcps\b|abortion|reproductive|\bdrug|\bsubstance|overdose|\bdental|\bcancer|\bautism|\bpatient|\bcare\b|\bhomecare|\bcaregiver|\bhealthcare/g],
  ["Economy & labor", /business|worker|\bwages?\b|employ|\blabor|economic development|tourism|\bfilm\b|broadband|workforce|consumer|banking|\bfinancial (institution|service)|\bbank|\bloans?\b|\bcredit unions?\b|\bunemployment|professional licens|\boccupational|\bcontractor|\bcompetition|\btrade\b|\bsmall business|\bstartup|\bcommerce/g],
  ["Budget & appropriations", /general appropriation|\bfeed bill|supplemental|capital outlay|severance tax bond|\bbonds?\b|bonding|\bbudget|state agency (funding|operating)/g],
];
const TAX_RULE = /(gross receipts|income|property|excise|severance|compensating) tax|tax (credit|rebate|deduction|exemption)/;
const PLACEHOLDER = "Placeholder title";
const TOPIC_NAMES = TOPICS.map(t => t[0]).concat(["Memorials & honors", PLACEHOLDER, "Other"]);
// A title read from the wrong place (committee-report boilerplate, a stray fragment, a blank) is not a title.
const BAD_TITLE = /(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\w+-\w+|\w+) legislature,? (first|second|regular|special|extraordinary)|\bmr\.\s*(president|speaker)|to whom (has been )?referred|has had it under (consideration|con)|\bcommittee substitute for\b|\bdo pass\b|^state of new mexico|^house of representatives\b|^senate (finance|judiciary|rules|education|health|conservation|tax|indian)|^\s*(fiscal impact report|agency analysis|lesc analysis)\b|^[\d\s.,;:/-]*$/i;
const goodTitle = t => { t = (t || "").trim(); return t.length >= 8 && !BAD_TITLE.test(t.slice(0, 160)); };
// Titles that every placeholder ("dummy") bill gets before it is filled in.
const PLACEHOLDER_TITLE = /^\s*(relating to )?(the )?(public (peace|affairs|welfare)(,| and)? ?(health,? )?(safety,? )?(and |& )?(welfare)?|state government|government|public policy|miscellaneous|appropriations?|an appropriation)\.?\s*$|public peace,? health,? safety (and|&) welfare/i;
const STRONG_BUDGET = /general appropriation act|\bfeed bill\b|severance tax bonds?|supplemental appropriation|\bgovernment (reorganization|operations)\b/;

function classifyTitle(shortT, longT, billType) {
  const primary = goodTitle(shortT) ? shortT : goodTitle(longT) ? longT : "";
  if (!primary) return "Awaiting title";
  const t = primary.toLowerCase().replace(/\s+/g, " ").trim();
  if (PLACEHOLDER_TITLE.test(t)) return PLACEHOLDER;
  // NM titles read "RELATING TO <SUBJECT>; <what the bill does>": the first clause is the subject.
  const parts = t.split(";"), subj = parts[0].replace(/^relating to\s+/, ""), rest = parts.slice(1).join(";")
    .replace(/\b(making|providing|authorizing|making an) (an )?appropriations?( and declaring an emergency)?\b/g, " ").replace(/declaring an emergency/g, " ");
  const MEMO = ["HM","SM","HJM","SJM","HR","SR"].includes(billType);
  if (MEMO && /honor|recogniz|congratulat|in memor|celebrat|commemorat|\blife of\b|tribute|proclaim|\b(day|month|week)\b/.test(subj) && !/request|study|task force|\burg/.test(t)) return "Memorials & honors";
  if (STRONG_BUDGET.test(subj)) return "Budget & appropriations";
  let best = null, bestScore = 0;
  for (const [name, re] of TOPICS) {
    const a = (subj.match(re) || []).length, c = (rest.match(re) || []).length;
    let score = Math.min(a, 2) * 3 + Math.min(c, 3);
    if (name === "Taxes & revenue" && TAX_RULE.test(rest + " " + subj)) score += 3;
    if (score > bestScore) { best = name; bestScore = score; }   // ties keep the earlier, more specific topic
  }
  if (best) return best;
  if (/appropriat/.test(t)) return "Budget & appropriations";
  return ["HM","SM","HJM","SJM","HR","SR"].includes(billType) ? "Memorials & honors" : "Other";
}


const PENDING = "Awaiting title";

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"'`]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[c]));
/* Defence in depth: the data files come from a crawler. Drop anything shaped wrongly so odd values can't reach the page. */
function sanitizeData(d) {
  if (!d || typeof d !== "object" || !d.sessions || typeof d.sessions !== "object") throw new Error("bad data");
  for (const [sk, ses] of Object.entries(d.sessions)) {
    if (!/^[\w .-]{1,60}$/.test(sk) || !ses || typeof ses.bills !== "object") { delete d.sessions[sk]; continue; }
    for (const [k, b] of Object.entries(ses.bills)) {
      if (!b || !/^[A-Z]{1,4}$/.test(b.t) || !Number.isInteger(b.n) || b.n < 0 || b.n > 99999 || typeof b.f !== "object" || !b.f || typeof b.last !== "string") delete ses.bills[k];
    }
  }
  return d;
}
const csvCell = v => { v = String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };   // stops spreadsheet formula injection
const SYNCKEYS = new Set(["w", "notes", "big"]);
const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); if (SYNCKEYS.has(k) && window.RT) window.RT.changed(k); } catch {} } };
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const fmtDay = iso => new Date(iso).toLocaleDateString(undefined, {weekday:"short", month:"short", day:"numeric", year:"numeric"});
const fmtD = iso => new Date(iso).toLocaleDateString(undefined, {month:"short", day:"numeric", year:"numeric"});
const fmtT = iso => new Date(iso).toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"});

function zia(size) {
  let s = `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" stroke-width="3.5"/>`;
  for (const a of [0, 90, 180, 270]) {
    s += `<g transform="rotate(${a} 50 50)">`;
    for (const [dx, len] of [[-9,20],[-3,28],[3,28],[9,20]]) s += `<line x1="${50+dx}" y1="32" x2="${50+dx}" y2="${32-len}" stroke="currentColor" stroke-width="3.5"/>`;
    s += "</g>";
  }
  return s + "</svg>";
}
$("#zia").innerHTML = zia(34);
if (ls.get("big", false)) document.body.classList.add("big");
if (SUBSCRIBE_USER) $("#subscribe").innerHTML = `<div class="sub"><b style="color:var(--ink)">Daily bill updates by email</b><br>New bills and status changes, only on days something moved.<form action="https://buttondown.com/api/emails/embed-subscribe/${SUBSCRIBE_USER}" method="post" target="_blank"><input type="email" name="email" placeholder="you@example.com" required autocomplete="email"><button class="btn pri">Subscribe</button></form></div>`;

let D, T = {}, EXTRA = {};
const S = { sg:"", pos:"", person:null, pq:"", dummy:"all", status:null, pipeS:null, tab:"home", cur:null, topic:null, win:30, groups:new Set(), pipe:5, q:"", types:new Set(), stages:new Set(), onlyW:false, all:false, shown:40, metric:"n", evShown:50, cq:"", cm:"", cmlist:"" };
const W = new Set(ls.get("w", []));
const lastSeen = ls.get("seen", null);
const memo = {};

const label = k => D.sessions[k].y + " " + k.replace(/^\d+\s*/, "");
const isReg = k => D.sessions[k].k === "Regular";
const sessList = () => Object.keys(D.sessions).sort((a, b) => D.sessions[b].y - D.sessions[a].y || (isReg(b) - isReg(a)) || a.localeCompare(b));
const longTitle = (sk, key) => { const t = (T[sk] || {})[key] || ""; return goodTitle(t) ? t : ""; };
const shortTitle = (sk, key) => { const t = (((EXTRA[sk] || {}).status || {})[key] || {}).title || ""; return goodTitle(t) ? t : ""; };
const titleOf = (sk, key) => shortTitle(sk, key) || longTitle(sk, key);
const nice = t => { t = (t || "").trim(); if (t && t === t.toUpperCase()) { t = t.toLowerCase().replace(/(^|[.;:]\s+)([a-z])/g, (m, a, c) => a + c.toUpperCase()).replace(/\bnew mexico\b/g, "New Mexico"); t = t.charAt(0).toUpperCase() + t.slice(1); } return t; };
const INTRO = {};
const hasSub = b => !!(b.f.bills && b.f.bills.s);
function dummyOf(sk, key, b) {
  const i = (INTRO[sk] || {})[key];
  if (!i || !(b.t === "HB" || b.t === "SB")) return null;
  if (!(i[0] < 120 || i[1] >= 3)) return null;
  return { words: i[0], blanks: i[1], sub: hasSub(b) };
}
const dummyTag = d => d ? (d.sub ? "Dummy bill → committee substitute" : "Dummy bill (placeholder text)") : "";
const STATUS = [["Signed into law","red"],["Vetoed","terra"],["Passed both chambers","sky"],["Passed one chamber","turq"],["On the floor","gold"],
                ["In committee","mute"],["Died or tabled","mute"],["Pending or other","mute"],["No status loaded","mute"]];
const STC = Object.fromEntries(STATUS);
/* ---------- reading the legislature's status line ---------- */
const COMMS = {HAFC:"House Appropriations & Finance",HCPAC:"House Consumer & Public Affairs",HJC:"House Judiciary",HHHC:"House Health & Human Services",HEC:"House Education",
  HGEIC:"House Government, Elections & Indian Affairs",HTPWC:"House Transportation, Public Works & Capital",HLVMC:"House Labor, Veterans' & Military Affairs",HTRC:"House Taxation & Revenue",
  HCEDC:"House Commerce & Economic Development",HENRC:"House Energy, Environment & Natural Resources",HRDLC:"House Rural Development, Land Grants & Cultural Affairs",HRC:"House Rules & Order of Business",
  HAWC:"House Agriculture, Water & Wildlife",HLLC:"House Local Government, Land Grants & Cultural Affairs",HSEIC:"House State Government, Elections & Indian Affairs",HBEC:"House Business & Employment",
  HBIC:"House Business & Industry",HAAWC:"House Agriculture, Acequias & Water Resources",HRPAC:"House Regulatory & Public Affairs",HSCAC:"House Safety & Civil Affairs",HWMC:"House Ways & Means",
  HLC:"House Labor & Human Resources",HHC:"House Health",HTC:"House Transportation",HVEC:"House Voters & Elections",HGUAC:"House Government & Urban Affairs",HLELC:"House Local Government, Elections, Land Grants & Cultural Affairs",
  HLEDC:"House Labor & Economic Development",HSIVC:"House State Government, Indian & Veterans' Affairs",HHGAC:"House Health & Government Affairs",HHGIC:"House Health, Government & Indian Affairs",HENNC:"House Energy, Environment & Natural Resources",
  HEENC:"House Energy, Environment & Natural Resources",HCW:"House Committee of the Whole",
  SFC:"Senate Finance",SJC:"Senate Judiciary",SPAC:"Senate Public Affairs",SHPAC:"Senate Health & Public Affairs",SEC:"Senate Education",SRC:"Senate Rules",SCONC:"Senate Conservation",
  SCORC:"Senate Corporations & Transportation",STBTC:"Senate Tax, Business & Transportation",SIRC:"Senate Indian, Rural & Cultural Affairs",SIAC:"Senate Indian & Cultural Affairs",
  SCC:"Senate Committees' Committee",SGC:"Senate Select Gaming",SWMC:"Senate Ways & Means",SCW:"Senate Committee of the Whole"};
const cmName = c => COMMS[c] || c;
const cmShort = c => (cmName(c) || c).replace(/^(House|Senate) /, "");
/* Reads the status code string, e.g. "[2] not prntd-HRC- w/drn -germane-prntd- - ref HCPAC/HJC/HAFC-HCPAC [5] DP/a-HAFC [7] DP [8] PASSED/H (36-28) [11] SHPAC/SFC-SHPAC".
   A "-CODE" ending means the bill moved into that committee. A bare DP / PASSED means it left the committee. */
const pstCache = new Map();
function parseStatus(text) {
  if (pstCache.has(text)) return pstCache.get(text);
  const t = text.replace(/\(Succeeding entries[^)]*\)/i, " ");
  const ev = [];                       // [index, kind, value]
  let m, re = /(?:^|[\s\]\-])([A-Za-z&\/]{2,40})-\s?([HS][A-Z&]{2,5})(?=[\s.\[,\-]|$)/g;
  while ((m = re.exec(t))) { if (COMMS[m[2]]) ev.push([m.index + m[0].length, "in", m[2], m[1].replace(/\/a+$/, "")]); }
  re = /(?:^|[\s\]])(DP(?:\/a+)?|w\/drn|PASSED\/[HS]|DNP-CS\/DP|DNP-CS\/DP\/a|w\/o rec)(?=[\s\[.]|$)(?!-)/g;
  while ((m = re.exec(t))) { if (/^(DP|DNP|w\/o)/.test(m[1]) && /-\s?[HS][A-Z&]{2,5}\b/.test(t.slice(m.index + m[0].length - 1, m.index + m[0].length + 12)) && COMMS[(t.slice(m.index + m[0].length).match(/^-\s?([HS][A-Z&]{2,5})/) || [])[1]]) continue; ev.push([m.index, "out", m[1]]); }
  ev.sort((x, y) => x[0] - y[0]);
  let cur = null, path = [];
  for (const e of ev) { if (e[1] === "in") { cur = e[2]; path = e[3].split("/"); } else cur = null; }
  const rest = cur && path.includes(cur) ? path.slice(path.indexOf(cur) + 1) : [];
  const pH = /PASSED\/H/.test(t), pS = /PASSED\/S/.test(t), tl = t.trim();
  const unassigned = !!cur && cur === "HRC" && /not prntd/.test(t) && ev.filter(e => e[1] === "in").length === 1 || (/^(HPREF|SPREF)\b/.test(tl) && !ev.length);
  if (unassigned) cur = null;
  const signed = /SGND BY GOV|\bCh\.\s*\d|\bSGND\b/.test(t), veto = /VETO/.test(t) && !signed;
  const dead = !signed && !veto && (/\bAPI\.?\s*$/.test(tl) || /TBLD INDEF|\bDEAD\b/i.test(t) || /FAILED\/[HS]\s*(\(\d+-\d+\))?\.?\s*$/.test(tl) || /\btbld\.?\s*$/.test(tl));
  let bucket = "Pending or other";
  if (signed) bucket = "Signed into law";
  else if (veto) bucket = "Vetoed";
  else if (dead) bucket = "Died or tabled";
  else if (pH && pS) bucket = "Passed both chambers";
  else if (pH || pS) bucket = "Passed one chamber";
  else if (cur) bucket = "In committee";
  else if (ev.some(e => e[1] === "out" && /^(DP|DNP)/.test(e[2]))) bucket = "On the floor";
  const live = !signed && !veto && !dead;
  const r = { bucket, cur: live ? cur : null, rest: live ? rest : [], unassigned: live && unassigned, live, pH, pS };
  pstCache.set(text, r); return r;
}
function bucket(text) { return parseStatus(text).bucket; }
function statusOf(sk, key) {
  const x = EXTRA[sk]; if (!x) return null;
  const text = ((x.status || {})[key] || {}).status || ((x.meta || {})[key] || {}).location || "";
  return text ? { text, bucket: bucket(text) } : null;
}
function topicOf(sk, key, b) {
  const id = sk + "|" + key;
  if (id in memo) return memo[id];
  return memo[id] = classifyTitle(shortTitle(sk, key), longTitle(sk, key), b.t);
}
function stageOf(b) { for (let i = STAGES.length - 1; i >= 0; i--) if (b.f[STAGES[i][0]]) return i; return 0; }
function stats(sk) {
  const m = "st|" + sk; if (memo[m]) return memo[m];
  const bills = Object.values(D.sessions[sk].bills), hs = bills.filter(b => b.t === "HB" || b.t === "SB");
  const st = { all: bills.length, hs: hs.length, c: {}, a: {} };
  for (const [f] of STAGES) { st.c[f] = hs.filter(b => b.f[f]).length; st.a[f] = bills.some(b => b.f[f]); }
  return memo[m] = st;
}
function events(sk) {
  const m = "ev|" + sk; if (memo[m]) return memo[m];
  const ev = [];
  for (const [key, b] of Object.entries(D.sessions[sk].bills)) for (const [fo, f] of Object.entries(b.f)) if (f.d) ev.push({ sk, key, b, fo, d: f.d, u: f.u, c: f.c });
  ev.sort((x, y) => y.d.localeCompare(x.d));
  return memo[m] = ev;
}
function billUrl(sk, b) {
  const t = LEGTYPE[b.t]; if (!t) return null;
  return `https://www.nmlegis.gov/Legislation/Legislation?chamber=${t[0]}&legType=${t[1]}&legNo=${b.n}&year=${sk.split(" ")[0]}`;
}
function passes(sk, key, b) {
  if (S.types.size && !S.types.has(b.t)) return false;
  if (S.topic && topicOf(sk, key, b) !== S.topic) return false;
  if ([...S.stages].some(f => !b.f[f])) return false;
  if (S.onlyW && !W.has(sk + "|" + key)) return false;
  if (S.pos && posOf(sk + "|" + key) !== S.pos) return false;
  if (S.sg) { const g = SG.find(x => x[0] === S.sg); if (!g || !g[1].includes((statusOf(sk, key) || {}).bucket)) return false; }
  if (S.dummy !== "all") { const d = !!dummyOf(sk, key, b); if (S.dummy === "hide" ? d : !d) return false; }
  if (S.status && (statusOf(sk, key) || { bucket: "No status loaded" }).bucket !== S.status) return false;
  return true;
}

/* ---------- load ---------- */
async function load() {
  const [d, t] = await Promise.all([
    fetch("data/tracker.json", {cache:"no-cache"}).then(r => r.json()),
    fetch("data/titles.json", {cache:"no-cache"}).then(r => r.json()).catch(() => ({}))
  ]);
  D = sanitizeData(d); T = (t && typeof t === "object") ? t : {}; for (const k in memo) delete memo[k];
  try { const i = await fetch("data/intro.json", {cache:"no-cache"}).then(r => r.json()); for (const k in INTRO) delete INTRO[k]; Object.assign(INTRO, i); } catch {}
  if (!D.sessions || !Object.values(D.sessions)[0].y) throw new Error("old data format");
  const list = sessList();
  if (!S.cur || !D.sessions[S.cur]) S.cur = list.find(isReg) || list[0];
  $("#sess").innerHTML = list.map(k => `<option value="${esc(k)}">${esc(label(k))}</option>`).join("");
  $("#sess").value = S.cur;
  await loadExtra(S.cur);
  render();
}
async function loadExtra(sk) {
  if (EXTRA[sk]) return EXTRA[sk];
  const name = sk.replace(/[^A-Za-z0-9._-]+/g, "_"), out = { meta:{}, amend:{}, status:{}, versions:{} };
  try { out.meta = await fetch(`data/meta_${name}.json`).then(r => r.json()); } catch {}
  try { const st = await fetch(`data/status_${name}.json`).then(r => r.json()); if (st._session === sk || (st._session === undefined && sk === sessList().find(isReg))) out.status = st; } catch {}
  try { out.amend = (await fetch(`data/amend_${name}.json`).then(r => r.json())).bills || {}; } catch {}
  try { out.versions = await fetch(`data/versions_${name}.json`).then(r => r.json()); } catch {}
  try { const sc = await fetch(`data/schedule.json`, {cache:"no-cache"}).then(r => r.json()); out.schedule = sc; } catch {}
  try { const c = await fetch(`data/changes.json`, {cache:"no-cache"}).then(r => r.json()); if (c.session === sk) out.changes = c; } catch {}
  if (!window.__roster) { try { window.__roster = (await fetch("data/legislators.json").then(r => r.json())).people || []; } catch { window.__roster = []; } }
  for (const k in memo) delete memo[k];
  return EXTRA[sk] = out;
}

/* ---------- shared pieces ---------- */
function topicBar() {
  const counts = {}, sk = S.cur;
  for (const [key, b] of Object.entries(D.sessions[sk].bills)) { const t = topicOf(sk, key, b); counts[t] = (counts[t] || 0) + 1; }
  const names = TOPIC_NAMES.concat([PENDING]).filter(n => counts[n]);
  return `<div class="chips scroll"><button class="chip${!S.topic ? " on" : ""}" data-topic="">All topics</button>`
    + names.map(n => `<button class="chip${S.topic === n ? " on" : ""}" data-topic="${esc(n)}">${esc(n)}<i>${counts[n]}</i></button>`).join("") + "</div>"
  + (INTRO[sk] ? (() => { let nd = 0, ns = 0; for (const [key, b] of Object.entries(D.sessions[sk].bills)) { const d = dummyOf(sk, key, b); if (d) { nd++; if (d.sub) ns++; } }
    return `<div class="chips" style="margin-top:0"><span class="meta" style="align-self:center">Dummy bills (${nd}, ${ns} replaced by a committee substitute):</span>`
      + [["all", "Show"], ["hide", "Hide"], ["only", "Only"]].map(([v, l]) => `<button class="chip${S.dummy === v ? " on" : ""}" data-dummy="${v}">${l}</button>`).join("") + "</div>"; })() : "");
}
function billCard(sk, key, b, opts = {}) {
  const id = sk + "|" + key, title = titleOf(sk, key), tp = topicOf(sk, key, b);
  const folders = Object.keys(b.f).sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99));
  const pills = folders.map(f => { const k = KIND[f] || [f, "mute"]; return `<span class="pill kk k-${k[1]}">${esc(k[0].split(" ")[0] === "Committee" ? "Cmte" : k[0].split(" ")[0])}</span>`; }).join(" ");
  return `<div class="bill" data-open="${esc(id)}" role="button" tabindex="0"><button class="star${W.has(id) ? " on" : ""}" data-w="${esc(id)}" aria-label="Watch">★</button>
    <b>${b.t} ${b.n}</b><span class="sess">${esc(label(sk))}</span>${tp && tp !== PENDING ? `<span class="topic">${esc(tp)}</span>` : ""}${rewritten(sk, key) ? ` <span class="pill" style="border-color:var(--red);color:var(--red)">Rewritten</span>` : ""}
    <div class="t">${title ? esc(nice(title)) : `<span class="meta">Title not collected yet</span>`}</div>
${(() => { const d = dummyOf(sk, key, b); return d ? `<div class="meta"><span class="pill" style="border-color:var(--gold);background:var(--soft)">${dummyTag(d)}</span></div>` : ""; })()}
    ${(() => { const s = statusOf(sk, key); return s ? `<div class="meta"><span class="pill kk k-${STC[s.bucket]}">${esc(s.bucket)}</span> ${esc(s.text.slice(0, 110))}</div>` : `<div class="meta">Status not loaded · last activity ${fmtD(b.last)}</div>`; })()}${posOf(id) ? `<div class="meta" style="margin-top:4px"><span class="pill kk k-${POSN[posOf(id)][2]}">${POSN[posOf(id)][1]}</span>${(N[id] || {}).tag ? " #" + esc(N[id].tag) : ""}</div>` : ""}<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap">${pills}</div></div>`;
}

/* ---------- notes & positions ---------- */
const N = ls.get("notes", {});
const POS = [["support", "Support", "turq"], ["oppose", "Oppose", "red"], ["monitor", "Monitor", "gold"], ["amend", "Seek amendment", "terra"]];
const POSN = Object.fromEntries(POS.map(p => [p[0], p]));
const saveN = () => ls.set("notes", N);
const posOf = id => (N[id] || {}).pos || "";
const TAEL = "width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink)";
function renderNotes(id) {
  const n = N[id] || {};
  $("#notes").innerHTML = `<h2>My position <small>${window.RT && window.RT.signedIn && window.RT.signedIn() ? "saved to your account" : "kept on this device"}</small></h2><div class="chips">${POS.map(([v, l]) => `<button class="chip${n.pos === v ? " on" : ""}" data-pos="${v}" data-pid="${esc(id)}">${l}</button>`).join("")}</div>
<input id="ntag" type="search" placeholder="Tag (for example: groundwater-package)" value="${esc(n.tag || "")}" style="margin-bottom:6px"><textarea id="ntext" rows="3" placeholder="Private notes" style="${TAEL}">${esc(n.note || "")}</textarea>`;
  const upd = () => { const o = N[id] = N[id] || {}; o.tag = $("#ntag").value.trim(); o.note = $("#ntext").value; if (!o.pos && !o.tag && !o.note) delete N[id]; saveN(); };
  $("#ntag").oninput = upd; $("#ntext").oninput = upd;
}
function openBrief() {
  const ids = new Set([...W, ...Object.keys(N).filter(k => N[k].pos || N[k].note)]);
  const groups = [...POS.map(p => [p[0], p[1]]), ["", "Watching (no position)"]], lines = [];
  for (const [pv, pl] of groups) {
    const rows = [...ids].filter(id => (posOf(id) || "") === pv).map(id => { const [sk, key] = id.split("|"); return D.sessions[sk] && D.sessions[sk].bills[key] ? [sk, key, D.sessions[sk].bills[key], id] : null; }).filter(Boolean);
    if (!rows.length) continue;
    lines.push(pl.toUpperCase() + " (" + rows.length + ")");
    for (const [sk, key, b, id] of rows) {
      const st = statusOf(sk, key), t = titleOf(sk, key);
      lines.push(`- ${b.t} ${b.n} (${label(sk)}): ${t ? nice(t) : "title not collected"}${st ? " | Status: " + st.bucket + " - " + st.text.slice(0, 140) : ""}${N[id] && N[id].note ? " | Note: " + N[id].note.replace(/\s+/g, " ") : ""}${N[id] && N[id].tag ? " | #" + N[id].tag : ""}`);
    }
    lines.push("");
  }
  const text = lines.length ? "NM LEGISLATURE BILL BRIEF\nPrepared " + new Date().toLocaleDateString() + "\n\n" + lines.join("\n") : "Nothing to put in a brief yet. Star bills or mark a position on a bill, then come back here.";
  $("#panel").innerHTML = `<div style="display:flex;justify-content:space-between"><h3>One-page brief</h3><button class="btn" data-close="1">Close</button></div>
<div class="note">Everything you starred or gave a position or note, grouped by position. Notes stay on this device.</div>
<textarea id="brieft" rows="16" readonly style="${TAEL};font-size:13px">${esc(text)}</textarea>
<div style="margin-top:8px"><button class="btn pri" data-copy="1">Copy brief</button> <span class="meta" id="copied"></span></div>`;
  $("#sheet").classList.add("on");
}
/* ---------- votes from the status text ---------- */
function votesOf(text) {
  const out = [], re = /PASSED\/([HS])\s*\((\d+)\s*-\s*(\d+)\)/gi; let m;
  while ((m = re.exec(text || ""))) out.push({ ch: m[1].toUpperCase() === "H" ? "House" : "Senate", y: +m[2], n: +m[3] });
  return out;
}
function voteHtml(sk, key) {
  const st = statusOf(sk, key), v = st ? votesOf(st.text) : [];
  return v.length ? `<h2>Floor votes <small>from the legislature's status line</small></h2>` + v.map(x => `<div class="doc"><span>${x.ch}: passed</span><b>${x.y} yes, ${x.n} no</b></div>`).join("") : "";
}
/* ---------- calendar & deadlines (computed from the state constitution's schedule) ---------- */
function thirdTuesday(y) { const d = new Date(y, 0, 1), off = (2 - d.getDay() + 7) % 7; return new Date(y, 0, 1 + off + 14); }
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dLong = d => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
function calendarCard() {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let y = now.getFullYear(), start, end, len;
  for (; ; y++) { start = thirdTuesday(y); len = y % 2 ? 60 : 30; end = addDays(start, len); if (today <= end) break; }
  const days = Math.round((start - today) / 864e5), inSess = today >= start;
  const head = inSess ? `In session now: day ${Math.round((today - start) / 864e5) + 1} of ${len + 1}` : `Next session starts in ${days} day${days === 1 ? "" : "s"}`;
  const row = (l, d, n) => `<div class="doc"><span>${l}${n ? ` <span class="meta">${n}</span>` : ""}</span><b>${dLong(d)}</b></div>`;
  return `<details class="card" ${inSess ? "open" : ""}><summary style="cursor:pointer"><b>${head}</b> <span class="meta">· ${y} ${len === 60 ? "regular (60-day)" : "budget session (30-day)"}</span></summary>
${row("Session convenes", start, "third Tuesday of January")}${row("Adjourns (noon)", end)}${row("Governor's deadline on late bills", addDays(end, 20), "20 days after adjournment")}${row("Most new laws take effect", addDays(end, 90), "90 days after adjournment")}
<div class="note">Dates are computed from the constitutional schedule, not read from the legislature's calendar. Committee hearing schedules aren't loaded yet; check nmlegis.gov for the official calendar.</div></details>`;
}
/* ---------- people (sponsors) ---------- */
const normName = n => n.replace(/[\u201c\u201d"]/g, '"').replace(/\s+/g, " ").trim();
/* One entry per legislator: splits run-together names ("A B, C D", "A B / C D", "A and B"), tidies spacing, drops repeats. */
const CODE = {};   // sponsor name -> legislator code (e.g. HSMAL), learned from the official list
function sponsorsOf(sk, key) {
  const st = ((EXTRA[sk] || {}).status || {})[key] || {}, raw = st.sponsors || [], out = [];
  raw.forEach((n, i) => { if (st.sc && st.sc[i]) CODE[normName(String(n))] = st.sc[i]; });
  for (const r of raw) for (const part of String(r).split(/\s*(?:;|\/|\band\b|,(?!\s*(?:Jr|Sr|II|III|IV)\b))\s*/)) { const n = normName(part); if (n.length > 2 && !out.includes(n)) out.push(n); }
  return out;
}
const nameKey = n => n.toLowerCase().replace(/"[^"]*"/g, "").replace(/[^a-z ]/g, " ").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").split(/\s+/).filter(Boolean);
function legInfo(n) {   // match to the sitting-member roster by last name + first initial; undefined if not a current member
  const roster = (window.__roster || []), k = nameKey(n); if (!k.length) return;
  if (CODE[n]) { const c = roster.find(p => p.code === CODE[n]); if (c) return c; }
  const last = k[k.length - 1], first = k[0];
  const hits = roster.filter(p => { const r = nameKey(p.n); return r[r.length - 1] === last && r[0][0] === first[0]; });
  return hits.length === 1 ? hits[0] : hits.find(p => nameKey(p.n)[0] === first);
}
const legTag = i => i ? `(${i.p}) ${i.c === "H" ? "House" : "Senate"} District ${i.d}` : "";
function peopleOf(sk) {
  const st = (EXTRA[sk] || {}).status || {}, m = {};
  for (const [key, v] of Object.entries(st)) {
    if (key === "_session" || !D.sessions[sk].bills[key]) continue;
    sponsorsOf(sk, key).forEach((n, i) => { if (!n) return; const p = m[n] = m[n] || { name: n, bills: [], primary: 0 }; p.bills.push(key); if (i === 0) p.primary++; });
  }
  for (const p of Object.values(m)) { p.signed = 0; p.passed = 0; for (const k of p.bills) { const b = (statusOf(sk, k) || {}).bucket; if (b === "Signed into law") p.signed++; if (["Signed into law", "Vetoed", "Passed both chambers", "Passed one chamber"].includes(b)) p.passed++; } }
  return m;
}
function renderPeople() {
  const sk = S.cur, m = peopleOf(sk), all = Object.values(m);
  if (!all.length) { $("#people").innerHTML = `<div class="card">Sponsor names come from the legislature's official bill listing, which isn't loaded for ${esc(label(sk))}. It is only available for the current session.</div>`; return; }
  if (S.person && m[S.person]) {
    const p = m[S.person], tc = {};
    for (const k of p.bills) { const t = topicOf(sk, k, D.sessions[sk].bills[k]); tc[t] = (tc[t] || 0) + 1; }
    const list = p.bills.map(k => [k, D.sessions[sk].bills[k]]).sort((a, b) => b[1].last.localeCompare(a[1].last));
    $("#people").innerHTML = `<button class="btn" data-person="">← All sponsors</button><h2>${esc(p.name)} <small>${esc(label(sk))}</small></h2>${legInfo(p.name) ? `<div class="meta" style="margin:-6px 2px 8px">${esc(legTag(legInfo(p.name)))}</div>` : ""}
<div class="tiles" style="grid-template-columns:repeat(4,1fr)"><div class="tile k-sky"><b>${p.bills.length}</b><span>Bills</span></div><div class="tile k-turq"><b>${p.primary}</b><span>As lead</span></div><div class="tile k-gold"><b>${p.passed}</b><span>Passed a chamber</span></div><div class="tile k-red"><b>${p.signed}</b><span>Signed</span></div></div>
<div class="note">Success rate: ${pct(p.signed, p.bills.length)}% signed, ${pct(p.passed, p.bills.length)}% passed at least one chamber. Includes bills they co-sponsored.</div>
<div class="chips">${Object.entries(tc).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="pill">${esc(t)} ${n}</span>`).join(" ")}</div>
${list.slice(0, S.shown).map(([k, b]) => billCard(sk, k, b)).join("")}${list.length > S.shown ? `<button class="more" data-more="1">Show more</button>` : ""}`;
    return;
  }
  const q = (S.pq || "").toLowerCase();
  const rows = all.filter(p => !q || p.name.toLowerCase().includes(q)).sort((a, b) => b.bills.length - a.bills.length);
  $("#people").innerHTML = `<input id="pq" type="search" placeholder="Find a sponsor" value="${esc(S.pq || "")}" autocomplete="off">
<h2>Sponsors in ${esc(label(sk))} <small>${rows.length} people</small></h2>
<div class="tbl card" style="padding:0"><table><tr><th>Sponsor</th><th>Bills</th><th>Lead</th><th>Passed</th><th>Signed</th></tr>${rows.slice(0, 200).map(p => `<tr><td><a href="#" data-person="${esc(p.name)}">${esc(p.name)}</a>${legInfo(p.name) ? ` <span class="meta">${esc(legInfo(p.name).p + " " + legInfo(p.name).c + legInfo(p.name).d)}</span>` : ""}</td><td>${p.bills.length}</td><td>${p.primary}</td><td>${pct(p.passed, p.bills.length)}%</td><td>${pct(p.signed, p.bills.length)}%</td></tr>`).join("")}</table></div>
<div class="note">Counts come from the legislature's bill listing. Passed and Signed are shares of each person's bills, co-sponsored ones included.</div>`;
  const inp = $("#pq"); inp.addEventListener("input", e => { S.pq = e.target.value; const pos = e.target.selectionStart; renderPeople(); const n = $("#pq"); n.focus(); n.setSelectionRange(pos, pos); });
}
/* ---------- analytics ---------- */
function analyticsCard() {
  const sk = S.cur, rows = ["HB", "SB"].map(t => {
    const bs = Object.entries(D.sessions[sk].bills).filter(([, b]) => b.t === t), n = bs.length;
    const has = f => bs.filter(([, b]) => b.f[f]).length, st = bs.map(([k]) => (statusOf(sk, k) || {}).bucket).filter(Boolean);
    return { t, n, cm: has("Committee_Subs_And_Amendments"), vt: has("votes"), fin: has("final"), known: st.length,
      pass: st.filter(x => ["Signed into law", "Vetoed", "Passed both chambers", "Passed one chamber"].includes(x)).length, sign: st.filter(x => x === "Signed into law").length, died: st.filter(x => x === "Died or tabled").length };
  });
  const useSt = rows.some(r => r.known >= 0.3 * r.n && r.n);
  const cell = (a, b) => b ? `${pct(a, b)}%` : "–";
  return `<h2>Session funnel <small>${esc(label(sk))}</small></h2><div class="tbl card" style="padding:0"><table><tr><th>Bills</th><th>Count</th><th>Cmte action</th><th>Vote record</th><th>Latest text</th>${useSt ? "<th>Passed a chamber</th><th>Signed</th><th>Died</th>" : ""}</tr>
${rows.map(r => `<tr><td>${r.t === "HB" ? "House" : "Senate"} bills</td><td>${r.n}</td><td>${cell(r.cm, r.n)}</td><td>${cell(r.vt, r.n)}</td><td>${cell(r.fin, r.n)}</td>${useSt ? `<td>${cell(r.pass, r.known)}</td><td>${cell(r.sign, r.known)}</td><td>${cell(r.died, r.known)}</td>` : ""}</tr>`).join("")}</table></div>
<div class="note">${useSt ? "Passed, Signed and Died use the legislature's status line. " : "Official status isn't available for this session, so this funnel counts which documents were posted. "}Bills that never get a committee document mostly died in their first committee. Compare years with the bars above; use the year button to change session.</div>`;
}

/* ---------- plain-language helpers ---------- */
const SG = [["Became law", ["Signed into law"], "red"], ["Moving", ["Passed both chambers", "Passed one chamber", "On the floor"], "turq"], ["In committee", ["In committee", "Pending or other"], "gold"], ["Dead or vetoed", ["Died or tabled", "Vetoed"], "mute"]];
const PLAIN = {
  "Signed into law": "This bill is now law.",
  "Vetoed": "The governor vetoed this bill.",
  "Passed both chambers": "Both the House and Senate passed it. It is with the governor or on its way there.",
  "Passed one chamber": "One chamber has passed it. The other chamber still has to act.",
  "On the floor": "It is waiting for a vote by the full House or Senate.",
  "In committee": "It is still in committee. It needs a hearing and a vote there to move on.",
  "Died or tabled": "It did not advance and is dead for this session.",
  "Pending or other": "The legislature's status line is unclear. Read the history below."
};
const PLAIN_DOCS = ["Only the bill as introduced is posted. There is no sign yet of committee action.", "A fiscal impact report is posted, so the bill is being analyzed.", "A committee has acted: a substitute or amendment is posted.", "Floor amendments were filed, so it reached a chamber floor.", "A vote record exists for this bill.", "A latest-text version is posted, so it moved past committee."];
function plainOf(sk, key, b) {
  const s = statusOf(sk, key);
  return s ? { bucket: s.bucket, line: PLAIN[s.bucket] || "", official: s.text } : { bucket: null, line: PLAIN_DOCS[stageOf(b)] + " (Official status isn't loaded for this session, so this is based on which documents exist.)", official: "" };
}
function sgOf(sk, key) { const b = (statusOf(sk, key) || {}).bucket; const g = SG.find(x => x[1].includes(b)); return g ? g[0] : ""; }
function backBar() { return `<button class="btn back" data-tab="home">← Home</button>`; }
/* ---------- home ---------- */
function renderHome() {
  const sk = S.cur, bills = Object.entries(D.sessions[sk].bills).filter(([, b]) => b.t === "HB" || b.t === "SB");
  const cnt = {}, known = bills.filter(([k]) => statusOf(sk, k)).length;
  for (const [k] of bills) { const g = sgOf(sk, k); if (g) cnt[g] = (cnt[g] || 0) + 1; }
  const useSt = bills.length && known >= 0.3 * bills.length;
  const ev = events(sk).slice(0, 5);
  const follow = new Set([...W, ...Object.keys(N).filter(k => N[k].pos || N[k].note)]).size;
  const ageH = D.generated ? (Date.now() - new Date(D.generated)) / 36e5 : 0, fresh = D.generated ? `<div class="${ageH > 48 ? "stale" : "note"}" style="margin:0 2px 10px">${ageH > 48 ? "<b>This data may be out of date.</b> " : ""}Bill data as of ${fmtD(D.generated)}, copied from nmlegis.gov. Always confirm on the official site before relying on it.</div>` : "";
  $("#home").innerHTML = `${fresh}<h1 class="big1">Look up a bill</h1>
<div class="hs"><input id="hq" type="search" placeholder="Bill number or subject" autocomplete="off"><button class="btn pri" data-hs="1">Search</button></div>
<div class="note" style="margin:4px 2px 14px">For example: HB 2, water, or a legislator's name.</div>
<div class="bigtiles">
<button class="bt big" data-tab="brief" style="grid-column:1/-1;border-top:5px solid var(--red)"><b>Daily brief</b><span>One page: what moved on your bills, today</span></button>
<button class="bt" data-tab="following"><b>★ Following</b><span>${follow ? follow + " bill" + (follow === 1 ? "" : "s") + " you're tracking" : "Bills you star show up here"}</span></button>
<button class="bt" data-tab="changes"><b>What just happened</b><span>Status changes, newest first</span></button>
</div>
<h2 style="margin-top:18px">How ${esc(label(sk))} bills turned out <small>${bills.length} House and Senate bills</small></h2>
${useSt ? `<div class="bigtiles four">${SG.map(([n, , c]) => `<button class="bt k-${c}" data-sg="${esc(n)}" style="border-top:5px solid var(--kc)"><b style="font-size:26px">${cnt[n] || 0}</b><span>${n}</span></button>`).join("")}</div><div class="note">Tap a number to see those bills.</div>`
    : `<div class="card">The legislature's official status is only loaded for the current session. For ${esc(label(sk))} you can still search every bill and see which documents were posted. <button class="btn" data-tab="pipeline" style="margin-top:8px">See how far bills got</button></div>`}
<h2>Browse</h2>
<div class="bigtiles">
<button class="bt" data-cm=""><b>By committee</b><span>What is waiting, what is scheduled</span></button>
<button class="bt" data-tab="topics"><b>By subject</b><span>Water, health, schools…</span></button>
<button class="bt" data-tab="people"><b>By sponsor</b><span>Who sponsors what</span></button>
<button class="bt" data-tab="pipeline"><b>Where bills stand</b><span>Stage by stage</span></button>
<button class="bt" data-tab="years"><b>Year by year</b><span>1996 to now</span></button>
</div>
<h2>Latest activity <small><a href="#" data-tab="changes">See all</a></small></h2>
${ev.map(e => { const k = KIND[e.fo] || [e.fo, "mute"]; return `<button class="ev k-${k[1]}" data-open="${esc(e.sk + "|" + e.key)}"><div style="flex:1;min-width:0"><b>${e.b.t} ${e.b.n}</b> <span class="pill kk k-${k[1]}">${esc(k[0])}</span> <span class="meta">${fmtD(e.d)}</span><div class="t">${titleOf(sk, e.key) ? esc(nice(titleOf(sk, e.key))) : ""}</div></div></button>`; }).join("") || `<div class="card">No activity yet.</div>`}
<h2>Next session</h2>${calendarCard()}
<details class="card" style="margin-top:14px"><summary style="cursor:pointer"><b>What do the words mean?</b></summary>
${Object.entries(PLAIN).map(([k, v]) => `<div class="doc"><span class="pill kk k-${STC[k]}">${k}</span><span style="flex:1;text-align:right;font-size:14px">${v}</span></div>`).join("")}</details>`;
  const go_ = () => { S.q = $("#hq").value.trim(); S.sg = ""; S.status = null; S.topic = null; go("bills"); };
  $("#hq").addEventListener("keydown", e => { if (e.key === "Enter") go_(); });
  $("#home").querySelector("[data-hs]").onclick = go_;
}
/* ---------- following ---------- */
function renderFollowing() {
  const ids = [...new Set([...W, ...Object.keys(N).filter(k => N[k].pos || N[k].note || N[k].tag)])];
  const all = ids.map(id => { const [sk, key] = id.split("|"); const b = D.sessions[sk] && D.sessions[sk].bills[key]; return b ? [sk, key, b] : null; }).filter(Boolean);
  const items = all.filter(([sk, k]) => !S.pos || posOf(sk + "|" + k) === S.pos).sort((x, y) => y[2].last.localeCompare(x[2].last));
  const c = {}; for (const [sk, k] of all) { const p = posOf(sk + "|" + k); if (p) c[p] = (c[p] || 0) + 1; }
  $("#following").innerHTML = `<h1 class="big1">Bills I'm following</h1>
${all.length ? `<button class="btn" data-backup="1" style="width:100%;margin-bottom:8px">Back up my notes and stars (copy)</button><button class="btn pri big" data-brief="1" style="width:100%;margin-bottom:10px">Make a one-page summary to copy</button>
<div class="chips scroll"><button class="chip${!S.pos ? " on" : ""}" data-pospick="">All (${all.length})</button>${POS.filter(p => c[p[0]]).map(([v, l]) => `<button class="chip${S.pos === v ? " on" : ""}" data-pospick="${v}">${l} (${c[v]})</button>`).join("")}</div>
${items.map(([sk, k, b]) => billCard(sk, k, b)).join("")}`
    : `<div class="card"><b>Nothing here yet.</b><p style="margin:6px 0 0">Open any bill and tap <b>☆ Follow</b>. You can also mark it Support, Oppose, Monitor or Seek amendment and add a private note.</p><p class="meta" style="margin:6px 0 0">Your list is saved on this device only.</p><button class="btn pri big" data-tab="bills" style="margin-top:10px">Find a bill</button></div>`}`;
}

/* ---------- daily brief ---------- */
function followedIds() { return new Set([...W, ...Object.keys(N).filter(k => N[k].pos || N[k].note)]); }
const PRI = { oppose: 0, support: 1, amend: 2, monitor: 3 };
const ADV = ["Signed into law", "Vetoed", "Passed both chambers", "Passed one chamber", "On the floor"];
function actionFor(pos, bk) {
  if (pos === "oppose") return bk === "Signed into law" ? "Became law over your opposition." : bk === "Passed both chambers" ? "Passed both chambers. Heading to the governor." : bk === "Passed one chamber" ? "Passed one chamber. Opposition may be needed in the other." : bk === "Died or tabled" ? "Good news: it died." : bk === "Vetoed" ? "Vetoed." : "";
  if (pos === "support") return bk === "Died or tabled" ? "Your supported bill is dead." : bk === "Vetoed" ? "Your supported bill was vetoed." : bk === "Signed into law" ? "Your supported bill is law." : bk === "Passed both chambers" ? "Passed both chambers." : bk === "Passed one chamber" ? "Passed one chamber. It needs the other next." : "";
  if (pos === "amend") return ADV.includes(bk) ? "Moved while you wanted amendments. Check the language." : "";
  return "";
}
function briefData() {
  const sk = S.cur, x = EXTRA[sk] || {}, bills = D.sessions[sk].bills, mine = followedIds();
  const days = S.briefDays || 1, cutoff = Date.now() - days * 864e5;
  const log = ((x.changes || {}).log || []).filter(e => bills[e.k] && new Date(e.d) >= cutoff).reverse();
  const seen = new Set(), moves = [];
  for (const e of log) { if (seen.has(e.k)) continue; seen.add(e.k); moves.push(e); }
  const pr = e => { const p = posOf(sk + "|" + e.k); return p in PRI ? PRI[p] : 4; };
  const mineMoves = moves.filter(e => mine.has(sk + "|" + e.k)).sort((a, b) => pr(a) - pr(b));
  const big = moves.filter(e => !mine.has(sk + "|" + e.k) && ["Signed into law", "Vetoed", "Passed both chambers", "Passed one chamber"].includes(bucket(e.to))).slice(0, 6);
  const stalled = [...mine].map(id => id.split("|")).filter(([a, k]) => a === sk && bills[k]).filter(([, k]) => { const s = statusOf(sk, k); return s && ["In committee", "On the floor", "Pending or other"].includes(s.bucket) && Math.floor((Date.now() - new Date(bills[k].last)) / 864e5) >= 14; }).map(([, k]) => k);
  return { sk, mine, moves, mineMoves, big, stalled, days, tracked: !!x.changes };
}
function schedOf(sk) { const sc = (EXTRA[sk] || {}).schedule; return sc && sc.hearings ? sc.hearings : []; }
function keyDates() {
  const t0 = new Date(), today = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate());
  for (let y = t0.getFullYear(); ; y++) { const st = thirdTuesday(y), len = y % 2 ? 60 : 30, end = addDays(st, len);
    const ev = [["Session convenes", st], ["Session adjourns", end], ["Governor's deadline on late bills", addDays(end, 20)], ["Most new laws take effect", addDays(end, 90)]].filter(([, d]) => d >= today);
    if (ev.length) return ev.slice(0, 2).map(([l, d]) => `${l}: ${dLong(d)}`).join(" · "); }
}
function briefHearings(d) {
  const sk = d.sk, today = new Date().toISOString().slice(0, 10), end = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const hs = schedOf(sk).filter(h => h.d >= today && h.d <= end);
  const keyOf = b => b.k;
  const mine = [], other = [];
  for (const h of hs) { const mb = h.bills.filter(b => d.mine.has(sk + "|" + keyOf(b))); (mb.length ? mine : other).push({ h, mb }); }
  return { mine, other, have: schedOf(sk).length > 0 };
}
function briefText(d, hr) {
  const sk = d.sk, L = [`DAILY BRIEF ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} (${label(sk)})`, briefSummary(d).replace(/<[^>]+>/g, "")];
  if (hr.mine.length) { L.push("", "HEARINGS ON YOUR BILLS"); for (const { h, mb } of hr.mine) L.push(`- ${h.d} ${h.t} ${h.c}${h.room ? " Rm " + h.room : ""}: ` + mb.map(b => b.k).join(", ")); }
  if (d.mineMoves.length) { L.push("", "YOUR BILLS THAT MOVED"); for (const e of d.mineMoves) { const b = D.sessions[sk].bills[e.k], p = posOf(sk + "|" + e.k), a = actionFor(p, bucket(e.to)); L.push(`- ${b.t} ${b.n}${p && POSN[p] ? " [" + POSN[p][1] + "]" : ""}: ${bucket(e.to)}. ${a ? a + " " : ""}${nice(titleOf(sk, e.k) || "")}`); } }
  if (d.big.length) { L.push("", "BIG NEWS STATEWIDE"); for (const e of d.big) { const b = D.sessions[sk].bills[e.k]; L.push(`- ${b.t} ${b.n}: ${bucket(e.to)}. ${nice(titleOf(sk, e.k) || "")}`); } }
  if (d.stalled.length) L.push("", "STALLED: " + d.stalled.map(k => D.sessions[sk].bills[k].t + " " + D.sessions[sk].bills[k].n).join(", "));
  L.push("", keyDates(), "Source: nmlegis.gov, data as of " + (D.generated ? fmtD(D.generated) : "unknown") + ". Confirm before acting.");
  return L.join("\n");
}
function briefSummary(d) {
  const n = d.mineMoves.length, law = d.mineMoves.filter(e => bucket(e.to) === "Signed into law").length, dead = d.mineMoves.filter(e => bucket(e.to) === "Died or tabled").length;
  const when = d.days === 1 ? "in the last 24 hours" : `in the last ${d.days} days`;
  if (!d.mine.size) return "You aren't following any bills yet. Star a bill and it will be tracked here.";
  const hh = briefHearings(d).mine.length;
  const bits = [`<b>${n} of your ${d.mine.size} bills moved</b> ${when}`];
  if (hh) bits.push(`${hh} hearing${hh === 1 ? "" : "s"} this week on your bills`);
  if (law) bits.push(`${law} became law`); if (dead) bits.push(`${dead} died`);
  return bits.join(" · ") + ".";
}
function renderBrief() {
  const d = briefData(), sk = d.sk, now = new Date(), hr = briefHearings(d); window._briefText = briefText(d, hr);
  const card = (e, mineRow) => {
    const k = e.k, b = D.sessions[sk].bills[k], t = titleOf(sk, k), p = posOf(sk + "|" + k), pl = p && POSN[p] ? POSN[p][1] : "", bk = bucket(e.to), act = mineRow ? actionFor(p, bk) : "", pln = PLAIN[bk] || "";
    return `<button class="br k-${STC[bk] || "mute"}" data-open="${esc(sk + "|" + k)}"><b>${b.t} ${b.n}</b>${pl ? ` <span class="pill" style="border-color:var(--red);color:var(--red)">${esc(pl)}</span>` : ""} <span class="pill kk k-${STC[bk] || "mute"}">${esc(bk)}</span>
<div class="t">${esc(t ? nice(t) : "")}</div>${act ? `<div class="act">${esc(act)}</div>` : ""}${act ? "" : `<div class="n">${esc(pln)}</div>`}<div class="meta">Official: ${esc(e.to)}${e.from ? ` · was: ${esc(e.from)}` : ""}</div></button>`;
  };
  const sec = (h, n, body) => body ? `<h2>${h} <small>${n}</small></h2>${body}` : "";
  const mineHtml = d.mineMoves.map(e => card(e, true)).join("");
  $("#brief").innerHTML = `<div class="sheet1">
<h1 class="big1">Daily brief <small>${now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</small></h1>
<div class="chips noprint">${[[1, "Last 24 hours"], [3, "3 days"], [7, "7 days"]].map(([n, l]) => `<button class="chip${d.days === n ? " on" : ""}" data-bdays="${n}">${l}</button>`).join("")}</div>
${!d.tracked ? `<div class="card">Status changes aren't being logged yet. They appear here after the first two nightly updates.</div>` : `<div class="lead">${briefSummary(d)}</div>`}
${hr.mine.length ? `<h2>Hearings on your bills this week <small>${hr.mine.length}</small></h2>` + hr.mine.map(({ h, mb }) => `<div class="br hear"><b>${fmtDay(h.d + "T12:00")}${h.t ? ", " + esc(h.t) : ""}</b>${h.tent ? ' <span class="pill">tentative</span>' : ""}<div class="t">${esc(h.c)}${h.room ? " · Room " + esc(h.room) : ""}</div>${mb.map(b => `<div class="n"><a href="#" data-open="${esc(sk + "|" + b.k)}">${esc(b.k)}</a> <span class="meta">${esc(nice(titleOf(sk, b.k) || b.t))}</span></div>`).join("")}</div>`).join("") : hr.have ? `<div class="note">No hearings posted this week for bills you follow. ${hr.other.length} other hearing${hr.other.length === 1 ? "" : "s"} posted. Agendas are often posted only a day ahead.</div>` : `<div class="note">Committee hearing schedules aren't loaded yet. They fill in after the nightly update reads the legislature's posted agendas.</div>`}
${sec("Your bills that moved", d.mineMoves.length, mineHtml)}
${sec("Big news statewide", d.big.length, d.big.map(e => card(e, false)).join(""))}
${sec("Followed bills that look stalled", d.stalled.length, d.stalled.map(k => { const b = D.sessions[sk].bills[k]; return `<button class="br" data-open="${esc(sk + "|" + k)}"><b>${b.t} ${b.n}</b> <span class="meta">no new documents since ${fmtD(b.last)}</span></button>`; }).join(""))}
<div class="note"><b>Key dates.</b> ${keyDates()}</div>
<div class="note">Data as of ${D.generated ? fmtD(D.generated) : "unknown"}, from nmlegis.gov. Confirm on the official site before acting.</div>
<div class="noprint" style="display:flex;gap:8px"><button class="btn pri big" data-print="1">Print</button><button class="btn big" data-copybrief="1">Copy as text for email</button></div></div>`;
}

/* ---------- what's new ---------- */
function justHappened(sk) {
  const c = (EXTRA[sk] || {}).changes, bills = D.sessions[sk].bills;
  if (!c) return "";
  const log = (c.log || []).filter(x => bills[x.k]).slice().reverse();
  const rows = log.slice(0, 40).map(x => {
    const b = bills[x.k], t = titleOf(sk, x.k), bk = bucket(x.to);
    const fromB = x.from ? bucket(x.from) : "";
    return `<button class="ev k-${STC[bk] || "mute"}" data-open="${esc(sk + "|" + x.k)}"><div style="flex:1;min-width:0"><b>${b.t} ${b.n}</b> <span class="pill kk k-${STC[bk] || "mute"}">${esc(bk)}</span> <span class="meta">${fmtD(x.d)}</span>
      <div class="t">${t ? esc(nice(t)) : ""}</div>
      <div style="margin-top:4px;font-size:15px"><b>Now:</b> ${esc(x.to)}</div>
      ${x.from ? `<div class="meta" style="margin-top:2px">Before: ${esc(x.from)}${fromB === bk ? "" : ""}</div>` : `<div class="meta" style="margin-top:2px">New on the legislature's list</div>`}</div></button>`;
  }).join("");
  const since = c.baseline ? fmtD(c.baseline) : "";
  return `<h2>Just happened <small>official status changes</small></h2>` + (rows || `<div class="card">No bill has changed status since tracking began${since ? " (" + since + ")" : ""}. This list fills in after each nightly update, newest first, showing what the status was and what it is now.</div>`);
}
function renderChanges() {
  const sk = S.cur, all = events(sk).filter(e => passes(sk, e.key, e.b));
  const anchor = all.length ? new Date(all[0].d).getTime() : Date.now();
  const cutoff = anchor - S.win * 864e5;
  const inWin = all.filter(e => S.win >= 9999 || new Date(e.d).getTime() >= cutoff);
  const gcount = {}; for (const e of inWin) { const g = KG[e.fo]; if (g) gcount[g] = (gcount[g] || 0) + 1; }
  const shownEv = inWin.filter(e => !S.groups.size || S.groups.has(KG[e.fo]));
  let banner = "";
  if (lastSeen) {
    const n = events(sk).filter(e => new Date(e.d) > new Date(lastSeen)).length;
    if (n) banner = `<div class="banner">${n} update${n > 1 ? "s" : ""} since your last visit (${fmtD(lastSeen)}).</div>`;
  }
  const days = []; let cur = null;
  for (const e of shownEv.slice(0, S.evShown)) {
    const day = e.d.slice(0, 10);
    if (!cur || cur.day !== day) days.push(cur = { day, items: [] });
    cur.items.push(e);
  }
  const html = days.map((g, i) => `<div class="day">${fmtDay(g.day + "T12:00")}${i === 0 && g.day === all[0]?.d.slice(0, 10) ? " · latest activity" : ""}</div>` + g.items.map(e => {
    const k = KIND[e.fo] || [e.fo, "mute"], id = e.sk + "|" + e.key;
    return `<button class="ev k-${k[1]}" data-open="${esc(id)}"><div style="flex:1;min-width:0"><b>${e.b.t} ${e.b.n}</b> <span class="pill kk k-${k[1]}">${esc(k[0])}${e.c > 1 ? " ×" + e.c : ""}</span> <span class="meta">${fmtT(e.d)}</span>
      <div class="t">${titleOf(sk, e.key) ? esc(nice(titleOf(sk, e.key))) : ""}</div></div></button>`;
  }).join("")).join("");
  $("#changes").innerHTML = `${banner}${justHappened(sk)}<h2 style="margin-top:20px">Documents posted <small>bill text, analyses, amendments</small></h2>`+`${calendarCard()}
    <div class="chips" style="margin-top:0">${[[7,"Last 7 days"],[30,"Last 30 days"],[9999,"Whole session"]].map(([d, l]) => `<button class="chip${S.win === d ? " on" : ""}" data-win="${d}">${l}</button>`).join("")}</div>
    <div class="meta" style="margin:-2px 0 8px">Counted back from the latest activity in ${esc(label(sk))}${all.length ? " (" + fmtD(all[0].d) + ")" : ""}.</div>
    <div class="tiles">${Object.entries(GROUPS).map(([g, [l, c]]) => `<button class="tile k-${c}${S.groups.size && !S.groups.has(g) ? " off" : ""}" data-group="${g}"><b>${gcount[g] || 0}</b><span>${l}</span></button>`).join("")}</div>
    ${topicBar()}
    ${html || `<div class="card">Nothing in this window.</div>`}
    ${shownEv.length > S.evShown ? `<button class="more" data-evmore="1">Show more (${shownEv.length - S.evShown} left)</button>` : ""}`;
}

/* ---------- pipeline ---------- */
function renderPipeline() {
  const sk = S.cur, saved = S.status; S.status = null;
  const bills = Object.entries(D.sessions[sk].bills).filter(([k, b]) => (b.t === "HB" || b.t === "SB") && passes(sk, k, b)); S.status = saved;
  const total = bills.length, withS = bills.filter(([k]) => statusOf(sk, k)).length, byStatus = total && withS >= 0.3 * total;
  let rows, list, head, note;
  if (byStatus) {
    const dist = {}; for (const [k] of bills) { const n = (statusOf(sk, k) || { bucket: "No status loaded" }).bucket; dist[n] = (dist[n] || 0) + 1; }
    const names = STATUS.map(x => x[0]).filter(n => dist[n]);
    if (!names.includes(S.pipeS)) S.pipeS = names[0];
    rows = names.map(n => `<button class="row k-${STC[n]}${S.pipeS === n ? " sel" : ""}" data-pipes="${esc(n)}"><span>${n}</span><div class="bar"><i style="width:${pct(dist[n], total)}%"></i></div><span class="v">${dist[n]} · ${pct(dist[n], total)}%</span></button>`).join("");
    list = bills.filter(([k]) => (statusOf(sk, k) || { bucket: "No status loaded" }).bucket === S.pipeS).sort((x, y) => y[1].last.localeCompare(x[1].last));
    head = S.pipeS;
    note = "Current legislative status, read from the legislature's own bill listing (grouped by keywords in its status text).";
  } else {
    const dist = STAGES.map(() => 0); for (const [, b] of bills) dist[stageOf(b)]++;
    if (typeof S.pipeS !== "number") S.pipeS = 0;
    rows = STAGES.map(([f, l, c], i) => `<button class="row k-${c}${S.pipeS === i ? " sel" : ""}" data-pipes="${i}"><span>${l}</span><div class="bar"><i style="width:${pct(dist[i], total)}%"></i></div><span class="v">${dist[i]} · ${pct(dist[i], total)}%</span></button>`).join("");
    list = bills.filter(([, b]) => stageOf(b) === S.pipeS).sort((x, y) => y[1].last.localeCompare(x[1].last));
    head = STAGES[S.pipeS][1];
    note = "The legislature's list page only gives official status for the current session, so for " + label(sk) + " this shows which documents were posted (introduced, fiscal report, committee action, votes, final text), not whether bills passed.";
  }
  $("#pipeline").innerHTML = `${topicBar()}
    <h2>${esc(label(sk))}: ${byStatus ? "where bills stand" : "how far bills got"} <small>${total} House + Senate bills</small></h2>
    <div class="card" style="padding:6px">${rows}<div class="note" style="padding:0 6px">${note}</div></div>
    <h2>${esc(String(head))} <small>${list.length} bills, newest first</small></h2>
    ${list.slice(0, S.shown).map(([k, b]) => billCard(sk, k, b)).join("") || `<div class="card">No bills here.</div>`}
    ${list.length > S.shown ? `<button class="more" data-more="1">Show more</button>` : ""}`;
}

/* ---------- topics ---------- */
function renderTopics() {
  const sk = S.cur, rows = {};
  for (const [key, b] of Object.entries(D.sessions[sk].bills)) {
    const t = topicOf(sk, key, b), r = rows[t] || (rows[t] = { n:0, hs:0, firs:0, final:0, votes:0, signed:0, known:0 });
    r.n++; if (b.t === "HB" || b.t === "SB") { r.hs++; if (b.f.firs) r.firs++; if (b.f.final) r.final++; if (b.f.votes) r.votes++; const st = statusOf(sk, key); if (st) { r.known++; if (st.bucket === "Signed into law") r.signed++; } }
  }
  const names = Object.keys(rows).filter(n => n !== PENDING).sort((a, b) => rows[b].n - rows[a].n), mx = Math.max(1, ...names.map(n => rows[n].n));
  const useSt = names.length && names.reduce((a, n) => a + rows[n].known, 0) >= 0.3 * names.reduce((a, n) => a + rows[n].hs, 0);
  const titled = Object.values(rows).reduce((a, r) => a + r.n, 0) - (rows[PENDING]?.n || 0), all = Object.values(rows).reduce((a, r) => a + r.n, 0);
  $("#topics").innerHTML = `<h2>Topics in ${esc(label(sk))} <small>${titled} of ${all} bills categorized</small></h2>
    <div class="card" style="padding:6px">${names.map(n => { const r = rows[n]; return `<button class="row" data-gotopic="${esc(n)}" style="grid-template-columns:128px 1fr 40px"><span>${esc(n)}</span><div class="bar"><i style="width:${pct(r.n, mx)}%"></i></div><span class="v">${r.n}</span></button>`; }).join("") || `<div class="note">No titles collected yet for this session.</div>`}</div>
    <h2>How each topic fares <small>House + Senate bills</small></h2>
    <div class="tbl card" style="padding:0"><table><tr><th>Topic</th><th>Bills</th><th>FIR</th><th>Votes</th><th>${useSt ? "Signed" : "Text"}</th></tr>
    ${names.map(n => { const r = rows[n]; return `<tr><td>${esc(n)}</td><td>${r.hs}</td><td>${pct(r.firs, r.hs)}%</td><td>${pct(r.votes, r.hs)}%</td><td>${useSt ? pct(r.signed, r.hs) : pct(r.final, r.hs)}%</td></tr>`; }).join("")}</table></div>
    <div class="note">${useSt ? "“Signed” is the share of bills the legislature lists as signed into law." : "“Text” is the share with a latest-text file posted; load official status to see how many were actually signed."} Topics come from keywords in each bill’s title, so they are approximate. Titles are collected a batch per night; ${rows[PENDING] ? rows[PENDING].n + " bills are still waiting." : "all bills in this session have titles."} Tap a topic to see its bills.</div>`;
}

/* ---------- bills ---------- */
const SYN = { gun:["firearm","weapon"], guns:["firearm","weapon"], weed:["cannabis","marijuana"], marijuana:["cannabis"], pot:["cannabis"], cops:["law enforcement","police"], police:["law enforcement"], jail:["corrections","detention"], prison:["corrections"], school:["education","public school"], schools:["education"], teachers:["educator","school personnel"], kids:["child","children"], cars:["motor vehicle"], dui:["driving while intoxicated","dwi"], taxes:["tax"], tax:["taxation","gross receipts"], rent:["landlord","tenant","housing"], pay:["salary","compensation"], abortion:["reproductive","pregnancy"], vote:["election","voting"], elections:["election"], water:["acequia","aquifer","groundwater"], oil:["oil and gas","petroleum"], gas:["oil and gas","natural gas"], medicaid:["health care authority"], doctors:["physician","health care provider"], guns2:[] };
const expand = w => [w, ...(SYN[w] || [])];
function renderBills() {
  const sks = S.all ? sessList() : [S.cur], words = S.q.toLowerCase().split(/\s+/).filter(Boolean), items = [];
  for (const sk of sks) for (const [key, b] of Object.entries(D.sessions[sk].bills)) {
    if (!passes(sk, key, b)) continue;
    if (words.length) { const hay = `${key} ${b.t} ${b.n} ${b.t}${b.n} ${shortTitle(sk, key)} ${longTitle(sk, key)} ${sponsorsOf(sk, key).join(" ")}`.toLowerCase(); if (!words.every(w => expand(w).some(x => hay.includes(x)))) continue; }
    items.push([sk, key, b]);
  }
  items.sort((x, y) => y[2].last.localeCompare(x[2].last));
  S._items = items;
  const stageChips = STAGES.slice(1).map(([f, l]) => `<button class="chip${S.stages.has(f) ? " on" : ""}" data-stage="${f}">Has ${l.replace(" posted", "").replace("Fiscal report", "FIR").toLowerCase().replace(/^fir$/, "FIR")}</button>`).join("");
  const sgCount = {}; for (const [k, b] of Object.entries(D.sessions[S.cur].bills)) { const g = sgOf(S.cur, k); if (g) sgCount[g] = (sgCount[g] || 0) + 1; }
  const tcount = {}; for (const [k, b] of Object.entries(D.sessions[S.cur].bills)) { const t = topicOf(S.cur, k, b); tcount[t] = (tcount[t] || 0) + 1; }
  const subjects = TOPIC_NAMES.concat([PENDING]).filter(n => tcount[n]);
  const active = S.q || S.sg || S.status || S.topic || S.types.size || S.stages.size || S.pos || S.onlyW || S.dummy !== "all";
  $("#bills").innerHTML = `<h1 class="big1">Find a bill</h1>
    <input id="q" type="search" placeholder="Bill number or subject" value="${esc(S.q)}" autocomplete="off" style="font-size:19px;padding:14px;border-radius:14px;border-width:2px">
    ${Object.keys(sgCount).length ? `<div class="chips scroll"><button class="chip${!S.sg ? " on" : ""}" data-sg="">Any status</button>${SG.map(([n]) => `<button class="chip${S.sg === n ? " on" : ""}" data-sg="${esc(n)}">${n}<i>${sgCount[n] || 0}</i></button>`).join("")}</div>` : ""}
    <div class="flt" style="margin:6px 0"><select id="subj" aria-label="Subject"><option value="">All subjects</option>${subjects.map(n => `<option value="${esc(n)}"${S.topic === n ? " selected" : ""}>${esc(n)} (${tcount[n]})</option>`).join("")}</select></div>
    <details class="card flt"><summary>More filters</summary>
      ${topicBar()}
      <div class="chips scroll">${TYPES.map(t => `<button class="chip${S.types.has(t) ? " on" : ""}" data-type="${t}">${t}</button>`).join("")}</div>
      <div class="chips scroll">${stageChips}</div>
      ${Object.values(N).some(x => x.pos) ? `<div class="chips scroll">${POS.map(([v, l]) => `<button class="chip${S.pos === v ? " on" : ""}" data-pospick="${v}">${l}</button>`).join("")}</div>` : ""}
      <div class="chips"><button class="chip${S.all ? " on" : ""}" data-opt="all">Search all years</button><button class="chip${S.onlyW ? " on" : ""}" data-opt="w">★ Following only</button><button class="btn" data-csv="1">Download CSV</button></div>
    </details>
    <div class="meta" style="display:flex;justify-content:space-between;align-items:center"><span>${items.length.toLocaleString()} bill${items.length === 1 ? "" : "s"}${S.all && S.q ? " across all years" : ""}${S.sg ? " · " + esc(S.sg) : ""}</span>${active ? `<button class="btn" data-clear="1" style="min-height:34px;padding:2px 12px">Clear all</button>` : ""}</div>
    <div style="margin-top:8px">${items.slice(0, S.shown).map(([sk, k, b]) => billCard(sk, k, b)).join("") || `<div class="card"><b>No bills match.</b><br>Try fewer words, or tap Clear all.</div>`}${items.length > S.shown ? `<button class="more" data-more="1">Show more</button>` : ""}</div>`;
  const sel = $("#subj"); if (sel) sel.onchange = e => { S.topic = e.target.value || null; S.shown = 40; renderBills(); };
  const q = $("#q"); q.addEventListener("input", e => { S.q = e.target.value; S.shown = 40; const pos = e.target.selectionStart; renderBills(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); });
}


/* ---------- committees: what is waiting where, and what is on an agenda ---------- */
const MYCM = new Set(ls.get("mycm", []));
const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
function nextHearings(sk) {   // bill key -> earliest upcoming hearing it is listed on
  const m = {}, t0 = todayISO();
  for (const h of schedOf(sk).slice().sort((a, b) => (a.d + (a.t || "")).localeCompare(b.d + (b.t || "")))) {
    if (h.d < t0) continue;
    for (const b of h.bills || []) if (!m[b.k]) m[b.k] = h;
  }
  return m;
}
function hearLine(h) { return `${fmtD(h.d + "T12:00:00")}${h.t ? ", " + esc(h.t) : ""}${h.room ? ", Room " + esc(h.room) : ""}${h.tent ? " (tentative)" : ""}`; }
function committeeData(sk) {
  const bills = D.sessions[sk].bills, sch = nextHearings(sk), have = schedOf(sk).length > 0, out = {}, unassigned = [];
  for (const [key, b] of Object.entries(bills)) {
    if (b.t !== "HB" && b.t !== "SB" && !/^[HS](JR|JM|M|R)$/.test(b.t)) continue;
    const s = (EXTRA[sk].status || {})[key]; if (!s || !s.status) continue;
    const p = parseStatus(s.status);
    if (p.unassigned) { unassigned.push(key); continue; }
    if (!p.cur) continue;
    const c = out[p.cur] = out[p.cur] || { code: p.cur, all: [], sched: [], wait: [] };
    c.all.push(key); (sch[key] ? c.sched : c.wait).push(key);
  }
  return { out, unassigned, sch, have };
}
function cmBills(sk, keys, sch, why) {
  const bills = D.sessions[sk].bills;
  return keys.map(k => billCard(sk, k, bills[k])).join("") || `<div class="card">None.</div>`;
}
function renderCommittees() {
  const sk = S.cur, el = $("#committees");
  if (!EXTRA[sk]) { el.innerHTML = `<h1 class="big1">By committee</h1><div class="card">Loading…</div>`; loadExtra(sk).then(() => { if (S.tab === "committees") renderCommittees(); }); return; }
  const cd = committeeData(sk), q = S.cq.trim().toLowerCase();
  const list = Object.values(cd.out).filter(c => !q || c.code.toLowerCase().includes(q) || cmName(c.code).toLowerCase().includes(q))
    .sort((a, b) => (MYCM.has(b.code) - MYCM.has(a.code)) || b.wait.length - a.wait.length || a.code.localeCompare(b.code));
  const live = isReg(sk) && sk === sessList().find(isReg);
  const note = !cd.have ? `<div class="note" style="margin-bottom:10px"><b>Hearing schedules are not loaded yet</b>, so "not scheduled" cannot be told apart from "not posted yet". They load automatically once agendas are published.</div>` : "";
  if (S.cm && cd.out[S.cm]) {
    const c = cd.out[S.cm], bills = D.sessions[sk].bills;
    const hearings = schedOf(sk).filter(h => h.d >= todayISO() && h.bills && h.bills.some(b => c.sched.includes(b.k))).sort((a, b) => a.d.localeCompare(b.d));
    el.innerHTML = `<button class="btn back" data-cm="">← All committees</button><h1 class="big1">${esc(cmName(c.code))} <small>${esc(c.code)}</small></h1>
      <button class="chip${MYCM.has(c.code) ? " on" : ""}" data-mycm="${esc(c.code)}">${MYCM.has(c.code) ? "★ My committee" : "☆ Mark as my committee"}</button>${note}
      <h2>Waiting, not on an agenda <small>${c.wait.length}</small></h2>${cd.have ? "" : ""}
      ${c.wait.length ? c.wait.sort((a, b) => bills[b].last.localeCompare(bills[a].last)).map(k => billCard(sk, k, bills[k])).join("") : `<div class="card">Nothing is waiting without a hearing.</div>`}
      <h2>On a posted agenda <small>${c.sched.length}</small></h2>
      ${hearings.map(h => `<div class="card"><b>${hearLine(h)}</b><div class="meta">${esc(h.c || "")}</div></div>`).join("")}
      ${c.sched.map(k => `<div class="meta" style="margin:8px 2px 0">Hearing: ${hearLine(cd.sch[k])}</div>` + billCard(sk, k, bills[k])).join("") || `<div class="card">No bills here are on a posted agenda.</div>`}`;
    return;
  }
  el.innerHTML = `<button class="btn back" data-tab="home">← Home</button><h1 class="big1">By committee</h1>
    <input id="cq" type="search" placeholder="Committee name or code, e.g. Finance, SJC" value="${esc(S.cq)}" autocomplete="off" style="font-size:19px;padding:14px;border-radius:14px;border-width:2px">
    ${note}${live ? "" : `<div class="note" style="margin-top:8px">Committee positions are only meaningful for the current session. This is ${esc(label(sk))}.</div>`}
    <div class="bigtiles" style="margin-top:12px"><button class="bt" data-cmlist="unassigned"><b style="font-size:26px">${cd.unassigned.length}</b><span>Not assigned to a committee yet</span></button>
    <button class="bt" data-cmlist="unsched"><b style="font-size:26px">${Object.values(cd.out).reduce((n, c) => n + c.wait.length, 0)}</b><span>${cd.have ? "In committee, no hearing posted" : "In a committee"}</span></button></div>
    <h2>Committees <small>${list.length}</small></h2>
    ${list.map(c => `<button class="ev k-${c.sched.length ? "turq" : "gold"}" data-cm="${esc(c.code)}"><div style="flex:1;min-width:0"><b>${MYCM.has(c.code) ? "★ " : ""}${esc(cmName(c.code))}</b> <span class="meta">${esc(c.code)}</span>
      <div class="meta" style="margin-top:3px">${c.all.length} bill${c.all.length === 1 ? "" : "s"}${cd.have ? ` · <b>${c.wait.length}</b> waiting for a hearing · ${c.sched.length} on an agenda` : ""}</div></div></button>`).join("") || `<div class="card">No committee matches. Try a shorter word.</div>`}`;
  const qi = $("#cq"); if (qi) qi.addEventListener("input", e => { S.cq = e.target.value; const p = e.target.selectionStart; renderCommittees(); const n = $("#cq"); n.focus(); n.setSelectionRange(p, p); });
}
function renderCmList() {
  const sk = S.cur, cd = committeeData(sk), bills = D.sessions[sk].bills, el = $("#committees");
  const keys = S.cmlist === "unassigned" ? cd.unassigned : Object.values(cd.out).flatMap(c => c.wait);
  keys.sort((a, b) => bills[b].last.localeCompare(bills[a].last));
  el.innerHTML = `<button class="btn back" data-cmlist="">← By committee</button><h1 class="big1">${S.cmlist === "unassigned" ? "Not assigned to a committee yet" : "In committee, no hearing posted"} <small>${keys.length}</small></h1>
   ${S.cmlist !== "unassigned" && !cd.have ? `<div class="note">Hearing schedules are not loaded, so this lists every bill sitting in a committee.</div>` : ""}
   ${keys.slice(0, S.shown).map(k => { const p = parseStatus(EXTRA[sk].status[k].status); return (p.cur ? `<div class="meta" style="margin:8px 2px 0">At ${esc(cmShort(p.cur))}</div>` : "") + billCard(sk, k, bills[k]); }).join("") || `<div class="card">None.</div>`}
   ${keys.length > S.shown ? `<button class="more" data-more="1">Show more</button>` : ""}`;
}
function cmLineFor(sk, key) {   // one line for a bill: where it is, and whether it is on an agenda
  const st = ((EXTRA[sk] || {}).status || {})[key]; if (!st || !st.status) return "";
  const p = parseStatus(st.status); if (!p.live || !isReg(sk)) return "";
  const have = schedOf(sk).length > 0, h = nextHearings(sk)[key];
  if (p.unassigned) return `<div class="note" style="margin:6px 0"><b>Not assigned to a committee yet.</b></div>`;
  if (!p.cur) return "";
  const nx = p.rest.length ? ` Then: ${p.rest.map(cmShort).map(esc).join(", ")}.` : "";
  return `<div class="note" style="margin:6px 0"><b>In ${esc(cmName(p.cur))}.</b> ${h ? `On an agenda: <b>${hearLine(h)}</b>.` : have ? "<b>Not on any posted agenda.</b>" : "Hearing schedules are not loaded."}${nx} <a href="#" data-cm="${esc(p.cur)}" data-tab="committees">See this committee</a></div>`;
}

/* ---------- years ---------- */
function barChart(data, sel, fmt) {
  const Wd = Math.max(320, data.length * 16), H = 120, bw = Wd / data.length, mx = Math.max(1, ...data.map(d => d.v));
  let s = `<svg class="chart" viewBox="0 0 ${Wd} ${H + 20}">`;
  data.forEach((d, i) => {
    const h = d.v / mx * (H - 16);
    s += `<g data-s="${esc(d.k)}" style="cursor:pointer"><rect x="${i*bw+1}" y="${H-h}" width="${bw-2}" height="${h}" rx="2" class="cb${d.k === sel ? " sel" : ""}"/><rect x="${i*bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>`;
    if (i % 3 === 0 || d.k === sel) s += `<text x="${i*bw+bw/2}" y="${H+14}" text-anchor="middle" class="ax">'${String(d.y).slice(2)}</text>`;
    if (d.k === sel) s += `<text x="${Math.min(Math.max(i*bw+bw/2, 16), Wd-16)}" y="${H-h-3}" text-anchor="middle" class="ax">${fmt(d.v)}</text>`;
    s += "</g>";
  });
  return s + "</svg>";
}
function renderYears() {
  const regs = sessList().filter(isReg).reverse();
  const M = { n:["Measures introduced", k => stats(k).all, v => v], fir:["Bills with a fiscal report", k => pct(stats(k).c.firs, stats(k).hs), v => v + "%"],
              votes:["Bills with vote records", k => pct(stats(k).c.votes, stats(k).hs), v => v + "%"], final:["Bills with latest text posted", k => pct(stats(k).c.final, stats(k).hs), v => v + "%"] };
  const m = M[S.metric], key = { fir:"firs", votes:"votes", final:"final" }[S.metric];
  const data = regs.filter(k => !key || stats(k).a[key]).map(k => ({ k, y: D.sessions[k].y, v: m[1](k) }));
  const rows = sessList().map(k => { const st = stats(k), p = f => st.a[f] ? pct(st.c[f], st.hs) + "%" : "–";
    return `<tr class="${k === S.cur ? "sel" : ""}"><td><a href="#" data-s="${esc(k)}">${esc(label(k))}</a></td><td>${st.hs}</td><td>${st.all - st.hs}</td><td>${p("firs")}</td><td>${p("Committee_Subs_And_Amendments")}</td><td>${p("votes")}</td><td>${p("final")}</td></tr>`; }).join("");
  const heatS = regs.slice(-8).filter(k => { const ks = Object.keys(D.sessions[k].bills); return ks.filter(x => titleOf(k, x)).length >= 0.2 * ks.length; });
  const share = {}; for (const k of heatS) { const c = {}; let n = 0; for (const [key, b] of Object.entries(D.sessions[k].bills)) { const t = topicOf(k, key, b); if (t === PENDING) continue; c[t] = (c[t] || 0) + 1; n++; } share[k] = { c, n }; }
  const hnames = TOPIC_NAMES.filter(n => heatS.some(k => share[k].c[n]));
  $("#years").innerHTML = `<h2>Across every session <small>tap a bar to open it</small></h2>
    <div class="chips scroll">${Object.entries(M).map(([id, [l]]) => `<button class="chip${S.metric === id ? " on" : ""}" data-metric="${id}">${l}</button>`).join("")}</div>
    ${analyticsCard()}
<div class="card">${barChart(data, S.cur, m[2])}<div class="note">Regular sessions only. Even-year sessions are 30 days and mostly limited to the budget and governor-called items. A missing bar means that document type isn’t posted for that session.</div></div>
    ${heatS.length >= 2 ? `<h2>Topic mix <small>share of titled bills</small></h2><div class="tbl card" style="padding:0"><table><tr><th>Topic</th>${heatS.map(k => `<th>'${String(D.sessions[k].y).slice(2)}</th>`).join("")}</tr>
      ${hnames.map(n => `<tr><td>${esc(n)}</td>${heatS.map(k => { const v = share[k].n ? (share[k].c[n] || 0) / share[k].n : 0; return `<td class="h" style="background:rgba(191,10,48,${Math.min(.55, v * 2.2).toFixed(2)})">${Math.round(v * 100)}%</td>`; }).join("")}</tr>`).join("")}</table></div>
      <div class="note">Only sessions with titles for at least a fifth of their bills are shown; more years appear as titles are collected.</div>` : ""}
    <h2>Every session on the server</h2>
    <div class="tbl card" style="padding:0"><table><tr><th>Session</th><th>Bills</th><th>Res/Mem</th><th>FIR</th><th>Cmte</th><th>Votes</th><th>Text</th></tr>${rows}</table></div>
    <div class="note">Bills = House and Senate bills. “–” means the document type isn’t posted for that session.</div>`;
}

/* ---------- detail sheet ---------- */
function whereStuck(sk, key, b) {
  const s = statusOf(sk, key), out = [];
  if (s) {
    const days = Math.floor((Date.now() - new Date(b.last)) / 864e5);
    if (["In committee", "On the floor", "Pending or other"].includes(s.bucket) && days >= 14 && sk === sessList().find(isReg)) out.push(`<b>No new documents for ${days} days.</b> It may be stalled.`);
  }
  return out.length ? `<div class="note" style="margin:6px 0">${out.join("<br>")}</div>` : "";
}
function companions(sk, key) {
  const t = longTitle(sk, key); if (!t) return [];
  const norm = x => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  return Object.keys(D.sessions[sk].bills).filter(k => k !== key && longTitle(sk, k) && norm(longTitle(sk, k)) === norm(t));
}
function rewritten(sk, key) { const v = ((EXTRA[sk] || {}).versions || {})[key]; return !!(v && !v.missing && v.sim < 0.35); }
async function openBill(id) {
  const [sk, key] = id.split("|"), b = D.sessions[sk].bills[key], title = titleOf(sk, key), tp = topicOf(sk, key, b), url = billUrl(sk, b);
  const folders = Object.keys(b.f).sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99));
  const docs = folders.map(f => { const k = KIND[f] || [f, "mute"]; return `<div class="doc"><span class="pill kk k-${k[1]}">${esc(k[0])}${b.f[f].c > 1 ? " ×" + b.f[f].c : ""}${f === "bills" && b.f[f].s ? " + committee sub" : ""}</span><span class="meta">${fmtD(b.f[f].d)}</span><a href="${BASE + b.f[f].u}" target="_blank" rel="noopener noreferrer">Open PDF</a></div>`; }).join("");
  $("#panel").innerHTML = `<div style="display:flex;justify-content:space-between"><h3>${b.t} ${b.n} <span class="sess">${esc(label(sk))}</span></h3><button class="btn" data-close="1">Close</button></div>
    <div class="meta">Last activity ${fmtD(b.last)}${tp && tp !== PENDING ? " · " + esc(tp) : ""}</div>
    <div style="margin:6px 0">${(() => { const s = statusOf(sk, key); return s ? `<span class="meta">Official status line:</span> <span style="font-size:14px">${esc(s.text)}</span>` : `<span class="meta">Official status not loaded yet for this session. The documents below show what has been posted, not whether the bill passed.</span>`; })()}</div>
    <p style="margin:8px 0">${title ? esc(nice(title)) : "Title not collected yet."}</p>
${(() => { const sp = sponsorsOf(sk, key); return sp.length ? `<div class="meta" style="margin-bottom:6px">Sponsor${sp.length > 1 ? "s" : ""}: ${sp.map((n, i) => `<a href="#" data-sponsor="${esc(n)}">${esc(n)}</a>${legInfo(n) ? " <span class=\"meta\">" + esc(legInfo(n).p + "-" + legInfo(n).c + legInfo(n).d) + "</span>" : ""}${i === 0 && sp.length > 1 ? " (lead)" : ""}`).join(", ")}</div>` : ""; })()}
${(() => { const pl = plainOf(sk, key, b); return `<div class="plain k-${pl.bucket ? STC[pl.bucket] : "mute"}"><b>${pl.bucket ? esc(pl.bucket) : "Status not loaded"}</b>${esc(pl.line)}</div>`; })()}${cmLineFor(sk, key)}${whereStuck(sk, key, b)}
    ${shortTitle(sk, key) && longTitle(sk, key) ? `<div class="note">Official title: ${esc(nice(longTitle(sk, key)))}</div>` : ""}
${(() => { const d = dummyOf(sk, key, b); return d ? `<div class="banner"><b>${dummyTag(d)}.</b> The introduced text is only about ${d.words} words${d.blanks ? " with blank placeholders" : ""}, so it was filed as a placeholder.${d.sub ? " A committee substitute was posted later; the real content is in the substitute, not the introduced bill." : " No committee substitute is posted yet."}</div>` : ""; })()}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn big${W.has(id) ? " pri" : ""}" data-w2="${esc(id)}">${W.has(id) ? "★ Following" : "☆ Follow"}</button>${url ? `<a class="btn" href="${url}" target="_blank" rel="noopener noreferrer">Official bill page</a>` : ""}</div>
    <div style="margin-top:8px"><button class="btn" data-share="1">Copy link to this bill</button></div><div id="notes"></div>
<details class="card" style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Documents (${folders.length})</summary>${docs}</details><div id="extra"></div><div id="simil"></div>`;
  $("#sheet").classList.add("on"); renderNotes(id); try { history.replaceState(null, "", "#b=" + encodeURIComponent(id)); } catch {}
  const x = await loadExtra(sk), m = x.meta[key], am = x.amend[key] || x.amend[b.t + b.n];
  let h = voteHtml(sk, key);
  if (m && (m.sponsors || m.location || m.actions)) h += `<h2>From the bill page</h2>${m.location ? `<div class="meta">Current location: <b>${esc(m.location)}</b></div>` : ""}${m.sponsors ? `<div class="meta">Sponsors: ${esc(m.sponsors.join(", "))}</div>` : ""}${(m.actions || []).map(a => `<div class="doc"><span class="meta">${esc(a.date)}</span><span style="flex:1;text-align:right">${esc(a.text)}</span></div>`).join("")}`;
  if (am) h += `<h2>Amendment language <small>${am.length} document${am.length > 1 ? "s" : ""}</small></h2>` + am.map(a => `<div class="snip"><b>${a.k === "cs" ? "Committee sub/amendment" : a.k === "fa" ? "Floor amendment" : "In context"}</b> · ${a.w} words · ${a.x} strike / ${a.i} insert<br>${(a.s || []).map(esc).join("<br>")}<br><a href="${BASE + a.f}" target="_blank" rel="noopener noreferrer">Open PDF</a></div>`).join("");
  const vs = (x.versions || {})[key];
  if (vs && !vs.missing) h += `<h2>How the bill changed <small>introduced vs latest text</small></h2><div class="meta">${vs.iw.toLocaleString()} words introduced → ${vs.fw.toLocaleString()} words now · ${vs.add.toLocaleString()} added, ${vs.rem.toLocaleString()} removed · ${Math.round(vs.sim * 100)}% unchanged</div>`
    + (vs.sim >= 0.98 ? `<div class="note">Essentially unchanged since introduction.</div>` : vs.sim < 0.35 ? `<div class="note">Largely rewritten since introduction.</div>` : "")
    + (vs.sn || []).map(([k, t]) => `<div class="snip"><b style="color:${k === "+" ? "var(--turq)" : "var(--red)"}">${k === "+" ? "Added" : "Removed"}</b> ${esc(t)}</div>`).join("");
  $("#extra").innerHTML = h;
  const sim = similar(sk, key);
  $("#simil").innerHTML = (companions(sk, key).length ? `<div class="note">Companion bill${companions(sk, key).length > 1 ? "s" : ""} with the same title: ${companions(sk, key).map(k => `<a href="#" data-open="${esc(sk + "|" + k)}">${D.sessions[sk].bills[k].t} ${D.sessions[sk].bills[k].n}</a>`).join(", ")}</div>` : "") + `<h2>Similar bills in other years</h2>` + (sim === null ? `<div class="note">This bill’s title hasn’t been collected yet.</div>` : sim.length ? sim.map(r => { const bb = D.sessions[r.sk].bills[r.key], f = bb.f.bills || bb.f[Object.keys(bb.f)[0]]; return `<div class="doc"><a href="${BASE + f.u}" target="_blank" rel="noopener noreferrer">${esc(label(r.sk))} ${bb.t} ${bb.n}</a><span style="flex:1;text-align:right;font-size:13px">${esc(nice(r.title).slice(0, 120))}</span></div>`; }).join("") + `<div class="note">Matched by title. Bill numbers restart every session.</div>` : `<div class="note">No close matches among the titles collected so far.</div>`);
}
const STOP = new Set("relating the and for with new mexico act providing making amending enacting repealing authorizing requiring creating relates state fund funds certain".split(" "));
const tokens = t => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
function similar(sk, key) {
  const t = longTitle(sk, key); if (!t) return null;
  const a = tokens(t), res = []; if (a.size < 2) return res;
  for (const [k2, m] of Object.entries(T)) { if (k2 === sk || !D.sessions[k2]) continue;
    for (const [key2, title] of Object.entries(m)) { if (!title || !D.sessions[k2].bills[key2]) continue;
      const b = tokens(title); let n = 0; for (const w of a) if (b.has(w)) n++;
      if (n < 2) continue; const sc = n / (a.size + b.size - n); if (sc >= 0.3) res.push({ sk: k2, key: key2, title, sc }); } }
  return res.sort((x, y) => y.sc - x.sc).slice(0, 6);
}
function csv() {
  const rows = [["session", "bill", "topic", "title", "stage", "last_activity", "documents"]];
  for (const [sk, key, b] of S._items || []) rows.push([label(sk), b.t + " " + b.n, topicOf(sk, key, b), titleOf(sk, key), STAGES[stageOf(b)][1], b.last, Object.keys(b.f).join("; ")]);
  const blob = new Blob([rows.map(r => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "nm-bills.csv"; a.click();
}

/* ---------- plumbing ---------- */
function render() {
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab || (b.dataset.tab === "home" && ["changes", "pipeline", "topics", "years", "brief", "committees"].includes(S.tab))));
  document.querySelectorAll("section").forEach(s => s.classList.toggle("on", s.id === S.tab));
  $("#yr").style.visibility = S.tab === "years" ? "hidden" : "visible";
  $("#yrl").textContent = D.sessions[S.cur].y + (isReg(S.cur) ? "" : " " + kindName(S.cur));
  ({ changes: renderChanges, pipeline: renderPipeline, topics: renderTopics, bills: renderBills, people: renderPeople, years: renderYears, home: renderHome, following: renderFollowing, brief: renderBrief, committees: () => (S.cmlist ? renderCmList() : renderCommittees()) })[S.tab]();
  if (["changes", "pipeline", "topics", "years", "brief"].includes(S.tab)) $("#" + S.tab).insertAdjacentHTML("afterbegin", backBar());
}
const go = t => { S.tab = t; S.shown = 40; render(); scrollTo(0, 0); };
document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab],[data-sg],[data-aa],[data-clear],[data-pos],[data-brief],[data-print],[data-bdays],[data-copybrief],[data-share],[data-backup],[data-copy],[data-pospick],[data-person],[data-s],[data-topic],[data-win],[data-group],[data-pipes],[data-st],[data-dummy],[data-gotopic],[data-type],[data-stage],[data-opt],[data-w],[data-w2],[data-open],[data-more],[data-evmore],[data-metric],[data-csv],[data-close],[data-cm],[data-cmlist],[data-mycm],[data-sponsor]");
  if (!t) { if (e.target.id === "sheet") $("#sheet").classList.remove("on"); return; }
  const d = t.dataset;
  if (t.tagName === "A" && !t.target) e.preventDefault();
  if (d.copybrief !== undefined) { const txt = window._briefText || ""; const ok = m => { t.textContent = m; }; try { navigator.clipboard.writeText(txt).then(() => ok("Copied. Paste it into an email."), () => { ok("Copy blocked: select text below"); t.insertAdjacentHTML("afterend", `<textarea readonly style="width:100%;height:160px">${esc(txt)}</textarea>`); }); } catch { ok("Copy not available"); } return; }
  if (d.print !== undefined) { window.print(); return; }
  if (d.bdays !== undefined) { S.briefDays = +d.bdays; render(); return; }
  if (d.share !== undefined) { const u = location.href; const ok = () => { t.textContent = "Link copied"; }; try { navigator.clipboard.writeText(u).then(ok, () => { t.textContent = "Copy it from the address bar"; }); } catch { t.textContent = "Copy it from the address bar"; } return; }
  if (d.backup !== undefined) { const txt = JSON.stringify({ stars: [...W], notes: N }); const done = ok => { t.textContent = ok ? "Copied. Paste it into Notes or an email to yourself." : "Copy blocked: select the text below"; if (!ok) t.insertAdjacentHTML("afterend", `<textarea readonly style="width:100%;height:90px">${esc(txt)}</textarea>`); }; try { navigator.clipboard.writeText(txt).then(() => done(true), () => done(false)); } catch { done(false); } return; }
  if (d.w !== undefined) { e.stopPropagation(); W.has(d.w) ? W.delete(d.w) : W.add(d.w); ls.set("w", [...W]); t.classList.toggle("on"); return; }
  if (d.w2 !== undefined) { W.has(d.w2) ? W.delete(d.w2) : W.add(d.w2); ls.set("w", [...W]); t.textContent = W.has(d.w2) ? "★ Following" : "☆ Follow"; t.classList.toggle("pri"); return; }
  if (d.pos !== undefined) { const o = N[d.pid] = N[d.pid] || {}; o.pos = o.pos === d.pos ? "" : d.pos; if (!o.pos && !o.tag && !o.note) delete N[d.pid]; saveN(); renderNotes(d.pid); return; }
  if (d.brief !== undefined) return openBrief();
  if (d.copy !== undefined) { const ta = $("#brieft"); ta.select(); try { navigator.clipboard.writeText(ta.value).then(() => { $("#copied").textContent = "Copied"; }).catch(() => { $("#copied").textContent = "Select and copy the text above"; }); } catch { $("#copied").textContent = "Select and copy the text above"; } return; }
  if (d.pospick !== undefined) { S.pos = (S.pos === d.pospick || !d.pospick) ? "" : d.pospick; S.shown = 40; return render(); }
  if (d.person !== undefined) { S.person = d.person || null; S.shown = 40; render(); scrollTo(0, 0); return; }
  if (d.aa !== undefined) { document.body.classList.toggle("big"); ls.set("big", document.body.classList.contains("big")); return; }
  if (d.sg !== undefined) { if (d.tab === undefined) { S.sg = d.sg; S.status = null; S.topic = null; S.q = ""; return go("bills"); } }
  if (d.clear !== undefined) { S.q = ""; S.sg = ""; S.status = null; S.topic = null; S.types.clear(); S.stages.clear(); S.pos = ""; S.onlyW = false; S.dummy = "all"; S.shown = 40; return render(); }
  if (d.sponsor !== undefined) { S.person = d.sponsor; S.shown = 40; S.tab = "people"; $("#sheet").classList.remove("on"); render(); scrollTo(0, 0); return; }
  if (d.mycm !== undefined) { MYCM.has(d.mycm) ? MYCM.delete(d.mycm) : MYCM.add(d.mycm); ls.set("mycm", [...MYCM]); return render(); }
  if (d.cmlist !== undefined) { S.cmlist = d.cmlist; S.cm = ""; S.shown = 40; S.tab = "committees"; $("#sheet").classList.remove("on"); render(); scrollTo(0, 0); return; }
  if (d.cm !== undefined) { S.cm = d.cm; S.cmlist = ""; S.tab = "committees"; $("#sheet").classList.remove("on"); render(); scrollTo(0, 0); return; }
  if (d.close !== undefined) return $("#sheet").classList.remove("on");
  if (d.open) return openBill(d.open);
  if (d.tab) return go(d.tab);
  if (d.s) { setSession(d.s); return; }
  if (d.topic !== undefined) { S.topic = d.topic || null; S.shown = 40; S.evShown = 50; return render(); }
  if (d.gotopic) { S.topic = d.gotopic; return go("bills"); }
  if (d.win) { S.win = +d.win; S.evShown = 50; return render(); }
  if (d.group) { S.groups.has(d.group) ? S.groups.delete(d.group) : S.groups.add(d.group); S.evShown = 50; return render(); }
  if (d.dummy !== undefined) { S.dummy = d.dummy; S.shown = 40; S.evShown = 50; return render(); }
  if (d.st !== undefined) { S.status = S.status === d.st ? null : d.st; S.shown = 40; return render(); }
  if (d.pipes !== undefined) { S.pipeS = /^\d+$/.test(d.pipes) ? +d.pipes : d.pipes; S.shown = 40; return render(); }
  if (d.type) { S.types.has(d.type) ? S.types.delete(d.type) : S.types.add(d.type); S.shown = 40; return render(); }
  if (d.stage) { S.stages.has(d.stage) ? S.stages.delete(d.stage) : S.stages.add(d.stage); S.shown = 40; return render(); }
  if (d.opt) { if (d.opt === "all") S.all = !S.all; else S.onlyW = !S.onlyW; S.shown = 40; return render(); }
  if (d.more) { S.shown += 40; return render(); }
  if (d.evmore) { S.evShown += 50; return render(); }
  if (d.metric) { S.metric = d.metric; return render(); }
  if (d.csv) return csv();
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.open) { e.preventDefault(); openBill(e.target.dataset.open); } if (e.key === "Escape") $("#sheet").classList.remove("on"); });
async function setSession(k) {
  S.cur = k; $("#sess").value = k; S.topic = null; S.status = null; S.sg = ""; S.pipeS = null; S.person = null; S.pq = ""; S.pos = ""; S.dummy = "all"; S.shown = 40; S.evShown = 50;
  if (S.tab === "years") S.tab = "home";
  await loadExtra(k); render(); scrollTo(0, 0);
}
$("#sess").addEventListener("change", e => setSession(e.target.value));
$("#yr").addEventListener("click", () => openPicker());
const KIND_NAME = { Regular: "Regular", Special: "Special", Special2: "Special 2", Special3: "Special 3", Extraordinary: "Extraordinary" };
const kindName = k => { const x = k.replace(/^\d+\s*/, ""); return KIND_NAME[x] || x; };
function openPicker() {
  const list = sessList(), by = {};
  for (const k of list) (by[D.sessions[k].y] = by[D.sessions[k].y] || []).push(k);
  const ord = k => ({ Regular: 0, Special: 1, Special2: 2, Special3: 3, Extraordinary: 4 }[k.replace(/^\d+\s*/, "")] ?? 9);
  const years = Object.keys(by).map(Number).sort((x, y) => y - x);
  $("#pk").innerHTML = `<h4>Choose a session</h4>` + years.map(y => `<div class="pr"><span class="py">${y}</span><div class="pc">${by[y].sort((x, z) => ord(x) - ord(z)).map(k =>
    `<button class="${k === S.cur ? "on" : ""}${isReg(k) ? "" : " sp2"}" data-pks="${esc(k)}">${esc(kindName(k))}</button>`).join("")}</div></div>`).join("");
  $("#picker").classList.add("on");
  const on = $("#pk .on"); if (on) on.scrollIntoView({ block: "center" });
}
document.addEventListener("click", e => {
  const s = e.target.closest("[data-pks]");
  if (s) { e.stopPropagation(); $("#picker").classList.remove("on"); setSession(s.dataset.pks); }
  else if (e.target.id === "picker") $("#picker").classList.remove("on");
}, true);

load().then(() => { ls.set("seen", D.generated); const m = location.hash.match(/^#b=(.+)$/); if (m) { try { const id = decodeURIComponent(m[1]), [a, k] = id.split("|"); if (D.sessions[a] && D.sessions[a].bills[k]) openBill(id); } catch {} } }).catch(() => { $("#changes").innerHTML = `<div class="card">No data yet, or the data is still being rebuilt. The nightly update will fill this in. (If this lasts more than a day, run “Update bill data” in GitHub Actions.)</div>`; });
document.addEventListener("visibilitychange", () => { if (!document.hidden && D) fetch("data/tracker.json", {cache:"no-cache"}).then(r => r.json()).then(d => { if (d.generated !== D.generated) load(); }).catch(() => {}); });

window.__rt = { W, N, ls, render, esc, applyBig: v => document.body.classList.toggle("big", !!v) };
