"""Start the image three times under Render Free limits (512 MB, 0.1 CPU) and record time to the first healthy answer and the first search."""
import json, subprocess, sys, time, urllib.request
image = sys.argv[1]; runs = []
for i in range(3):
    subprocess.run(["docker", "rm", "-f", "pi-cold"], capture_output=True)
    t0 = time.time()
    subprocess.run(["docker", "run", "-d", "--name", "pi-cold", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL", "--memory", "512m", "--memory-swap", "512m", "--cpus", "0.1",
                    "-p", "127.0.0.1:8083:8080", "-e", "PORT=8080", image], check=True, capture_output=True)
    healthy = None
    while time.time() - t0 < 900:
        try:
            urllib.request.urlopen("http://127.0.0.1:8083/api/v1/health", timeout=3).read(); healthy = time.time() - t0; break
        except Exception: time.sleep(1)
    s = time.time()
    r = urllib.request.Request("http://127.0.0.1:8083/api/v1/discover/similar", data=json.dumps({"text": "I bake bread and walk by the river on weekends.", "method": "both", "k": 5}).encode(), headers={"Content-Type": "application/json"})
    status = urllib.request.urlopen(r, timeout=120).status; first = time.time() - s
    mem = subprocess.run(["docker", "exec", "pi-cold", "cat", "/sys/fs/cgroup/memory.current"], capture_output=True, text=True).stdout
    runs.append({"seconds_to_healthy": round(healthy, 1), "first_search_status": status, "first_search_seconds": round(first, 2), "memory_mb": round(int(mem) / 1048576)})
    print(runs[-1], flush=True)
subprocess.run(["docker", "rm", "-f", "pi-cold"], capture_output=True)
json.dump({"image": image, "runs": runs}, open(sys.argv[2], "w"), indent=1)
