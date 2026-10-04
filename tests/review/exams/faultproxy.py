"""A local proxy in front of the exam server (:8787) that can delay, fail or hang requests.
Control: GET http://localhost:8788/__ctl?delay=2&fail=500&failn=2&hang=1&match=/api/s/answers
Runs in a thread; import and call start()."""
import http.server, socketserver, threading, time, urllib.request, urllib.error, urllib.parse, json

UP = "http://localhost:8787"
STATE = {"delay": 0.0, "fail": 0, "failn": 0, "hang": 0, "match": "", "seen": 0, "hung": 0}


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_OPTIONS(self):
        self.forward()

    def do_GET(self):
        if self.path.startswith("/__ctl"):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            for k in ("delay",):
                if k in q: STATE[k] = float(q[k][0])
            for k in ("fail", "failn", "hang"):
                if k in q: STATE[k] = int(q[k][0])
            if "match" in q: STATE["match"] = q["match"][0]
            if "reset" in q: STATE.update({"delay": 0.0, "fail": 0, "failn": 0, "hang": 0, "match": "", "seen": 0, "hung": 0})
            body = json.dumps(STATE).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        self.forward()

    def do_POST(self): self.forward()
    def do_PUT(self): self.forward()
    def do_DELETE(self): self.forward()

    def forward(self):
        n = int(self.headers.get("Content-Length") or 0)
        data = self.rfile.read(n) if n else None
        hit = (not STATE["match"]) or (STATE["match"] in self.path)
        if hit and self.command != "OPTIONS":
            STATE["seen"] += 1
            if STATE["hang"]:
                STATE["hung"] += 1
                time.sleep(3600)  # never answer
                return
            if STATE["delay"]:
                time.sleep(STATE["delay"])
            if STATE["fail"] and STATE["failn"] > 0:
                STATE["failn"] -= 1
                body = json.dumps({"error": "pretend failure %d" % STATE["fail"]}).encode()
                self.send_response(STATE["fail"])
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers(); self.wfile.write(body)
                return
        hdrs = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length", "connection")}
        req = urllib.request.Request(UP + self.path, data=data, method=self.command, headers=hdrs)
        try:
            r = urllib.request.urlopen(req, timeout=60)
            status, rh, body = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            status, rh, body = e.code, e.headers, e.read()
        self.send_response(status)
        for k, v in rh.items():
            if k.lower() in ("transfer-encoding", "content-length", "connection"): continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(port=8788):
    srv = TS(("127.0.0.1", port), H)
    t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
    return srv


def ctl(**kw):
    q = urllib.parse.urlencode(kw)
    return json.loads(urllib.request.urlopen("http://localhost:8788/__ctl?" + q, timeout=5).read())
