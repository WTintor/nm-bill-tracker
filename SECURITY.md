# Security notes

## What protects accounts
- **Passwords**: handled only by Supabase Auth (bcrypt, server-side). This site never stores, logs or transmits them anywhere else.
  Minimum 12 characters, no composition gymnastics (NIST SP 800-63B), blocked if in a known breach
  (checked with the Have I Been Pwned range API: only the first 5 characters of a SHA-1 hash leave the device).
- **Two-step verification** (TOTP authenticator app), optional per user. Once on, the database itself refuses to return data to a session that skipped it.
- **Rate limiting and lockout** on sign-in, sign-up and reset are done by Supabase. Error messages don't reveal whether an email has an account.
- **Authorization lives in the database**: Row Level Security on `user_data` lets a signed-in user touch only their own row. Anonymous access is revoked.
- **Sessions**: the short-lived access token stays in memory; only the rotating refresh token is stored on the device. Signing out revokes it, clears followed bills and notes from the device,
  and an 8-hour idle timeout signs people out. "Sign out of every device" revokes all sessions.
- **Browser hardening**: a strict Content-Security-Policy (scripts only from this site, connections only to this site, Supabase and the breach checker), no third-party scripts,
  no referrer sent, clickjacking frame-buster, all user text escaped before display, and imported data is validated and size-limited.
- **Optional end-to-end encryption of saved bills, positions and notes**: a random AES-256-GCM key encrypts the whole saved document in the browser; the key is stored only wrapped by a key derived from the user's passphrase (PBKDF2-SHA256, 600,000 rounds) and by a random recovery code. The server stores ciphertext only. There is no password reset for it by design: losing both the passphrase and recovery code means the data is unrecoverable (an "erase and start over" option exists). Limits: PBKDF2 rather than Argon2 (WebCrypto has no Argon2); the key lives in page memory while unlocked, so a malicious script on the page could read it, which the CSP is there to prevent; bill numbers are encrypted too, so the server cannot see what anyone follows.
- **Erasure and export**: users can download their data and delete their account (cascades to their data).

## Threat model: who would attack this, and what stops them

| Attacker | Attack | Defence (status) |
|---|---|---|
| Password guesser / credential stuffer | Try leaked passwords against known emails | 12+ char rule, breached-password block, provider rate limits, optional CAPTCHA (set `TURNSTILE_SITEKEY`), optional 2-step code, generic error text (built; CAPTCHA and rate limits need turning on in Supabase) |
| Bot signing up thousands of accounts | Fill the user table or burn email quota | Email confirmation required, CAPTCHA, provider limits (settings) |
| Account-enumeration probe | Learn which legislators have accounts | Same message for sign-in failure, sign-up and reset (built) |
| Phisher | Fake site harvests the password | Sign-in panel shows the real address, 2-step codes, breach check. Passkeys not built |
| Script injector (XSS) | Poisoned bill title or note runs code, steals the session | Everything escaped (including quotes), CSP allows only this site's scripts, data shape-checked on load, notes sanitised, tested with hostile data (built) |
| Malicious or hacked data source | nmlegis.gov, a redirect or a giant file attacks the nightly job | Crawler fetches https from nmlegis.gov only, redirects re-checked, 40 MB cap (built, `safenet.py`) |
| Malicious data in your own account | A tampered sync document with keys like `__proto__` | Strict ID format, null-prototype objects, field allowlists and size caps (built, tested) |
| Spreadsheet trap | Bill title starting with `=` runs a formula in Excel on CSV export | Cells that start with = + - @ are neutralised (built) |
| Malicious collaborator or compromised token | Shell injection through workflow inputs, secret theft | Inputs go through environment variables and are validated, least-privilege token, one data job at a time (built). Pin actions to commit SHAs (Dependabot configured) |
| Other signed-in user | Read or change someone else's saved list | Row Level Security in the database, tested policy, anonymous access revoked (built; run schema.sql) |
| Curious operator or database breach | Reads saved notes | Optional end-to-end encryption (built) |
| Stolen or shared device | Reads notes on an unattended phone | Sign-out clears the device, 8-hour idle sign-out, encrypted option locks on sign-out (built) |
| Network attacker | Reads or alters traffic | HTTPS enforced by Pages and Supabase; add "Enforce HTTPS" in repo settings |
| Clickjacker | Frames the site to trick clicks | Frame-buster script; real protection needs a host that sets `frame-ancestors` (not possible on GitHub Pages) |
| Login-CSRF attacker | Emails the victim a link that signs them in to the attacker's account, so the victim's notes land there | Email links never sign in silently: a confirmation screen shows which account it is (built, tested) |
| Session thief (stolen token or unlocked phone) | Changes the password or deletes the account | Current password required to change the password or delete (built, tested) |
| Tab or resume trickery | Stay signed in on a phone that slept or in a second tab | Idle sign-out is checked when the app wakes; signing out in one tab signs out the rest (built, tested) |
| Malicious database operator | Swaps the key header on encrypted data, or replays it | The header is bound into the encryption, so a swap is detected (built, tested) |
| Careless user | Uses the login password as the notes passphrase, which the login service sees | Refused (built) |
| Poisoned source page | Garbled download makes everything look "changed" | Mass-change guard in `changes.py` (built, tested) |
| Supply-chain attacker | Poisoned library | No third-party browser code; Python needs `pypdf` and `beautifulsoup4` only, pinned by Dependabot-style review |

## Settings you must turn on (code cannot do these)
1. GitHub: two-factor on every account with access, branch protection on `main` (require pull request, no force-push), secret scanning and push protection, "Enforce HTTPS", Dependabot alerts.
2. Supabase: email confirmation on, 12-character minimum, TOTP on, rate limits, CAPTCHA, custom SMTP, exact redirect URL, no unused providers; turn on leaked-password protection if you are on Pro.
3. After you know your project address, edit the CSP in `index.html`: replace `https://*.supabase.co` with `https://YOURPROJECT.supabase.co`. This stops stolen data from being sent to an attacker's project. If you use CAPTCHA also add `https://challenges.cloudflare.com` to `script-src` and `frame-src`.
4. Never put the `service_role` key, database password or SMTP password in the repository.

## Known gaps
Passkeys, signed-in device list, audit log, per-user rate limiting beyond the provider's, and PKCE for email links are not built. The CSP is a meta tag, so it cannot send `frame-ancestors` or HSTS.

## What it does not do (decide if you need these)
- Without end-to-end encryption turned on, notes are protected in transit (TLS) and at rest (provider disk encryption) but readable by the database operator.
- GitHub Pages cannot send HTTP security headers, so the CSP is a meta tag and `frame-ancestors` can't be enforced. Moving to Cloudflare Pages/Netlify adds real headers (HSTS, frame-ancestors, Permissions-Policy).
- CAPTCHA is a provider setting; the sign-up form does not render a widget yet.
- No audit log, admin console, or SSO/SAML. Legislature-wide deployment would want SSO via the provider.
- The tracker's bill data is public; accounts only protect personal preferences.

## Secrets
Only the public anon key is in the repo. The `service_role` key, database password and SMTP credentials must stay out of the repo (GitHub Actions secrets if ever needed).
Turn on GitHub secret scanning and branch protection for `main`.
