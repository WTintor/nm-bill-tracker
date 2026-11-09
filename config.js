// Public settings. The anon key is MEANT to be public: it only lets a browser reach the login endpoints,
// and Row Level Security (supabase/schema.sql) decides what any signed-in user can read.
// NEVER put the service_role key here or anywhere in this repository.
window.RT_CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcdxyz.supabase.co"
  TURNSTILE_SITEKEY: "",  // optional: Cloudflare Turnstile site key (public). Also see docs/AUTH_SETUP.md for the CSP change
  SUPABASE_ANON_KEY: ""   // Project Settings -> API -> "anon public" (or "publishable") key
};
