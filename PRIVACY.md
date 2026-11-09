# Privacy summary (plain language)

**What the site stores about a signed-in user:** their email address, a password hash held by the login service (never the password itself), and one saved document containing the bills they follow, their positions, tags, notes and a text-size setting. If the user turns on end-to-end encryption, that document is stored as ciphertext the operator cannot read.

**What it does not do:** no advertising, no analytics or tracking scripts, no sale or sharing of data, no cookies (the browser's local storage holds the sign-in token and a copy of the user's list). The bill data itself is public information from nmlegis.gov.

**Where it lives:** Supabase (database and login) and GitHub (the website and public bill data). Optional email goes through the email provider you pick.

**User control:** sign out clears the device. "Download my data" exports everything. "Delete my account" permanently deletes the login and the saved document. Two-step verification and end-to-end encryption are optional and in the Account panel.

**Retention:** saved data is kept until the user deletes it. Deleted data may remain in provider backups for the provider's backup window.

## Before real legislators use it, check these with counsel
- **Public records.** New Mexico's Inspection of Public Records Act may reach notes a public official keeps about legislative business, depending on where they are stored and who holds them. End-to-end encryption protects confidentiality from the operator; it does not change what counts as a public record. Get a legal opinion before telling anyone their notes are "private" in a legal sense.
- **Who is the operator?** Whoever runs this holds users' emails and is responsible for the data. Decide that, and who answers questions or requests.
- **Breach notice.** State law may require notifying users after a breach of certain personal data. `docs/OPERATIONS.md` has an incident checklist.
- **Not advice.** This is a plain-language summary, not a legal document or a promise.
