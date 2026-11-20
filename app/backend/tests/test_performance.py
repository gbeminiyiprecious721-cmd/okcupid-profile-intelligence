"""Performance. Limits are generous so the test is stable. The measured numbers are printed with -s."""

import os
import resource
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from conftest import SAMPLE, similar

from profile_api.paths import BACKEND_DIR

QUERIES = [
    SAMPLE,
    "Weekends mean backpacks, mountain paths, a tent and a night under the stars far from the city.",
    "I write software for fun and enjoy figuring out how clever machines work.",
    "My puppy, my cat and I share a sofa, and every stroll round the block turns into a social event.",
    "Gigs, vinyl and a battered guitar in the corner of my room fill most of my free time.",
]


def timed(client, text, **extra):
    start = time.perf_counter()
    response = similar(client, text, **extra)
    assert response.status_code == 200
    return (time.perf_counter() - start) * 1000


def test_cold_start_in_a_fresh_process_is_reasonable(built_artifacts):
    """Measured in a new process, so earlier tests cannot have warmed anything."""
    script = (
        "import time; t=time.perf_counter()\n"
        "from fastapi.testclient import TestClient\n"
        "from profile_api.main import create_app\n"
        "imported=time.perf_counter()-t\n"
        "with TestClient(create_app()) as c:\n"
        "    loaded=time.perf_counter()-t-imported\n"
        "    t2=time.perf_counter(); r=c.post('/api/v1/discover/similar', json={'text':'hiking with my dog and cooking soup'})\n"
        "    first=time.perf_counter()-t2\n"
        "print(f'{imported:.1f} {loaded:.1f} {first*1000:.0f} {r.status_code}')\n"
    )
    env = {**os.environ, "HF_HUB_OFFLINE": "1"}
    out = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, check=True, env=env, cwd=BACKEND_DIR
    )
    imported, loaded, first_ms, status = out.stdout.strip().splitlines()[-1].split()
    print(f"\ncold start: imports {imported} s, artifacts and model loaded {loaded} s, first request {first_ms} ms")
    assert status == "200"
    assert float(imported) + float(loaded) < 60 and float(first_ms) < 1000


def test_warm_search_latency(client):
    for query in QUERIES:
        timed(client, query)  # warm
    samples = sorted(timed(client, QUERIES[i % len(QUERIES)], k=10) for i in range(60))
    median, p95 = statistics.median(samples), samples[int(len(samples) * 0.95) - 1]
    print(f"\nboth methods, k=10, 60 requests: median {median:.0f} ms, p95 {p95:.0f} ms, max {samples[-1]:.0f} ms")
    assert median < 250 and p95 < 1000


def test_each_method_alone_is_faster_than_both(client):
    embeddings = statistics.median(timed(client, SAMPLE, method="embeddings") for _ in range(15))
    tfidf = statistics.median(timed(client, SAMPLE, method="tfidf") for _ in range(15))
    print(f"\nembeddings alone {embeddings:.0f} ms, tfidf alone {tfidf:.0f} ms")
    assert tfidf < embeddings  # the TF-IDF path never touches the neural model


def test_parallel_requests_all_succeed_and_agree(client):
    with ThreadPoolExecutor(max_workers=8) as pool:
        bodies = list(pool.map(lambda _: similar(client, SAMPLE, k=5).json(), range(24)))
    assert all(body == bodies[0] for body in bodies)


def test_the_slowest_valid_input_stays_within_budget(client):
    longest = " ".join(["hiking with my dog and cooking soup"] * 60)[:2000]
    elapsed = timed(client, longest, k=10)
    print(f"\n2000 character input: {elapsed:.0f} ms")
    assert elapsed < 1500


def test_memory_stays_modest(client):
    peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024)  # bytes on macOS
    print(f"\npeak resident memory of the test process: {peak_mb:.0f} MB")
    assert peak_mb < 4000
