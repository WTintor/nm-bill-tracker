/* Accounts, password sign-in, optional two-step verification, and sync of followed bills, positions,
   notes and preferences. Talks only to the Supabase project in config.js (Auth + a Row-Level-Security table).
   No third-party scripts. Passwords are never stored or logged here; Supabase Auth hashes them server-side. */
(() => {
  "use strict";
  const CFG = window.RT_CONFIG || {}, A = window.__rt;
  const URL_ = String(CFG.SUPABASE_URL || "").replace(/\/+$/, ""), KEY = String(CFG.SUPABASE_ANON_KEY || "");
  const localDev = location.hostname === "localhost" && /^http:\/\/127\.0\.0\.1:\d+$/.test(URL_);
  const ENABLED = A && (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_) || localDev) && KEY.length > 20;
  if (!ENABLED) { window.RT = { changed() {} }; return; }

  const IDLE_MS = 8 * 3600e3;            // sign out after 8 hours without use
  const MIN_PW = 12, MAX_PW = 128;
  const SITE = location.origin + location.pathname;
  const $ = s => document.querySelector(s), esc = A.esc;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };

  /* ---------- tiny API client ---------- */
  let sess = null;            // { access, exp, user }  (access token lives in memory only)
  async function api(path, { method = "GET", body, auth = true, headers = {}, token = null } = {}) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const h = { apikey: KEY, "Content-Type": "application/json", ...headers };
      h.Authorization = "Bearer " + (token || (auth && sess ? sess.access : KEY));
      const r = await fetch(URL_ + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal, credentials: "omit", cache: "no-store" });
      let data = null; const txt = await r.text(); if (txt.length > 2e6) return { ok: false, status: 0, data: null }; if (txt) { try { data = JSON.parse(txt); } catch { data = null; } }
      return { ok: r.ok, status: r.status, data };
    } catch { return { ok: false, status: 0, data: null }; }
    finally { clearTimeout(timer); }
  }
  const errText = r => r.status === 0 ? "No connection. Try again." : r.status === 429 ? "Too many attempts. Wait a few minutes and try again." : (r.data && (r.data.msg || r.data.error_description || r.data.message)) || "Something went wrong.";

  let refreshTimer = null;
  function setSession(t) {
    sess = { access: t.access_token, exp: Date.now() + Math.max(60, (t.expires_in || 3600) - 60) * 1000, user: t.user || (sess && sess.user) || null };
    store.set("rt_session", { refresh: t.refresh_token }); touch();
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh(), Math.max(30e3, sess.exp - Date.now()));
  }
  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    const run = () => {   // read the token inside the lock: another tab may have just rotated it
      const s = store.get("rt_session"); if (!s || !s.refresh) return Promise.resolve(false);
      return api("/auth/v1/token?grant_type=refresh_token", { method: "POST", auth: false, body: { refresh_token: s.refresh } }).then(r => {
        if (r.ok && r.data && r.data.access_token) { setSession(r.data); return true; }
        if (r.status === 400 || r.status === 401 || r.status === 403) dropLocal(); // refresh token rejected (revoked, reused or expired)
        return false;
      });
    };
    return refreshing = (navigator.locks ? navigator.locks.request("rt-refresh", run) : run()).finally(() => { refreshing = null; });
  }
  async function fresh() { if (sess && Date.now() < sess.exp) return true; return refresh(); }
  function touch() { store.set("rt_last", Date.now()); }
  function dropLocal() { sess = null; dek = null; hdr = null; hdrNew = false; store.del("rt_session"); clearTimeout(refreshTimer); chip(); }

  /* ---------- sync document ---------- */
  const W = A.W, N = A.N;
  const ID_RE = /^\d{4}[A-Za-z0-9 .\-]{0,40}\|[A-Z]{1,4}\d{1,5}$/;   // "2026 Regular|HB12" only: also rules out "__proto__" and friends
  const POSV = ["", "support", "oppose", "monitor", "amend"];
  const cleanId = id => typeof id === "string" && id.length < 80 && ID_RE.test(id);
  const MAX_STARS = 5000, MAX_NOTES = 3000;
  let meta = (m => { const o = { stars: {}, notes: {}, big: { v: false, t: 0 } }; if (m && typeof m === "object") { for (const [id, v] of Object.entries(m.stars || {})) if (ID_RE.test(id) && v && isFinite(v.t)) o.stars[id] = { on: !!v.on, t: v.t }; for (const [id, v] of Object.entries(m.notes || {})) if (ID_RE.test(id) && v && isFinite(v.t)) o.notes[id] = v.del ? { del: true, t: v.t } : { n: sanitizeNote(v.n), t: v.t }; if (m.big && isFinite(m.big.t)) o.big = { v: !!m.big.v, t: m.big.t }; } return o; })(store.get("rt_meta"));
  let applying = false, dirty = false, remoteVer = null, pushTimer = null, state = "off";
  const saveMeta = () => store.set("rt_meta", meta);
  function track(k) {
    const now = Date.now();
    if (k === "w") {
      for (const id of W) if (cleanId(id) && (!meta.stars[id] || !meta.stars[id].on)) meta.stars[id] = { on: true, t: now };
      for (const [id, m] of Object.entries(meta.stars)) if (m.on && !W.has(id)) meta.stars[id] = { on: false, t: now };
    } else if (k === "notes") {
      for (const [id, n] of Object.entries(N)) { if (!cleanId(id)) continue; const s = JSON.stringify(n); if (!meta.notes[id] || meta.notes[id].del || JSON.stringify(meta.notes[id].n) !== s) meta.notes[id] = { n: JSON.parse(s), t: now }; }
      for (const [id, m] of Object.entries(meta.notes)) if (!m.del && !(id in N)) meta.notes[id] = { del: true, t: now };
    } else if (k === "big") meta.big = { v: !!A.ls.get("big", false), t: now };
    saveMeta();
  }
  function localDoc() {  // make sure pre-existing local data has a (low) timestamp so it merges instead of vanishing
    for (const id of W) if (cleanId(id) && !meta.stars[id]) meta.stars[id] = { on: true, t: 1 };
    for (const [id, n] of Object.entries(N)) if (cleanId(id) && !meta.notes[id]) meta.notes[id] = { n: sanitizeNote(n), t: 1 };
    if (A.ls.get("big", false) && !meta.big.t) meta.big = { v: true, t: 1 };
    const cut = Date.now() - 90 * 864e5;                       // forget old tombstones
    for (const [id, m] of Object.entries(meta.stars)) if (!m.on && m.t < cut) delete meta.stars[id];
    for (const [id, m] of Object.entries(meta.notes)) if (m.del && m.t < cut) delete meta.notes[id];
    saveMeta(); return { v: 1, stars: meta.stars, notes: meta.notes, big: meta.big };
  }
  function merge(a, b) {  // newest edit wins, per item
    const out = { v: 1, stars: Object.create(null), notes: Object.create(null), big: { v: false, t: 0 } };
    for (const src of [a, b]) {
      for (const [id, m] of Object.entries((src && src.stars) || {})) if (cleanId(id) && m && typeof m.t === "number" && isFinite(m.t) && (!out.stars[id] || m.t >= out.stars[id].t)) out.stars[id] = { on: !!m.on, t: m.t };
      for (const [id, m] of Object.entries((src && src.notes) || {})) if (cleanId(id) && m && typeof m.t === "number" && (!out.notes[id] || m.t >= out.notes[id].t)) out.notes[id] = m.del ? { del: true, t: m.t } : { n: sanitizeNote(m.n), t: m.t };
      if (src && src.big && typeof src.big.t === "number" && src.big.t >= out.big.t) out.big = { v: !!src.big.v, t: src.big.t };
    }
    for (const [m, max] of [[out.stars, MAX_STARS], [out.notes, MAX_NOTES]]) { const ids = Object.keys(m); if (ids.length > max) ids.sort((x, y) => m[y].t - m[x].t).slice(max).forEach(id => delete m[id]); }
    return out;
  }
  function sanitizeNote(n) { n = n && typeof n === "object" ? n : {}; const o = {}; if (POSV.includes(n.pos)) o.pos = n.pos; if (typeof n.note === "string") o.note = n.note.slice(0, 5000); if (typeof n.tag === "string") o.tag = n.tag.slice(0, 60); return o; }
  function applyDoc(doc) {
    applying = true;
    try {
      meta = { stars: doc.stars, notes: doc.notes, big: doc.big }; saveMeta();
      W.clear(); for (const [id, m] of Object.entries(doc.stars)) if (m.on) W.add(id);
      for (const k of Object.keys(N)) delete N[k];
      for (const [id, m] of Object.entries(doc.notes)) if (!m.del) N[id] = m.n;
      A.ls.set("w", [...W]); A.ls.set("notes", N); A.ls.set("big", !!doc.big.v); A.applyBig(doc.big.v);
    } finally { applying = false; }
    try { A.render(); } catch {}
  }

  /* ---------- end-to-end encryption (optional, per user) ----------
     A random data key (AES-256-GCM) encrypts the whole saved document in the browser. The data key is stored only
     in wrapped form: once under a key derived from the user's passphrase (PBKDF2-SHA256, 600k rounds) and once under
     a random recovery code. The server only ever sees ciphertext. Lose both and nobody can recover the data. */
  let dek = null, hdr = null, hdrNew = false;   // hdrNew: wrapped keys were just changed here and must win over the server copy
  //      // data key (memory only) and the public wrapped-key header stored with the row
  const b64 = u8 => btoa(String.fromCharCode(...u8)), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const te = new TextEncoder(), td = new TextDecoder(), PASS_ITER = 600000, REC_ITER = 100000;
  const canon = w => [w && w.s, w && w.i, w && w.c, w && w.n].join(".");   // order-independent (the database re-orders JSON keys)
  const aad = (p, r) => te.encode("roundhouse-v2|" + canon(p) + "|" + canon(r));   // ties the ciphertext to its key header, so a swapped header is detected
  const normRec = c => String(c).toUpperCase().replace(/[^A-Z2-7]/g, "");
  async function kek(secret, salt, iter) { const base = await crypto.subtle.importKey("raw", te.encode(secret.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]); }
  async function wrap(key, secret, iter) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), k = await kek(secret, salt, iter); const ct = await crypto.subtle.wrapKey("raw", key, k, { name: "AES-GCM", iv }); return { s: b64(salt), i: b64(iv), c: b64(new Uint8Array(ct)), n: iter }; }
  async function unwrap(w, secret) { if (!w || !(w.n >= 100000 && w.n <= 5e6)) throw new Error("bad header"); const k = await kek(secret, unb64(w.s), w.n); return crypto.subtle.unwrapKey("raw", unb64(w.c), k, { name: "AES-GCM", iv: unb64(w.i) }, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]); }
  async function seal(doc) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(hdr.p, hdr.r) }, dek, te.encode(JSON.stringify(doc))); return { v: 2, p: hdr.p, r: hdr.r, i: b64(iv), c: b64(new Uint8Array(ct)) }; }
  async function unseal(env) { const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.i), additionalData: aad(env.p, env.r) }, dek, unb64(env.c)); return JSON.parse(td.decode(pt)); }
  function recoveryCode() { const al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", r = crypto.getRandomValues(new Uint8Array(20)); let bits = "", out = ""; for (const x of r) bits += x.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += al[parseInt(bits.slice(i, i + 5), 2)]; return out.match(/.{4}/g).join("-"); }

  async function pull() {
    const r = await api("/rest/v1/user_data?select=data,updated_at&limit=1");
    if (!r.ok) return { err: r };
    return { row: Array.isArray(r.data) && r.data[0] ? r.data[0] : null };
  }
  async function syncNow() {
    if (!sess || !(await fresh())) { setState("off"); return false; }
    setState("syncing");
    for (let i = 0; i < 4; i++) {
      const p = await pull(); if (p.err) { setState(p.err.status === 0 ? "offline" : "error"); return false; }
      let remote = p.row && p.row.data;
      if (remote && remote.v === 2) {
        if (!dek) { setState("locked"); return false; }
        if (!hdrNew) hdr = { p: remote.p, r: remote.r };
        try { remote = await unseal(remote); } catch { setState("error"); return false; }
      }
      const merged = merge(localDoc(), remote), body = dek ? await seal(merged) : merged;
      let r;
      if (!p.row) r = await api("/rest/v1/user_data", { method: "POST", body: { data: body }, headers: { Prefer: "return=representation" } });
      else r = await api("/rest/v1/user_data?updated_at=eq." + encodeURIComponent(p.row.updated_at), { method: "PATCH", body: { data: body }, headers: { Prefer: "return=representation" } });
      if (r.ok && Array.isArray(r.data) && r.data.length) { remoteVer = r.data[0].updated_at; hdrNew = false; applyDoc(merged); dirty = false; store.set("rt_synced", Date.now()); setState("ok"); return true; }
      if (!r.ok && r.status !== 409) { setState(r.status === 0 ? "offline" : "error"); return false; }
    }
    setState("error"); return false;
  }
  function schedule() { dirty = true; clearTimeout(pushTimer); pushTimer = setTimeout(() => { if (sess) syncNow(); }, 1500); }
  window.RT = { signedIn: () => !!sess, changed(k) { if (applying) return; track(k); if (sess) schedule(); } };
  addEventListener("online", () => { if (sess && dirty) syncNow(); });
  setInterval(() => { if (sess && (dirty || state === "offline" || state === "error")) syncNow(); if (sess && Date.now() - (store.get("rt_last") || 0) > IDLE_MS) signOut(false, true); }, 60e3);
  for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => { if (sess) { const last = store.get("rt_last") || 0; if (Date.now() - last > 30e3) touch(); } }, { passive: true });
  const idleCheck = () => { if (sess && Date.now() - (store.get("rt_last") || 0) > IDLE_MS) signOut(false, true); };   // timers freeze in background tabs, so also check on return
  document.addEventListener("visibilitychange", () => { if (!document.hidden) idleCheck(); });
  addEventListener("pageshow", e => { if (e.persisted) idleCheck(); });
  addEventListener("storage", e => { if (e.key === "rt_session" && e.newValue === null && sess) { signOutQuiet().then(() => openPanel("signin", "You signed out in another tab.")); } });  // sign-out in one tab signs out all

  function setState(s) { state = s; chip(); const el = $("#rt-state"); if (el) el.textContent = stateText(); }
  const stateText = () => ({ ok: "Saved to your account", syncing: "Saving…", offline: "Offline. Changes will save when you reconnect.", error: "Could not save. Will retry.", off: "Not signed in", locked: "Locked. Enter your passphrase to sync." }[state] || "");

  /* ---------- sign out ---------- */
  async function signOut(everywhere, expired) {
    if (sess && dirty) { try { await syncNow(); } catch {} }
    if (sess) await api("/auth/v1/logout?scope=" + (everywhere ? "global" : "local"), { method: "POST" });
    dropLocal();
    applying = true;
    try { W.clear(); for (const k of Object.keys(N)) delete N[k]; for (const k of ["w", "notes", "big", "rt_meta", "rt_synced", "rt_last"]) store.del(k); meta = { stars: {}, notes: {}, big: { v: false, t: 0 } }; A.applyBig(false); } finally { applying = false; }
    try { A.render(); } catch {} chip();
    openPanel("signin", expired ? "You were signed out after a long period of inactivity." : "You are signed out. Bills and notes were cleared from this device and remain in your account.");
  }

  /* ---------- password rules ---------- */
  function pwProblems(pw, email) {
    const p = [];
    if (pw.length < MIN_PW) p.push(`At least ${MIN_PW} characters (a few random words works well).`);
    if (pw.length > MAX_PW) p.push(`At most ${MAX_PW} characters.`);
    if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|abcdefghijkl|qwertyuiopas)/i.test(pw)) p.push("Too predictable.");
    if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length > 3) p.push("Don't include your email name.");
    if (/^(password|passw0rd|letmein|welcome|iloveyou|santafe|newmexico|roundhouse)/i.test(pw)) p.push("Too common.");
    return p;
  }
  async function breached(pw) {   // k-anonymity: only the first 5 characters of the SHA-1 leave the device
    try {
      const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw)), hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch("https://api.pwnedpasswords.com/range/" + hex.slice(0, 5), { headers: { "Add-Padding": "true" }, signal: ctl.signal, credentials: "omit" }); clearTimeout(t);
      if (!r.ok) return false;
      return (await r.text()).split("\n").some(l => { const [s, c] = l.trim().split(":"); return s === hex.slice(5) && +c > 0; });
    } catch { return false; }   // fail open: the server enforces its own rules too
  }
  const emailOk = e => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;

  /* ---------- optional CAPTCHA (Cloudflare Turnstile) against scripted sign-up and password guessing ---------- */
  const SITEKEY = String(CFG.TURNSTILE_SITEKEY || "");
  let capToken = "", capLoad = null;
  const capHtml = () => SITEKEY ? '<div id="rt-cap" style="margin-top:10px;min-height:65px"></div>' : "";
  const sec = () => SITEKEY ? { gotrue_meta_security: { captcha_token: capToken } } : {};
  function renderCaptcha() {
    if (!SITEKEY || !$("#rt-cap")) return; capToken = "";
    capLoad = capLoad || new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    capLoad.then(() => window.turnstile && window.turnstile.render("#rt-cap", { sitekey: SITEKEY, callback: t => { capToken = t; }, "expired-callback": () => { capToken = ""; } })).catch(() => {});
  }
  const needCap = () => SITEKEY && !capToken;

  /* ---------- UI ---------- */
  function chip() {
    const b = $("#acct"); if (!b) return;
    const em = sess && sess.user && sess.user.email;
    b.innerHTML = em ? `<span class="dot ${state === "ok" ? "ok" : state === "syncing" ? "sy" : "bad"}"></span>${esc(em.slice(0, 1).toUpperCase())}` : "Sign in";
    b.setAttribute("aria-label", em ? "Account" : "Sign in");
  }
  const field = (id, label, type, ac, extra = "") => `<label for="${id}" class="rt-l">${label}</label><input id="${id}" name="${id}" type="${type}" autocomplete="${ac}" ${extra} required>`;
  const msg = (m, bad) => m ? `<div class="rt-m ${bad ? "bad" : ""}" role="${bad ? "alert" : "status"}">${esc(m)}</div>` : "";
  function openPanel(view, note, bad) {
    const P = $("#panel"); let h = `<div style="display:flex;justify-content:space-between;align-items:center"><h3>${{ signin: "Sign in", signup: "Create account", forgot: "Reset password", mfa: "Two-step check", account: "Your account", reset: "Choose a new password", unlock: "Unlock your notes", unlockrec: "Use recovery code", e2eon: "Encrypt my notes", recovery: "Save your recovery code", erase: "Erase saved data", link: "Confirm sign-in" }[view]}</h3><button class="btn" data-close="1">Close</button></div>`;
    h += msg(note, bad);
    if (view === "signin") h += `<form data-af="signin" novalidate>${field("rt-e", "Email", "email", "username", 'inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254"')}${field("rt-p", "Password", "password", "current-password", `maxlength="${MAX_PW}"`)}${capHtml()}<button class="btn pri big rt-w">Sign in</button></form>
      <div class="meta" style="margin-top:8px">You are on <b>${esc(location.host)}</b>. Only sign in on this address.</div><div class="rt-links"><button class="lnk" data-a="forgot">Forgot password</button><button class="lnk" data-a="signup">Create an account</button></div><div class="note">Signing in saves the bills you follow, your positions, notes and settings to your account so they follow you to any device.</div>`;
    if (view === "signup") h += `<form data-af="signup" novalidate>${field("rt-e", "Email", "email", "username", 'inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254"')}${field("rt-p", "Password", "password", "new-password", `minlength="${MIN_PW}" maxlength="${MAX_PW}"`)}<div class="meter"><i id="rt-bar"></i></div><div class="meta" id="rt-hint">At least ${MIN_PW} characters. A few random words is stronger than symbols.</div>${field("rt-p2", "Repeat password", "password", "new-password", `maxlength="${MAX_PW}"`)}${capHtml()}<button class="btn pri big rt-w">Create account</button></form>
      <div class="rt-links"><button class="lnk" data-a="signin">I already have an account</button></div><div class="note">We email a confirmation link. Your password is never stored by this site; it is hashed by the login service. Passwords that appear in known data breaches are refused.</div>`;
    if (view === "forgot") h += `<form data-af="forgot" novalidate>${field("rt-e", "Email", "email", "username", 'inputmode="email" autocapitalize="none" maxlength="254"')}${capHtml()}<button class="btn pri big rt-w">Email me a reset link</button></form><div class="rt-links"><button class="lnk" data-a="signin">Back to sign in</button></div>`;
    if (view === "mfa") h += `<form data-af="mfa" novalidate>${field("rt-c", "6-digit code from your authenticator app", "text", "one-time-code", 'inputmode="numeric" pattern="[0-9]*" maxlength="6"')}<button class="btn pri big rt-w">Verify</button></form>`;
    if (view === "reset") h += `<form data-af="reset" novalidate>${field("rt-p", "New password", "password", "new-password", `minlength="${MIN_PW}" maxlength="${MAX_PW}"`)}<div class="meter"><i id="rt-bar"></i></div><div class="meta" id="rt-hint"></div>${field("rt-p2", "Repeat new password", "password", "new-password", `maxlength="${MAX_PW}"`)}<button class="btn pri big rt-w">Save password</button></form>`;
    if (view === "link") h += `<div class="card">This link will sign you in as <b>${esc(pendingLink ? pendingLink.user.email : "")}</b>${pendingLink && pendingLink.type === "recovery" ? " so you can choose a new password" : ""}.</div><div class="note"><b>Only continue if you just asked for this email.</b> If you didn't, or the address isn't yours, cancel: someone may be trying to get you to save your notes into their account.</div><button class="btn pri big rt-w" data-a="linkgo">Continue</button><button class="btn rt-w" data-a="linkno">Cancel</button>`;
    if (view === "unlock") h += `<div class="note">Your saved bills and notes are end-to-end encrypted. Enter your notes passphrase (not your login password).</div><form data-af="unlock" novalidate>${field("rt-x", "Notes passphrase", "password", "off", `maxlength="${MAX_PW}"`)}<button class="btn pri big rt-w">Unlock</button></form><div class="rt-links"><button class="lnk" data-a="unlockrec">Use my recovery code</button><button class="lnk" data-a="erase">I lost both</button></div><div class="note"><button class="lnk" data-close="1">Skip for now</button>: you can still browse bills, but your saved list stays hidden.</div>`;
    if (view === "unlockrec") h += `<form data-af="unlockrec" novalidate>${field("rt-x", "Recovery code", "text", "off", 'autocapitalize="characters" spellcheck="false" maxlength="40"')}${field("rt-p", "Choose a new notes passphrase", "password", "new-password", `minlength="${MIN_PW}" maxlength="${MAX_PW}"`)}<button class="btn pri big rt-w">Recover</button></form>`;
    if (view === "erase") h += `<div class="note">Without the passphrase or recovery code, encrypted data cannot be read by anyone, including us. You can erase it and start over. This deletes your saved bills and notes from the account.</div><form data-af="erase" novalidate>${field("rt-d", "Type ERASE to confirm", "text", "off", 'autocapitalize="characters"')}<button class="btn rt-w" style="margin-top:8px;color:var(--red)">Erase and start over</button></form>`;
    if (view === "e2eon") h += `<div class="note">Encrypts your followed bills, positions and notes on this device before they are saved. Only your passphrase can read them. <b>If you lose both the passphrase and the recovery code we show you next, nobody can recover your data.</b></div><form data-af="e2e" novalidate>${field("rt-p", "Notes passphrase (different from your login password)", "password", "new-password", `minlength="${MIN_PW}" maxlength="${MAX_PW}"`)}<div class="meter"><i id="rt-bar"></i></div><div class="meta" id="rt-hint"></div>${field("rt-p2", "Repeat passphrase", "password", "new-password", `maxlength="${MAX_PW}"`)}<button class="btn pri big rt-w">Turn on encryption</button></form>`;
    if (view === "recovery") h += `<div class="note"><b>Write this down or store it in a password manager now.</b> It is the only way back in if you forget your passphrase. It will not be shown again.</div><div class="card" style="text-align:center"><b id="rt-rec" style="font:700 20px ui-monospace,monospace;letter-spacing:1px;user-select:all">${esc(shownRec)}</b></div><button class="btn pri big rt-w" data-a="recdone">I have saved it</button>`;
    if (view === "account") {
      const u = sess && sess.user || {}, f = (u.factors || []).find(x => x.factor_type === "totp" && x.status === "verified");
      h += `<div class="card"><b>${esc(u.email || "")}</b><div class="meta" id="rt-state">${esc(stateText())}</div></div>
      <h2>Security</h2>
      <div class="card"><b>Confirm it's you</b><div class="meta">To change your password or delete the account, enter your current password first.</div>${field("rt-cur", "Current password", "password", "current-password", `maxlength="${MAX_PW}"`)}${capHtml()}</div>
      <div class="card"><b>Two-step verification</b><div class="meta">${f ? "On. An authenticator app code is needed at sign-in." : "Off. Recommended: adds a code from an authenticator app at sign-in."}</div><div id="rt-mfa" style="margin-top:8px">${f ? `<button class="btn" data-a="mfaoff" data-id="${esc(f.id)}">Turn off</button>` : `<button class="btn pri" data-a="mfaon">Turn on</button>`}</div></div>
      <div class="card"><b>Change password</b><form data-af="chpw" novalidate>${field("rt-p", "New password", "password", "new-password", `minlength="${MIN_PW}" maxlength="${MAX_PW}"`)}<div class="meter"><i id="rt-bar"></i></div><div class="meta" id="rt-hint"></div><button class="btn rt-w" style="margin-top:8px">Change password</button></form></div>
      <div class="card"><b>Encrypt my notes (end-to-end)</b><div class="meta">${dek ? "On. Your saved bills, positions and notes are encrypted before leaving this device; the service operator cannot read them." : state === "locked" ? "On, but locked on this device." : "Off. Saved data is protected in transit and at rest, but readable by the service operator."}</div><div style="margin-top:8px">${dek ? `<form data-af="e2echpw" novalidate>${field("rt-p", "New notes passphrase", "password", "new-password", `minlength="${MIN_PW}" maxlength="${MAX_PW}"`)}<button class="btn rt-w" style="margin-top:8px">Change passphrase</button></form>` : state === "locked" ? `<button class="btn pri" data-a="unlockview">Unlock</button>` : `<button class="btn pri" data-a="e2eon">Turn on</button>`}</div></div>
      <h2>Your data</h2>
      <div class="card"><button class="btn" data-a="export">Download my data (JSON)</button> <button class="btn" data-a="signoutall">Sign out of every device</button></div>
      <div class="card"><b>Delete my account</b><div class="meta">Permanently deletes your login, followed bills, positions and notes. This cannot be undone.</div><form data-af="del" novalidate>${field("rt-d", "Type DELETE to confirm", "text", "off", 'autocapitalize="characters"')}<button class="btn rt-w" style="margin-top:8px;color:var(--red)">Delete everything</button></form></div>
      <button class="btn pri big rt-w" data-a="signout" style="margin-top:12px">Sign out</button><div class="note">Signing out also clears followed bills and notes from this device (they stay in your account), which keeps them private on a shared phone or computer.</div>`;
    }
    P.innerHTML = h; $("#sheet").classList.add("on"); renderCaptcha();
    const pw = $("#rt-p"); if (pw && $("#rt-bar")) pw.addEventListener("input", () => meter(pw.value));
    const first = P.querySelector("input"); if (first) first.focus({ preventScroll: true });
  }
  function meter(v) {
    const len = v.length, sc = len === 0 ? 0 : len < MIN_PW ? 1 : len < 16 ? 2 : 3, bar = $("#rt-bar"), hint = $("#rt-hint");
    bar.style.width = [0, 25, 60, 100][sc] + "%"; bar.style.background = ["", "var(--red)", "var(--gold)", "var(--turq)"][sc];
    hint.textContent = ["", `${MIN_PW - len} more character${MIN_PW - len === 1 ? "" : "s"} needed`, "Acceptable. Longer is stronger.", "Strong length"][sc];
  }
  const busy = (f, on) => { const b = f.querySelector(".rt-w"); if (b) b.disabled = on; };
  const val = id => ($(id) || {}).value || "";

  async function afterSignIn(t) {   // tokens from password sign-in, MFA, confirmation link
    setSession(t);
    const u = await api("/auth/v1/user"); if (u.ok && u.data) sess.user = u.data;
    chip(); await syncNow(); openPanel(state === "locked" ? "unlock" : "account");
  }
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-af]"); if (!f) return; e.preventDefault();
    const kind = f.dataset.af, email = val("#rt-e").trim().toLowerCase(), pw = val("#rt-p");
    busy(f, true);
    try {
      if (kind === "signin") {
        if (!emailOk(email) || !pw) return openPanel("signin", "Enter your email and password.", true);
        if (needCap()) return openPanel("signin", "Complete the check first.", true);
        const r = await api("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email, password: pw, ...sec() } });
        if (!r.ok) return openPanel("signin", r.status === 429 ? errText(r) : r.status === 0 ? errText(r) : "Email or password is incorrect, or the email isn't confirmed yet.", true);
        setSession(r.data); pwFp = await sha(pw);
        const u = await api("/auth/v1/user"); if (u.ok && u.data) sess.user = u.data;
        const fac = ((sess.user && sess.user.factors) || []).find(x => x.factor_type === "totp" && x.status === "verified");
        if (fac) { pendingFactor = fac.id; return openPanel("mfa"); }
        chip(); await syncNow(); return openPanel(state === "locked" ? "unlock" : "account");
      }
      if (kind === "signup") {
        const probs = pwProblems(pw, email); if (!emailOk(email)) probs.unshift("Enter a valid email address."); if (pw !== val("#rt-p2")) probs.push("The two passwords don't match.");
        if (probs.length) return openPanel("signup", probs.join(" "), true);
        if (needCap()) return openPanel("signup", "Complete the check first.", true);
        if (await breached(pw)) return openPanel("signup", "That password has appeared in a known data breach. Choose a different one.", true);
        const r = await api("/auth/v1/signup?redirect_to=" + encodeURIComponent(SITE), { method: "POST", auth: false, body: { email, password: pw, ...sec() } });
        if (!r.ok && r.status !== 422) return openPanel("signup", errText(r), true);
        return openPanel("signin", "Check your email for a confirmation link, then sign in. If you already have an account, use Forgot password.");
      }
      if (kind === "forgot") {
        if (!emailOk(email)) return openPanel("forgot", "Enter a valid email address.", true);
        if (needCap()) return openPanel("forgot", "Complete the check first.", true);
        await api("/auth/v1/recover?redirect_to=" + encodeURIComponent(SITE), { method: "POST", auth: false, body: { email, ...sec() } });
        return openPanel("signin", "If that email has an account, a reset link is on its way.");
      }
      if (kind === "mfa") {
        const code = val("#rt-c").replace(/\s/g, ""); if (!/^\d{6}$/.test(code)) return openPanel("mfa", "Enter the 6-digit code.", true);
        const c = await api("/auth/v1/factors/" + encodeURIComponent(pendingFactor) + "/challenge", { method: "POST" });
        if (!c.ok) return openPanel("mfa", errText(c), true);
        const v = await api("/auth/v1/factors/" + encodeURIComponent(pendingFactor) + "/verify", { method: "POST", body: { challenge_id: c.data.id, code } });
        if (!v.ok) return openPanel("mfa", "That code didn't work. Try the next one.", true);
        v.data.user = sess.user; return afterSignIn(v.data);
      }
      if (kind === "chpw" || kind === "del") { if (!(await reauth())) return openPanel("account", "Your current password is needed. Enter it in the \"Confirm it's you\" box first.", true); }
      if (kind === "reset" || kind === "chpw") {
        const probs = pwProblems(pw, sess && sess.user && sess.user.email); if (kind === "reset" && pw !== val("#rt-p2")) probs.push("The two passwords don't match.");
        if (probs.length) return openPanel(kind === "reset" ? "reset" : "account", probs.join(" "), true);
        if (await breached(pw)) return openPanel(kind === "reset" ? "reset" : "account", "That password has appeared in a known data breach. Choose a different one.", true);
        const r = await api("/auth/v1/user", { method: "PUT", body: { password: pw } });
        if (!r.ok) return openPanel(kind === "reset" ? "reset" : "account", errText(r), true);
        return openPanel("account", "Password changed.");
      }
      if (kind === "unlock" || kind === "unlockrec") {
        const p = await pull(); if (p.err || !p.row || !p.row.data || p.row.data.v !== 2) return openPanel("account", "Nothing is locked.", false);
        try {
          if (kind === "unlock") dek = await unwrap(p.row.data.p, val("#rt-x"));
          else {
            const np = val("#rt-p"), probs = pwProblems(np, ""); if (probs.length) return openPanel("unlockrec", probs.join(" "), true);
            dek = await unwrap(p.row.data.r, normRec(val("#rt-x"))); hdr = { p: await wrap(dek, np, PASS_ITER), r: p.row.data.r }; hdrNew = true;
          }
        } catch { dek = null; return openPanel(kind, kind === "unlock" ? "That passphrase didn't work." : "That recovery code didn't work.", true); }
        if (!hdr) hdr = { p: p.row.data.p, r: p.row.data.r };
        await syncNow(); return openPanel("account", "Unlocked.");
      }
      if (kind === "e2e") {
        const probs = pwProblems(pw, ""); if (pw !== val("#rt-p2")) probs.push("The two passphrases don't match."); if (await reused(pw)) probs.push("Use a passphrase different from your login password.");
        if (probs.length) return openPanel("e2eon", probs.join(" "), true);
        const rec = recoveryCode();
        dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        hdr = { p: await wrap(dek, pw, PASS_ITER), r: await wrap(dek, normRec(rec), REC_ITER) }; hdrNew = true;
        if (!(await syncNow())) { dek = null; hdr = null; hdrNew = false; return openPanel("account", "Could not turn on encryption. Nothing changed.", true); }
        shownRec = rec; return openPanel("recovery");
      }
      if (kind === "e2echpw") {
        const probs = pwProblems(pw, ""); if (await reused(pw)) probs.push("Use a passphrase different from your login password."); if (probs.length || !dek) return openPanel("account", probs.join(" ") || "Unlock first.", true);
        hdr = { p: await wrap(dek, pw, PASS_ITER), r: hdr.r }; hdrNew = true;
        await syncNow(); return openPanel("account", "Notes passphrase changed.");
      }
      if (kind === "erase") {
        if (val("#rt-d").trim() !== "ERASE") return openPanel("erase", "Type ERASE exactly to confirm.", true);
        const r = await api("/rest/v1/user_data?user_id=eq." + encodeURIComponent(sess.user.id), { method: "DELETE" });
        if (!r.ok) return openPanel("erase", errText(r), true);
        dek = null; hdr = null; remoteVer = null; await syncNow(); return openPanel("account", "Saved data erased. You can turn encryption on again.");
      }
      if (kind === "del") {
        if (val("#rt-d").trim() !== "DELETE") return openPanel("account", "Type DELETE exactly to confirm.", true);
        const r = await api("/rest/v1/rpc/delete_my_account", { method: "POST", body: {} });
        if (!r.ok) return openPanel("account", errText(r), true);
        dirty = false; await signOutQuiet(); return openPanel("signin", "Your account and data were deleted.");
      }
    } finally { busy(f, false); }
  });
  async function reauth() {   // proves the person at the keyboard knows the password, not just a stolen session
    const cur = val("#rt-cur"), em = sess && sess.user && sess.user.email; if (!cur || !em) return false;
    if (needCap()) return false;
    const r = await api("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email: em, password: cur, ...sec() } });
    if (r.ok && r.data && r.data.access_token) { setSession({ ...r.data, user: sess.user }); pwFp = await sha(cur); return true; }
    return false;
  }
  let pendingLink = null;
  let pendingFactor = null, shownRec = "", pwFp = null;   // pwFp: SHA-256 of the login password, in memory only, to stop reuse as the notes passphrase
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
  const reused = async p => pwFp && (await sha(p)) === pwFp;
  async function signOutQuiet() { dropLocal(); applying = true; try { W.clear(); for (const k of Object.keys(N)) delete N[k]; for (const k of ["w", "notes", "big", "rt_meta", "rt_synced", "rt_last"]) store.del(k); meta = { stars: {}, notes: {}, big: { v: false, t: 0 } }; A.applyBig(false); } finally { applying = false; } try { A.render(); } catch {} }

  document.addEventListener("click", async e => {
    const t = e.target.closest("#acct, [data-a]"); if (!t) return;
    if (t.id === "acct") { openPanel(sess ? "account" : "signin"); return; }
    const a = t.dataset.a;
    if (["signin", "signup", "forgot"].includes(a)) return openPanel(a);
    if (a === "linkno") { pendingLink = null; $("#sheet").classList.remove("on"); return; }
    if (a === "linkgo" && pendingLink) {
      const L = pendingLink; pendingLink = null;
      setSession({ access_token: L.tok, refresh_token: L.refresh, expires_in: L.exp, user: L.user }); sess.user = L.user; chip();
      if (L.type === "recovery") return openPanel("reset");
      await syncNow(); return openPanel(state === "locked" ? "unlock" : "account", "Email confirmed. You're signed in.");
    }
    if (a === "unlockview") return openPanel("unlock");
    if (a === "unlockrec") return openPanel("unlockrec");
    if (a === "erase") return openPanel("erase");
    if (a === "e2eon") return openPanel("e2eon");
    if (a === "recdone") { shownRec = ""; return openPanel("account", "Encryption is on."); }
    if (a === "signout") return signOut(false);
    if (a === "signoutall") return signOut(true);
    if (a === "export") {
      const r = await pull(); const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), email: sess.user && sess.user.email, data: r.row ? (r.row.data.v === 2 ? (dek ? await unseal(r.row.data) : { encrypted: true, note: "Unlock to export" }) : r.row.data) : localDoc() }, null, 2)], { type: "application/json" });
      const l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = "roundhouse-tracker-my-data.json"; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 5000); return;
    }
    if (a === "mfaon") {
      const r = await api("/auth/v1/factors", { method: "POST", body: { factor_type: "totp", friendly_name: "Roundhouse " + Date.now().toString(36), issuer: "Roundhouse Tracker" } });
      if (!r.ok) return openPanel("account", errText(r), true);
      const qr = String(r.data.totp.qr_code || ""), okQr = /^data:image\/svg\+xml/.test(qr);
      $("#rt-mfa").innerHTML = `${okQr ? `<img alt="QR code for your authenticator app" src="${esc(qr)}" width="180" height="180" style="background:#fff;padding:6px;border-radius:8px">` : ""}<div class="meta">Scan with an authenticator app (1Password, Authy, Google Authenticator). Or enter this key: <b style="user-select:all">${esc(r.data.totp.secret)}</b></div><form data-af="mfaenroll" novalidate data-id="${esc(r.data.id)}">${field("rt-c", "Enter the 6-digit code to finish", "text", "one-time-code", 'inputmode="numeric" pattern="[0-9]*" maxlength="6"')}<button class="btn pri rt-w" style="margin-top:8px">Turn on</button></form>`; return;
    }
    if (a === "mfaoff") {
      const r = await api("/auth/v1/factors/" + encodeURIComponent(t.dataset.id), { method: "DELETE" });
      const u = await api("/auth/v1/user"); if (u.ok && u.data) sess.user = u.data;
      return openPanel("account", r.ok ? "Two-step verification is off." : errText(r), !r.ok);
    }
  });
  document.addEventListener("submit", async e => {
    const f = e.target.closest('[data-af="mfaenroll"]'); if (!f) return; e.preventDefault(); busy(f, true);
    try {
      const id = f.dataset.id, code = val("#rt-c").replace(/\s/g, ""); if (!/^\d{6}$/.test(code)) return openPanel("account", "Enter the 6-digit code.", true);
      const c = await api("/auth/v1/factors/" + encodeURIComponent(id) + "/challenge", { method: "POST" });
      const v = c.ok ? await api("/auth/v1/factors/" + encodeURIComponent(id) + "/verify", { method: "POST", body: { challenge_id: c.data.id, code } }) : c;
      if (!v.ok) return openPanel("account", "That code didn't work. Start again.", true);
      v.data.user = sess.user; setSession(v.data); const u = await api("/auth/v1/user"); if (u.ok && u.data) sess.user = u.data;
      openPanel("account", "Two-step verification is on.");
    } finally { busy(f, false); }
  });

  /* ---------- startup ---------- */
  function mount() {
    const aa = document.getElementById("aa"); if (!aa || document.getElementById("acct")) return;
    const b = document.createElement("button"); b.id = "acct"; b.className = "yr"; b.type = "button"; aa.before(b); chip();
    const st = document.createElement("style"); st.textContent = `.rt-l{display:block;margin:10px 0 3px;font-size:14px;color:var(--mute)} #panel input{width:100%;box-sizing:border-box} .rt-w{width:100%;margin-top:12px}.rt-m{background:var(--soft);border-radius:10px;padding:8px 10px;margin:8px 0;font-size:14px}.rt-m.bad{border:1px solid var(--red);color:var(--red)}.rt-links{display:flex;justify-content:space-between;margin:10px 0}.lnk{background:none;border:0;color:var(--red);font:inherit;text-decoration:underline;padding:6px 0}.meter{height:6px;background:var(--line);border-radius:3px;margin-top:6px}.meter i{display:block;height:100%;width:0;border-radius:3px}#acct .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:var(--mute)}#acct .dot.ok{background:#2E8B57}#acct .dot.sy{background:var(--gold)}#acct .dot.bad{background:var(--red)}`; document.head.appendChild(st);
  }
  async function start() {
    mount();
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("access_token") || h.get("error_description")) {   // came back from an email link (confirm, reset)
      const tok = h.get("access_token"), type = h.get("type"), err = h.get("error_description");
      history.replaceState(null, "", location.pathname + location.search);   // never leave tokens in the address bar or history
      if (tok) {   // never sign in silently from a link: a forged link would put the victim into the attacker's account
        const u = await api("/auth/v1/user", { token: tok });
        if (!u.ok || !u.data || !u.data.email || !["recovery", "signup", "magiclink", "invite", "email_change"].includes(type || "signup")) return openPanel("signin", "That link is not valid or has expired.", true);
        pendingLink = { tok, refresh: h.get("refresh_token"), exp: +h.get("expires_in") || 3600, type: type || "signup", user: u.data };
        return openPanel("link");
      }
      if (err) return openPanel("signin", err.replace(/\+/g, " "), true);
    }
    const last = store.get("rt_last") || 0;
    if (store.get("rt_session") && last && Date.now() - last > IDLE_MS) { await signOutQuiet(); return; }
    if (store.get("rt_session") && await refresh()) {
      const u = await api("/auth/v1/user"); if (u.ok && u.data) sess.user = u.data; chip(); await syncNow(); if (state === "locked") openPanel("unlock");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
