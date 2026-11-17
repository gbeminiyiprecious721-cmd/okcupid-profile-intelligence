# Privacy safe uptime and error monitoring

Principle: **monitor the service, never the visitors.** The application never receives personal data (visitors choose among fictional examples or type fictional text that is not stored), so monitoring must not be the place where that changes.

## What exists already
- **Health endpoint:** `GET /api/v1/health` returns `{"status":"ok","mode":"public","version":"..."}`. It is cheap, exempt from rate limiting and reveals nothing else.
- **Request log:** one JSON line per request on standard output, which every host collects:
  `{"event":"request","id":"c1e2982409cb","method":"GET","route":"/api/v1/meta","status":200,"ms":1.1,"bytes":3154}`
  It holds a random request id, the method, the **route template** (never the real path), the status, the time and the answer size. It does **not** hold the client address, the query string, any header (including the user agent), any request body or any answer text. Tests send marker strings through every kind of request and check that none reaches the log.
- **Request id header:** each answer carries `X-Request-ID`, so a person can quote it when something fails and you can find that line.
- **Log summary:** `python scripts/summarise_logs.py` reads log lines on standard input and reports counts, 5xx rate, 429 rate and p95 latency per route, and exits 1 over a threshold (defaults 2% and 500 ms). It can drive any alert.
- **Smoke test:** `scripts/smoke_test.py` checks 22 behaviours from outside with fictional input.

## Uptime monitoring design
| Check | How | Frequency | Alert |
|---|---|---|---|
| Is it up? | an external monitor requests `GET /api/v1/health` and expects status 200 and the text `"status":"ok"` | every 5 minutes | 3 failures in a row, to your email |
| Does it work? | `smoke_test.py` from a scheduled job (the draft GitHub Actions file `deploy/ci/staging-smoke.yml`) | every 6 hours | any failed check |
| Cold start | the monitor's response time on a scale to zero host | continuous | informational |
- **Choose a monitor that only fetches the URL.** It then sees the public health answer and nothing about visitors. No script of ours is loaded by it, no cookie is set, and the web application's policy (`connect-src 'self'`) would block any third party call anyway.
- **Private staging cannot be reached by an outside monitor** (the host requires a login). During staging, run the smoke test by hand after each deploy instead, passing the token in a header. Uptime monitoring starts with a public deployment.
- Free monitors exist (about 50 monitors at 5 minute intervals on common free plans; check current terms). Pick one by its data handling: it should not require installing anything on the site.

## Error monitoring design
- **No third party error SDK** (for example a browser or server error collector). Those capture stack traces, request data and sometimes addresses, which is exactly what must not leave. If one is ever wanted, it needs a scrub that drops request bodies, query strings, headers and addresses, a written review, and a change to the web policy to allow its host. It is not recommended for this project.
- **Server errors** appear as `status >= 500` in the request log and as one line from the application's error handler. The handler gives visitors a generic message and logs no input. A test raises an error containing a marker and checks that neither the answer nor the log line has it.
- **Browser errors** are not collected. The page shows the visitor a clear message and keeps what they typed. The browser test suite fails on any console error or page error, which is the safety net.
- **Alerts:** 5xx rate over 2% in 15 minutes; p95 latency over 500 ms for the search route; health failing 3 times; a sudden rise in 429 responses (a sign of abuse or a wrong client address setting).

## What is logged, kept and who can see it
| Data | Logged? | Kept | Who |
|---|---|---|---|
| Route template, status, timing, size, random request id | yes | the platform's default log retention, ideally 14 days or less | you |
| Client address | no (the application does not log it). The platform's own proxy may; check and, where possible, shorten or disable it | host dependent | check the host's policy |
| Query string, headers, user agent | no | | |
| Typed text, selected answers, example names | no | | |
| Search results | no | | |
| Anything in browser storage | the theme choice only, in the visitor's own browser | | the visitor |
**Action for each host:** read what the platform's proxy logs about visitors (address, user agent, paths) and its retention, and record it in `operations_and_rollback.md`. That is outside the application's control.

## Incident handling
1. Health failing: run the smoke test and read the log summary; if a release caused it, roll back (see `operations_and_rollback.md`) before investigating.
2. Rising 5xx: pull the log lines for that window, run `summarise_logs.py`, find the route, check memory (restarts from running out of memory look like a 5xx burst and slow starts).
3. Suspected abuse: lower the rate limits through the environment variables and redeploy, or stop the service. There is no data to protect or restore.
4. Suspected privacy leak: stop the service first. Review the logs with the privacy test markers in mind, then fix and add a test.
