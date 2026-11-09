# Running it safely

## Routine
- Weekly: look at Supabase **Authentication -> Logs** for floods of failed sign-ins or sign-ups; look at the GitHub Actions tab for failed runs; accept Dependabot pull requests.
- The nightly job refuses to log a "mass change" (more than 30% of bills changed, or 20% vanished). If the Actions log says `SUSPECT run`, the legislature's site probably returned a partial page. It accepts the data as real after three nights in a row.
- Backups: the Free Supabase plan has none. On Pro, daily backups are kept for about a week. Users can also download their own data from the Account panel.

## If something goes wrong
**A user says their account was taken over:** Supabase -> Authentication -> Users -> the user -> sign them out everywhere; they reset the password and turn on two-step verification. End-to-end encrypted data stays unreadable without their passphrase.

**You suspect the site was tampered with:** GitHub -> Settings -> Pages: unpublish. Review recent commits and Actions runs, rotate any secrets (Supabase service key if you ever created one, SMTP key, `BUTTONDOWN_API_KEY`), force-sign-out all users (Supabase -> Authentication -> Sign out all sessions via SQL: `delete from auth.sessions;`), then restore from a known-good commit.

**You suspect a database breach:** the password hashes are bcrypt; end-to-end encrypted notes are ciphertext. Force a password reset for all users, rotate the project's JWT secret (Settings -> API), and ask counsel about notification duties.

**A bad data run reached the site:** revert the data commit in GitHub (Revert button on the commit), run "Update bill data" again.

## Deleting a user on request
Supabase -> Authentication -> Users -> delete. Their saved row is removed automatically.

## Keep an eye on
- If you move to a custom domain and later drop it, remove the DNS record so nobody can take it over.
- Clipboard: "Copy as text for email" puts positions on the clipboard, which some phones sync to other devices. Tell staff.
