"""Safe downloader for the crawlers: https only, nmlegis.gov only (including after redirects), size-capped.
Stops a poisoned redirect or a huge file from pulling the nightly job somewhere it shouldn't go."""
import urllib.request, urllib.parse, urllib.error

ALLOWED = {"www.nmlegis.gov", "nmlegis.gov"}
MAX_BYTES = 40 * 1024 * 1024

def _check(url):
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or (u.hostname or "").lower() not in ALLOWED:
        raise urllib.error.URLError("blocked: %s" % (u.hostname,))

class _Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _check(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

_opener = urllib.request.build_opener(_Redirects)

class _Capped:
    def __init__(self, r): self._r = r
    def __enter__(self): return self
    def __exit__(self, *a): self._r.close()
    def read(self):
        data = self._r.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise urllib.error.URLError("response too large")
        return data
    def __getattr__(self, k): return getattr(self._r, k)

def urlopen(req, timeout=60):
    _check(req.full_url if hasattr(req, "full_url") else req)
    return _Capped(_opener.open(req, timeout=timeout))
