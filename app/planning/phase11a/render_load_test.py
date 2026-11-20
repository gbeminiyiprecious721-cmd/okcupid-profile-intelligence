"""Start a container under Render Free plan limits and measure it: python render_load_test.py IMAGE [--platform linux/amd64] [--cpus 0.1] [--memory 512m]

Measures: time to the first healthy answer, memory (cgroup current, peak, anonymous and file parts, OOM events),
sequential searches, concurrent searches, long texts, and a final health check. Uses invented sentences only.
The rate limits are raised for this test run only (a person would never send this many requests).
"""
import argparse, json, statistics, subprocess, threading, time, urllib.request, urllib.error, random

ap = argparse.ArgumentParser()
ap.add_argument("image"); ap.add_argument("--platform", default=None); ap.add_argument("--cpus", default="0.1")
ap.add_argument("--memory", default="512m"); ap.add_argument("--port", default="8081"); ap.add_argument("--out", default=None)
ap.add_argument("--env", action="append", default=[]); ap.add_argument("--light", action="store_true", help="fewer requests, for slow emulated runs")
a = ap.parse_args()
NAME = "pi-render-test"
subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
cmd = ["docker", "run", "-d", "--name", NAME, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL",
       "--security-opt", "no-new-privileges", "--pids-limit", "256", "--memory", a.memory, "--memory-swap", a.memory, "--cpus", a.cpus,
       "-p", f"127.0.0.1:{a.port}:8080", "-e", "PROFILE_RATE_LIMIT_SEARCH_PER_MINUTE=100000", "-e", "PROFILE_RATE_LIMIT_GENERAL_PER_MINUTE=100000", "-e", "PORT=8080"]
for e in a.env: cmd += ["-e", e]
if a.platform: cmd += ["--platform", a.platform]
cmd.append(a.image)
t0 = time.time(); subprocess.run(cmd, check=True, capture_output=True)
BASE = f"http://127.0.0.1:{a.port}"
def req(path, body=None, timeout=60):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json"} if data else {})
    s = time.time()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp: resp.read(); return resp.status, time.time() - s
    except urllib.error.HTTPError as e: return e.code, time.time() - s
    except Exception: return 0, time.time() - s
def cg(name):
    out = subprocess.run(["docker", "exec", NAME, "cat", f"/sys/fs/cgroup/{name}"], capture_output=True, text=True).stdout
    return out
def mem():
    cur = int(cg("memory.current")) / 1048576
    peak = cg("memory.peak").strip(); peak = int(peak) / 1048576 if peak.isdigit() else -1
    stat = dict(l.split() for l in cg("memory.stat").splitlines() if l)
    events = dict(l.split() for l in cg("memory.events").splitlines() if l)
    return {"current_mb": round(cur), "peak_mb": round(peak), "anon_mb": round(int(stat["anon"]) / 1048576), "file_mb": round(int(stat["file"]) / 1048576), "oom_kill": int(events.get("oom_kill", 0)), "high_events": int(events.get("high", 0)), "max_events": int(events.get("max", 0))}
res = {"image": a.image, "platform": a.platform or "native", "cpus": a.cpus, "memory_limit": a.memory}
status = 0
while time.time() - t0 < 600:
    status, _ = req("/api/v1/health", timeout=3)
    if status == 200: break
    time.sleep(0.5)
res["seconds_to_first_healthy_answer"] = round(time.time() - t0, 1) if status == 200 else None
if status != 200:
    res["failed"] = subprocess.run(["docker", "logs", "--tail", "8", NAME], capture_output=True, text=True).stderr[-600:]
    print(json.dumps(res, indent=1)); raise SystemExit(1)
res["memory_after_start"] = mem()
random.seed(7)
words = "garden river baking mountain letters piano cycling coffee harbour pottery maps notebook bridge winter market violin chess forest lantern bread tea ocean trail museum".split()
def text(n=60): return " ".join(random.choice(words) for _ in range(n)) + "."
lat = []
for i in range(10 if a.light else 30):
    s, t = req("/api/v1/discover/similar", {"text": text(), "method": "both", "k": 5}); lat.append((s, t))
res["sequential"] = {"ok": sum(1 for s, _ in lat if s == 200), "median_s": round(statistics.median(t for _, t in lat), 3), "max_s": round(max(t for _, t in lat), 3)}
res["memory_after_sequential"] = mem()
results = []; lock = threading.Lock()
def worker(n, long):
    for _ in range(n):
        s, t = req("/api/v1/discover/similar", {"text": text(330 if long else 60)[:2000], "method": "both", "k": 10}, timeout=120)
        with lock: results.append((s, t))
for label, threads, per, long in ((("concurrent_4x3", 4, 3, False), ("concurrent_4x2_long", 4, 2, True)) if a.light else (("concurrent_8x10", 8, 10, False), ("concurrent_16x5_long", 16, 5, True))):
    results.clear(); ths = [threading.Thread(target=worker, args=(per, long)) for _ in range(threads)]
    s0 = time.time(); [t.start() for t in ths]; [t.join() for t in ths]
    res[label] = {"requests": len(results), "ok": sum(1 for s, _ in results if s == 200), "other_status": sorted({s for s, _ in results if s != 200}), "median_s": round(statistics.median(t for _, t in results), 2), "max_s": round(max(t for _, t in results), 2), "wall_s": round(time.time() - s0, 1)}
    res["memory_after_" + label] = mem()
other = [req(p)[0] for p in ("/", "/api/v1/meta", "/api/v1/lab/summary", "/api/v1/health")]
res["other_endpoints"] = other
inspect = json.loads(subprocess.run(["docker", "inspect", NAME], capture_output=True, text=True).stdout)[0]["State"]
res["container_state"] = {"status": inspect["Status"], "oom_killed": inspect["OOMKilled"], "restarts": 0, "exit_code": inspect["ExitCode"]}
res["final_memory"] = mem()
print(json.dumps(res, indent=1))
if a.out: open(a.out, "w").write(json.dumps(res, indent=1) + "\n")
subprocess.run(["docker", "rm", "-f", NAME], capture_output=True)
