"""Run the same searches against an image and save the answers; or compare two saved answers.

    python parity_check.py run IMAGE OUT.json [--platform linux/amd64] [--cpus 2] [--memory 1g]
    python parity_check.py compare A.json B.json

The queries are invented sentences plus the texts of fictional pool profiles, in both methods. The comparison reports
whether every ranking, every shared word, theme and answer, and every score is identical.
"""
import json, subprocess, sys, time, urllib.request, argparse

def run(image, out, platform, cpus, memory, limit=None):
    name = "pi-parity"
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    cmd = ["docker", "run", "-d", "--name", name, "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--cap-drop", "ALL", "--memory", memory,
           "--cpus", cpus, "-p", "127.0.0.1:8082:8080", "-e", "PORT=8080", "-e", "PROFILE_RATE_LIMIT_ENABLED=false"]
    if platform: cmd += ["--platform", platform]
    subprocess.run(cmd + [image], check=True, capture_output=True)
    base = "http://127.0.0.1:8082"
    t0 = time.time()
    while True:
        try:
            urllib.request.urlopen(base + "/api/v1/health", timeout=3).read(); break
        except Exception:
            if time.time() - t0 > 900: raise SystemExit("did not start")
            time.sleep(1)
    def call(path, body=None):
        r = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        return json.loads(urllib.request.urlopen(r, timeout=300).read())
    examples = call("/api/v1/examples")
    texts = [e["text"] for e in examples["examples"]] if "examples" in examples else []
    pool_texts = json.load(open("../../content/synthetic/profiles.json"))["pool"]
    texts += [p["text"] for p in pool_texts[::40]]
    texts += ["hiking with my dog and camping under the stars", "I love reading novels, drinking tea and writing poems", "a b c",
              "héllo wörld ñandú 日本語 café " * 10, "word " * 350, "Quick: cooking, music, travel, family and friends. " * 12]
    if limit: texts = texts[:limit]
    answers = []
    for text in texts:
        for method in ("both", "tfidf", "embeddings"):
            for k in (3, 10):
                try: ans = call("/api/v1/discover/similar", {"text": text[:2000], "method": method, "k": k})
                except Exception as e: ans = {"error": str(e)[:80]}
                answers.append({"method": method, "k": k, "len": len(text[:2000]), "answer": ans})
    json.dump({"image": image, "platform": platform or "native", "searches": len(answers), "answers": answers}, open(out, "w"))
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    print("wrote", out, len(answers), "searches")

def flat(x, path=""):
    if isinstance(x, dict):
        for k, v in x.items():
            if k in ("request_id", "elapsed_ms", "timing"): continue
            yield from flat(v, f"{path}/{k}")
    elif isinstance(x, list):
        for i, v in enumerate(x): yield from flat(v, f"{path}[{i}]")
    else: yield path, x

def compare(a, b):
    A, B = json.load(open(a)), json.load(open(b))
    n = min(len(A["answers"]), len(B["answers"]))  # the shorter run is a prefix of the longer one (same texts, same order)
    A["answers"], B["answers"] = A["answers"][:n], B["answers"][:n]
    exact = rank_same = 0; max_diff = 0.0; other = []
    for x, y in zip(A["answers"], B["answers"]):
        fx, fy = dict(flat(x["answer"])), dict(flat(y["answer"]))
        if fx == fy: exact += 1; rank_same += 1; continue
        ids_x = [v for p, v in fx.items() if p.endswith("/profile_id")]; ids_y = [v for p, v in fy.items() if p.endswith("/profile_id")]
        if ids_x == ids_y: rank_same += 1
        for p in fx:
            if p in fy and fx[p] != fy[p]:
                if isinstance(fx[p], float): max_diff = max(max_diff, abs(fx[p] - fy[p]))
                else: other.append(p)
    n = len(A["answers"])
    print(f"{n} searches | identical answers {exact} | identical rankings {rank_same} | largest score difference {max_diff:.2e} | other field differences {len(other)}")
    return exact == n

if __name__ == "__main__":
    if sys.argv[1] == "run":
        ap = argparse.ArgumentParser(); ap.add_argument("cmd"); ap.add_argument("image"); ap.add_argument("out"); ap.add_argument("--platform"); ap.add_argument("--cpus", default="2"); ap.add_argument("--memory", default="1g"); ap.add_argument("--texts", type=int, default=None)
        a = ap.parse_args(); run(a.image, a.out, a.platform, a.cpus, a.memory, a.texts)
    else:
        raise SystemExit(0 if compare(sys.argv[2], sys.argv[3]) else 1)
