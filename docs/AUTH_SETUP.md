# Turning on accounts (about 15 minutes, one time)

The site works without accounts. Accounts switch on when `config.js` has a Supabase project URL and key.
Supabase is a managed login and database service: it stores passwords (hashed with bcrypt), sends the emails,
rate-limits sign-ins, and enforces per-user access in the database. This site never sees or stores passwords.

1. Create a free project at https://supabase.com (pick a US region). Save the database password in a password manager.
2. **SQL Editor -> New query**: paste all of `supabase/schema.sql` -> Run.
3. **Authentication -> Sign In / Providers -> Email**: keep *Confirm email* ON. Turn OFF every other provider you don't use.
   Set **Minimum password length to 12** and require lowercase + uppercase + digits if offered.
   Turn ON **Leaked password protection** (Pro plan) if available; the site also checks breaches itself.
4. **Authentication -> MFA**: enable **TOTP**.
5. **Authentication -> URL Configuration**: Site URL = `https://wtintor.github.io/nm-bill-tracker/`.
   Redirect URLs: add the same address. Nothing else (no wildcards).
6. **Authentication -> Rate Limits**: keep defaults or lower them. **Authentication -> Attack Protection**: turn ON CAPTCHA (Cloudflare Turnstile or hCaptcha)
   (then also add the widget to the sign-up form; see SECURITY.md).
7. **Authentication -> Emails**: set a custom SMTP sender (Resend, Postmark) so confirmation mail isn't throttled or sent from a shared address.
8. **Project Settings -> API**: copy the Project URL and the **anon / publishable** key into `config.js`. Never use or commit the `service_role` key.
9. In `index.html` replace `https://*.supabase.co` in the Content-Security-Policy with your exact project address. If you turned on CAPTCHA, put the site key in `config.js` as `TURNSTILE_SITEKEY` and add `https://challenges.cloudflare.com` to `script-src` and `frame-src`.
10. Do the GitHub settings in SECURITY.md (two-factor, branch protection, secret scanning).
11. Commit and push. Open the site and tap **Sign in** -> **Create an account**.

Test checklist: create account, confirm email, sign in, follow a bill, sign in on a second device (it appears),
turn on two-step verification, sign out (local data clears), forgot-password email works, delete account.
