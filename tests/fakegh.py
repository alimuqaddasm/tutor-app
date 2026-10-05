"""Pretend GitHub for the Tutor Desk browser tests (from the review of 4 Oct 2026).

Serves the local clone of the tutoring repo (real git blob shas, via `git ls-tree` / `git cat-file`)
and records every write (PUT contents) in memory. Nothing ever reaches api.github.com.

Use:   from fakegh import FakeGH; fake = FakeGH(); ctx.route("https://api.github.com/**", fake.route)
       fake.puts  -> {path: bytes} of everything the app tried to save
       fake.delay -> seconds to sleep before answering (slow network)
       fake.fail  -> if set, every request answers with this HTTP status (offline / error)

Importing this module also patches playwright's BrowserContext.route so that any test which registers
its own handler for api.github.com has `route.continue_()` redirected here (reads served from the clone,
writes recorded), while `abort()` and `fulfill()` keep working as the test wrote them.
"""
import base64, hashlib, json, os, re, subprocess, time, urllib.parse

REPO = os.environ.get("TUTORING_CLONE", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "tutoring"))


class FakeGH:
    def __init__(self, clone=REPO):
        self.clone = clone
        self.files = {}      # path -> sha (from git)
        self.extra = {}      # path -> bytes written by the app (overrides the clone)
        self.puts = {}       # path -> bytes, every write
        self.log = []        # (method, path)
        self.delay = 0
        self.fail = None
        self.fail_writes = None
        out = subprocess.run(["git", "-C", clone, "ls-tree", "-r", "HEAD"], capture_output=True, text=True).stdout
        for line in out.splitlines():
            meta, path = line.split("\t", 1)
            self.files[path] = meta.split()[2]
        self.blobcache = {}

    def blob(self, sha):
        if sha in self.blobcache:
            return self.blobcache[sha]
        for p, b in self.extra.items():
            if gitsha(b) == sha:
                return b
        b = subprocess.run(["git", "-C", self.clone, "cat-file", "blob", sha], capture_output=True).stdout
        self.blobcache[sha] = b
        return b

    def sha_of(self, path):
        if path in self.extra:
            return gitsha(self.extra[path])
        return self.files.get(path)

    def tree(self):
        paths = set(self.files) | set(self.extra)
        return {"sha": "HEAD", "tree": [{"path": p, "type": "blob", "sha": self.sha_of(p)} for p in sorted(paths)]}

    # ----- the handler -----
    def route(self, route, request=None):
        req = route.request
        url = req.url
        path = urllib.parse.urlparse(url).path
        self.log.append((req.method, path))
        if self.delay:
            time.sleep(self.delay)
        if self.fail:
            return route.fulfill(status=self.fail, content_type="application/json", body=json.dumps({"message": "pretend failure"}))
        try:
            return self._serve(route, req, url, path)
        except Exception as e:  # never let the handler die silently
            print("fakegh error", repr(e), req.method, url)
            return route.fulfill(status=500, body="{}")

    def _serve(self, route, req, url, path):
        m = req.method
        if m == "GET" and "/git/trees/" in path:
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(self.tree()))
        mm = re.search(r"/git/blobs/([0-9a-f]{40})$", path)
        if m == "GET" and mm:
            b = self.blob(mm.group(1))
            if b is None or b == b"" and not any(self.sha_of(p) == mm.group(1) for p in list(self.files) + list(self.extra)):
                return route.fulfill(status=404, body="{}")
            return route.fulfill(status=200, body=b, content_type="application/octet-stream")
        mm = re.search(r"/contents/(.+)$", path)
        if mm:
            fpath = urllib.parse.unquote(mm.group(1))
            if m == "GET":
                sha = self.sha_of(fpath)
                if not sha:
                    return route.fulfill(status=404, content_type="application/json", body="{}")
                b = self.extra.get(fpath) or self.blob(sha)
                return route.fulfill(status=200, content_type="application/json", body=json.dumps({"sha": sha, "path": fpath, "content": base64.b64encode(b).decode(), "encoding": "base64"}))
            if m == "PUT":
                if self.fail_writes:
                    return route.fulfill(status=self.fail_writes, content_type="application/json", body=json.dumps({"message": "pretend write failure"}))
                body = json.loads(req.post_data or "{}")
                data = base64.b64decode(body.get("content", ""))
                cur = self.sha_of(fpath)
                if cur and body.get("sha") != cur:
                    return route.fulfill(status=409, content_type="application/json", body=json.dumps({"message": "sha mismatch"}))
                self.extra[fpath] = data
                self.puts[fpath] = data
                return route.fulfill(status=201 if not cur else 200, content_type="application/json", body=json.dumps({"content": {"sha": gitsha(data), "path": fpath}, "commit": {"sha": "deadbeef"}}))
            if m == "DELETE":
                self.extra.pop(fpath, None)
                self.files.pop(fpath, None)
                return route.fulfill(status=200, body="{}")
        if m == "GET" and re.search(r"^/repos/[^/]+/[^/]+$", path):
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"permissions": {"push": True}, "full_name": "x/y"}))
        return route.fulfill(status=404, content_type="application/json", body="{}")


def gitsha(b):
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


# ---- patch playwright so existing tests' `continue_()` on api.github.com lands here ----
try:
    from playwright.sync_api import BrowserContext, Route
    SHARED = FakeGH()
    _orig_route = BrowserContext.route

    class _Proxy:
        def __init__(self, r): self._r = r
        @property
        def request(self): return self._r.request
        def continue_(self, **kw): return SHARED.route(self._r)
        def fallback(self, **kw): return SHARED.route(self._r)
        def abort(self, *a, **kw): return self._r.abort(*a, **kw)
        def fulfill(self, *a, **kw): return self._r.fulfill(*a, **kw)
        def fetch(self, *a, **kw): raise RuntimeError("blocked: real GitHub")

    def _route(self, url, handler, **kw):
        if isinstance(url, str) and "api.github.com" in url:
            import inspect
            nargs = len(inspect.signature(handler).parameters)
            def wrapped(route, request=None):
                return handler(_Proxy(route)) if nargs == 1 else handler(_Proxy(route), request)
            return _orig_route(self, url, wrapped, **kw)
        return _orig_route(self, url, handler, **kw)
    BrowserContext.route = _route
except Exception as e:  # pragma: no cover
    print("fakegh: playwright patch skipped", e)




# ---- since 5 Oct quick flow is the app's default; the older tests were written for step by step, so every test
# context starts there unless the test sets tutor.flow itself (its own init script runs after this one) ----
try:
    from playwright.sync_api import Browser
    _orig_ctx = Browser.new_context
    def _new_context(self, **kw):
        c = _orig_ctx(self, **kw)
        c.add_init_script("try{if(!localStorage.getItem('tutor.flow'))localStorage.setItem('tutor.flow','steps')}catch(e){}")
        return c
    Browser.new_context = _new_context
except Exception as e:  # pragma: no cover
    print("fakegh: flow patch skipped", e)
