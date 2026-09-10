#!/usr/bin/env python
"""Loopback benchmark for the itinerary service.

Boots a real uvicorn server on localhost, drives it over HTTP with httpx, and
regenerates ``docs/BENCHMARKS.md``. Run it with ``make bench``.

Why a real server rather than httpx's ASGITransport: an in-process transport
skips uvicorn, the socket, and the HTTP parse/serialise round trip, so any
throughput number it produced would describe the handler rather than the
service. Everything here goes over a loopback socket to a real server. It is
still a single machine with no network between client and server -- see the
"What these numbers are not" section written into the generated report.

Scenarios
---------
``miss``      Sequential, every payload unique, so every request is a cache
              miss and pays the full generate-validate-persist path.
``hit``       Sequential, one payload repeated after a warm-up, so every
              request after the first resolves from the cache.
``read``      Sequential ``GET /api/v1/itineraries/{id}`` -- the cheapest path,
              and in most real deployments the most common one.
``mixed``     Concurrent, drawn from a Zipf-shaped pool of destinations, which
              is where the hit rate and throughput figures come from.

Cache-hit accounting is done client-side and needs no server instrumentation:
a miss mints a fresh ``uuid4`` while a hit returns the stored record, so an id
we have already seen is by definition a hit.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import platform
import random
import socket
import statistics
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "BENCHMARKS.md"

# A Zipf exponent of 1.1 puts ~45% of requests on the top few destinations,
# which is the shape a travel service actually sees (a long tail behind a small
# set of very popular cities). It is a modelling assumption, not measured
# traffic -- the generated report says so, because the hit rate is a property
# of this distribution and not of the service.
ZIPF_EXPONENT = 1.1

DESTINATIONS = [
    "Paris, France",
    "Tokyo, Japan",
    "New York, USA",
    "Rome, Italy",
    "Barcelona, Spain",
    "London, UK",
    "Kyoto, Japan",
    "Lisbon, Portugal",
    "Amsterdam, Netherlands",
    "Istanbul, Turkey",
    "Mexico City, Mexico",
    "Cape Town, South Africa",
    "Reykjavik, Iceland",
    "Hanoi, Vietnam",
    "Buenos Aires, Argentina",
]
INTEREST_POOL = [
    ["food", "history"],
    ["museums", "architecture"],
    ["hiking", "nature"],
    ["nightlife", "music"],
    ["temples", "gardens"],
]


def payload(destination: str, variant: int = 0, unique: str | None = None) -> dict[str, object]:
    """Build a valid ``TravelPreferences`` body.

    ``variant`` perturbs the fields that feed the cache key, so callers can reuse
    a payload (a hit) or vary it (usually a miss).

    ``unique`` guarantees a miss. Every ``variant``-driven field is modular
    (``% 60``, ``% 20``, ``% 5``, ``% 4``), so payloads repeat with a period of
    60 and a caller asking for "all distinct" silently starts hitting the cache
    past that. Callers that need a genuine miss every time pass a distinct
    ``unique`` token, which lands in ``notes`` and so in the cache key.
    """
    start = date(2026, 4, 1) + timedelta(days=variant % 60)
    body: dict[str, object] = {
        "destination": destination,
        "start_date": start.isoformat(),
        "end_date": (start + timedelta(days=3)).isoformat(),
        "budget_usd": 1500 + (variant % 20) * 100,
        "interests": INTEREST_POOL[variant % len(INTEREST_POOL)],
        "pace": "moderate",
        "travel_style": "midrange",
        "group_size": 1 + (variant % 4),
    }
    if unique is not None:
        body["notes"] = unique
    return body


@dataclass
class Samples:
    """Latency samples for one scenario, in milliseconds."""

    name: str
    latencies_ms: list[float] = field(default_factory=list)
    ids_seen: list[str] = field(default_factory=list)
    #: Ids the cache already held before the timed window opened, from an
    #: untimed warm-up. Without this the first timed request looks novel to the
    #: client even though the server served it from cache, understating the hit
    #: rate by exactly one request.
    prewarmed_ids: set[str] = field(default_factory=set)
    errors: int = 0
    wall_seconds: float = 0.0

    @property
    def count(self) -> int:
        return len(self.latencies_ms)

    @property
    def hit_rate(self) -> float | None:
        """Share of responses returning an already-issued itinerary id.

        A miss mints a fresh uuid4; a hit returns the stored record. So an id
        seen before -- either earlier in this scenario or during its warm-up --
        was served from cache.

        ``None`` when ids were not collected (the read scenario re-fetches one
        known id, so "hit" is not meaningful there).
        """
        if not self.ids_seen:
            return None
        seen: set[str] = set(self.prewarmed_ids)
        hits = 0
        for itinerary_id in self.ids_seen:
            if itinerary_id in seen:
                hits += 1
            seen.add(itinerary_id)
        return hits / len(self.ids_seen)

    @property
    def throughput_rps(self) -> float:
        return self.count / self.wall_seconds if self.wall_seconds > 0 else 0.0

    def percentile(self, pct: float) -> float:
        """Nearest-rank percentile over the sorted samples.

        Nearest-rank (rather than an interpolating estimator) keeps every
        reported figure an actually-observed measurement, which matters most at
        p99 where the sample count is small.
        """
        if not self.latencies_ms:
            return 0.0
        ordered = sorted(self.latencies_ms)
        rank = max(0, min(len(ordered) - 1, int(round(pct / 100 * len(ordered) + 0.5)) - 1))
        return ordered[rank]

    def summary(self) -> dict[str, object]:
        return {
            "scenario": self.name,
            "requests": self.count,
            "errors": self.errors,
            "p50_ms": round(self.percentile(50), 2),
            "p95_ms": round(self.percentile(95), 2),
            "p99_ms": round(self.percentile(99), 2),
            "mean_ms": round(statistics.fmean(self.latencies_ms), 2) if self.latencies_ms else 0.0,
            "throughput_rps": round(self.throughput_rps, 1),
            "cache_hit_rate": None if self.hit_rate is None else round(self.hit_rate, 4),
        }


def free_port() -> int:
    """Reserve an ephemeral port and hand back the number."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@contextlib.contextmanager
def running_server(port: int, db_path: Path, log_path: Path):
    """Run uvicorn on ``port`` for the duration of the block.

    Rate limiting is switched off: the production limit is 10 writes/min/IP,
    which every scenario here would trip within seconds. That is a deliberate
    change to the configuration under test and the report states it.

    Server output goes to ``log_path`` rather than a pipe. A pipe nothing drains
    deadlocks the server as soon as it fills the OS buffer, which presents as
    requests hanging long after a successful startup probe.
    """
    env = {
        **os.environ,
        "LLM_PROVIDER": "mock",
        "RATE_LIMIT_ENABLED": "false",
        "CACHE_BACKEND": "memory",
        "DATABASE_URL": f"sqlite+aiosqlite:///{db_path.as_posix()}",
        "LOG_LEVEL": "WARNING",
        "PYTHONPATH": str(REPO_ROOT),
    }
    with log_path.open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(
            [
                sys.executable, "-m", "uvicorn", "api.main:app",
                "--host", "127.0.0.1", "--port", str(port),
                "--log-level", "warning",
            ],
            cwd=REPO_ROOT,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            _await_ready(proc, port, log_path)
            yield
        finally:
            proc.terminate()
            with contextlib.suppress(subprocess.TimeoutExpired):
                proc.wait(timeout=15)
            if proc.poll() is None:  # pragma: no cover - only on a wedged server
                proc.kill()


def _tail(log_path: Path, lines: int = 25) -> str:
    with contextlib.suppress(OSError):
        text = log_path.read_text(encoding="utf-8", errors="replace")
        return "\n".join(text.splitlines()[-lines:])
    return "(no server output)"


def _await_ready(proc: subprocess.Popen[bytes], port: int, log_path: Path,
                 timeout: float = 90.0) -> None:
    """Block until ``/ready`` answers, or fail with the server's own output.

    ``/ready`` rather than ``/health``: health is a dependency-free liveness
    probe and answers even when the database is unreachable, which would let the
    benchmark start against a server that cannot serve a single request.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"server exited during startup (rc={proc.returncode}):\n{_tail(log_path)}"
            )
        try:
            response = httpx.get(f"http://127.0.0.1:{port}/ready", timeout=5.0)
            if response.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    raise RuntimeError(
        f"server was not ready within {timeout:.0f}s:\n{_tail(log_path)}"
    )


async def _post(client: httpx.AsyncClient, body: dict[str, object], out: Samples) -> None:
    """Issue one generate request and record its latency and itinerary id."""
    started = time.perf_counter()
    try:
        response = await client.post("/api/v1/itineraries", json=body)
    except httpx.HTTPError:
        out.errors += 1
        return
    elapsed_ms = (time.perf_counter() - started) * 1000
    if response.status_code != 201:
        out.errors += 1
        return
    out.latencies_ms.append(elapsed_ms)
    out.ids_seen.append(str(response.json()["id"]))


async def scenario_miss(client: httpx.AsyncClient, n: int) -> Samples:
    """Every request a distinct payload, so none can be served from cache."""
    out = Samples("Uncached (cache miss)")
    started = time.perf_counter()
    for i in range(n):
        body = payload(
            DESTINATIONS[i % len(DESTINATIONS)], variant=1000 + i, unique=f"bench-miss-{i}"
        )
        await _post(client, body, out)
    out.wall_seconds = time.perf_counter() - started
    return out


async def scenario_hit(client: httpx.AsyncClient, n: int) -> Samples:
    """One payload repeated; the warm-up request is excluded from the samples."""
    body = payload("Paris, France", variant=7)
    warmed = await client.post("/api/v1/itineraries", json=body)  # warm the cache
    out = Samples("Cached (cache hit)")
    if warmed.status_code == 201:
        out.prewarmed_ids.add(str(warmed.json()["id"]))
    started = time.perf_counter()
    for _ in range(n):
        await _post(client, body, out)
    out.wall_seconds = time.perf_counter() - started
    return out


async def scenario_read(client: httpx.AsyncClient, n: int) -> Samples:
    """Re-fetch one stored itinerary by id."""
    created = await client.post("/api/v1/itineraries", json=payload("Rome, Italy", variant=11))
    itinerary_id = created.json()["id"]
    out = Samples("Read by id (GET)")
    started = time.perf_counter()
    for _ in range(n):
        request_started = time.perf_counter()
        try:
            response = await client.get(f"/api/v1/itineraries/{itinerary_id}")
        except httpx.HTTPError:
            out.errors += 1
            continue
        if response.status_code != 200:
            out.errors += 1
            continue
        out.latencies_ms.append((time.perf_counter() - request_started) * 1000)
    out.wall_seconds = time.perf_counter() - started
    return out


async def scenario_mixed(client: httpx.AsyncClient, n: int, concurrency: int, seed: int) -> Samples:
    """Concurrent Zipf-shaped traffic -- the hit rate and throughput figures."""
    rng = random.Random(seed)
    weights = [1 / (rank**ZIPF_EXPONENT) for rank in range(1, len(DESTINATIONS) + 1)]
    bodies = [
        payload(rng.choices(DESTINATIONS, weights=weights, k=1)[0], variant=rng.randrange(3))
        for _ in range(n)
    ]

    out = Samples(f"Mixed workload (concurrency {concurrency})")
    gate = asyncio.Semaphore(concurrency)

    async def one(body: dict[str, object]) -> None:
        async with gate:
            await _post(client, body, out)

    started = time.perf_counter()
    await asyncio.gather(*(one(body) for body in bodies))
    out.wall_seconds = time.perf_counter() - started
    return out


async def run(port: int, n: int, concurrency: int, seed: int) -> list[Samples]:
    base = f"http://127.0.0.1:{port}"
    pool = concurrency + 8
    limits = httpx.Limits(max_connections=pool, max_keepalive_connections=pool)
    async with httpx.AsyncClient(base_url=base, timeout=30.0, limits=limits) as client:
        # Untimed warm-up: first-touch import, connection setup and SQLite page
        # cache would otherwise land entirely in the first scenario.
        for i in range(5):
            await client.post("/api/v1/itineraries", json=payload("Oslo, Norway", variant=500 + i))
        return [
            await scenario_miss(client, n),
            await scenario_hit(client, n),
            await scenario_read(client, n),
            await scenario_mixed(client, n * 2, concurrency, seed),
        ]


def render(results: list[Samples], meta: dict[str, object]) -> str:
    """Render the report. Regenerated wholesale, never hand-edited."""
    rows = [r.summary() for r in results]
    lines = [
        "# Benchmarks",
        "",
        "**Generated by `make bench`** (`scripts/bench.py`). Do not hand-edit — the next",
        "run overwrites this file. Every number below came from the run recorded in",
        "_Run metadata_; re-running on different hardware will produce different figures.",
        "",
        "## Results",
        "",
        "| Scenario | Requests | p50 | p95 | p99 | Mean | Throughput | Cache hits |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        hit = row["cache_hit_rate"]
        hit_cell = f"{hit * 100:.1f}%" if isinstance(hit, float) else "n/a"
        lines.append(
            f"| {row['scenario']} | {row['requests']} | {row['p50_ms']} ms | "
            f"{row['p95_ms']} ms | {row['p99_ms']} ms | {row['mean_ms']} ms | "
            f"{row['throughput_rps']} req/s | {hit_cell} |"
        )

    errors = sum(r.errors for r in results)
    by_name = {r.name: r for r in results}

    def p50_of(prefix: str) -> str:
        for name, sample in by_name.items():
            if name.startswith(prefix):
                return f"{sample.percentile(50):.2f} ms"
        return "n/a"

    seq_miss, seq_hit = p50_of("Uncached"), p50_of("Cached")
    lines += [
        "",
        f"Failed requests across all scenarios: **{errors}**.",
        "",
        "The 0% and 100% in the cache column are the two controlled scenarios and act",
        "as a self-check: if the \"uncached\" row ever reports hits, its payloads were",
        "not distinct and its latencies are not miss latencies. `scripts/bench.py`",
        "exits non-zero when that happens.",
        "",
        "## Reading the results",
        "",
        f"**The cached-vs-uncached gap here ({seq_miss} -> {seq_hit} at p50) is not the",
        "cache's real benefit, and understates it enormously.** The cache exists to skip",
        "the LLM call, and under the `mock` provider that call is free — so this gap is",
        "only the prompt assembly, validation and persistence the miss path additionally",
        "performs. Against a real provider the uncached row would be hundreds of",
        "milliseconds to seconds and the hit row would barely move. Quantifying the",
        "actual benefit needs a run against a live provider, which this harness does not",
        "do.",
        "",
        "**Concurrency is where the interesting number is.** The sequential rows are",
        f"single-request service overhead; the mixed row ({p50_of('Mixed')} p50) is what",
        "queueing does on one uvicorn worker writing to a single SQLite file, which",
        "serialises writers. That spread between p50 and p99 is the figure to watch when",
        "the Postgres and multi-worker comparisons get run — it is the one most likely to",
        "improve.",
        "",
        "## Run metadata",
        "",
        "| | |",
        "|---|---|",
        f"| Date (UTC) | {meta['timestamp']} |",
        f"| Commit | `{meta['commit']}` |",
        f"| Python | {meta['python']} |",
        f"| Platform | {meta['platform']} |",
        f"| Logical CPUs | {meta['cpus']} |",
        f"| LLM provider | `{meta['provider']}` |",
        f"| Database | `{meta['database']}` |",
        f"| Cache backend | `{meta['cache']}` |",
        f"| Rate limiting | `{meta['rate_limit']}` |",
        f"| Requests per scenario | {meta['n']} (mixed: {meta['n_mixed']}) |",
        f"| Mixed concurrency | {meta['concurrency']} |",
        "",
        "## What these numbers are not",
        "",
        "Read this before quoting anything above.",
        "",
        "- **Not real model latency.** Every scenario runs against the deterministic",
        "  `mock` provider, which returns instantly. A real provider adds hundreds of",
        "  milliseconds to seconds per *uncached* request and would dominate the",
        "  \"Uncached\" row entirely. What that row measures is the service's own",
        "  overhead — prompt assembly, schema validation, normalisation, persistence —",
        "  not the cost of generating an itinerary.",
        "- **Not a network measurement.** Client and server are the same machine over",
        "  loopback. No DNS, TLS, proxy, or physical link is in the path.",
        "- **Not the deployed configuration.** Rate limiting is disabled (production",
        "  caps writes at 10/min/IP, which every scenario would trip in seconds), the",
        "  database is a local SQLite file rather than Postgres, and the cache is",
        "  in-process rather than Redis.",
        "- **Not a production cache hit rate.** The mixed scenario draws destinations",
        f"  from a Zipf distribution (exponent {ZIPF_EXPONENT}) over"
        f" {len(DESTINATIONS)} cities. That",
        "  hit rate is a property of that synthetic distribution, not of the service and",
        "  not of any observed traffic. Feed it a different mix and it changes.",
        "- **A cache hit is not a zero-I/O path.** The cache maps a preference",
        "  fingerprint to an itinerary id; serving a hit still does a database read to",
        "  load the row. The \"Cached\" row is the cost of *skipping the LLM*, not of",
        "  skipping I/O.",
        "- **Single process.** One uvicorn worker, no load balancer, no horizontal",
        "  scaling.",
        "",
        "## Reproducing",
        "",
        "```bash",
        "make bench                    # regenerate this file",
        "python scripts/bench.py --help  # requests, concurrency, seed, output path",
        "```",
        "",
        "The mixed scenario is seeded, so the request mix is identical run to run;",
        "latency naturally varies with machine load.",
        "",
    ]
    return "\n".join(lines)


def git_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT, capture_output=True, text=True, timeout=10, check=True,
        )
        return out.stdout.strip() or "unknown"
    except (subprocess.SubprocessError, OSError):  # pragma: no cover - git absent
        return "unknown"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("-n", "--requests", type=int, default=200,
                        help="requests per scenario (mixed uses 2x); default 200")
    parser.add_argument("-c", "--concurrency", type=int, default=16,
                        help="concurrent requests in the mixed scenario; default 16")
    parser.add_argument("--seed", type=int, default=1729, help="RNG seed for the mixed workload")
    parser.add_argument("-o", "--output", type=Path, default=DEFAULT_OUTPUT,
                        help="report path; default docs/BENCHMARKS.md")
    parser.add_argument("--json", type=Path, default=None, help="also write raw results as JSON")
    args = parser.parse_args()

    port = free_port()
    # ignore_cleanup_errors: on Windows the SQLite handle can outlive the
    # terminated uvicorn process by a moment, and rmtree then raises WinError 32
    # -- after the run has already succeeded. A stray file under the OS temp
    # directory is not worth losing the results over.
    with tempfile.TemporaryDirectory(prefix="tai-bench-", ignore_cleanup_errors=True) as tmp:
        db_path = Path(tmp) / "bench.db"
        log_path = Path(tmp) / "server.log"
        print(f"starting uvicorn on 127.0.0.1:{port} (mock provider, rate limiting off)...")
        with running_server(port, db_path, log_path):
            print(f"running {args.requests} requests/scenario, concurrency {args.concurrency}...")
            results = asyncio.run(run(port, args.requests, args.concurrency, args.seed))

    meta = {
        "timestamp": datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        "commit": git_commit(),
        "python": platform.python_version(),
        "platform": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "cpus": os.cpu_count() or "unknown",
        "provider": "mock",
        "database": "sqlite+aiosqlite (temporary file)",
        "cache": "memory",
        "rate_limit": "disabled",
        "n": args.requests,
        "n_mixed": args.requests * 2,
        "concurrency": args.concurrency,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render(results, meta), encoding="utf-8")
    # relative_to raises for an --output outside the repo, so only shorten when
    # the path is actually below it.
    shown = args.output
    with contextlib.suppress(ValueError):
        shown = args.output.resolve().relative_to(REPO_ROOT)
    print(f"wrote {shown}")

    if args.json:
        args.json.write_text(
            json.dumps({"meta": meta, "results": [r.summary() for r in results]}, indent=2),
            encoding="utf-8",
        )
        print(f"wrote {args.json}")

    for row in (r.summary() for r in results):
        print(f"  {row['scenario']:36} p50={row['p50_ms']:>8} ms  p99={row['p99_ms']:>8} ms  "
              f"{row['throughput_rps']:>7} req/s")

    # Self-checks. The two controlled scenarios have known-correct hit rates, so
    # they double as an assertion that the workload is doing what it claims. An
    # earlier version of this script let the miss scenario drift to a 70% hit
    # rate -- the payload fields all cycle with a period of 60 -- and every
    # latency figure in that row was quietly wrong as a result.
    problems: list[str] = []
    by_name = {r.name: r for r in results}
    miss = by_name.get("Uncached (cache miss)")
    if miss is not None and miss.hit_rate:
        problems.append(
            f"miss scenario served {miss.hit_rate:.1%} from cache (expected 0%); "
            "its payloads are not distinct, so its latencies are not miss latencies"
        )
    hit = by_name.get("Cached (cache hit)")
    if hit is not None and hit.hit_rate != 1.0:
        problems.append(
            f"hit scenario served {hit.hit_rate or 0:.1%} from cache (expected 100%)"
        )

    total_errors = sum(r.errors for r in results)
    if total_errors:
        problems.append(f"{total_errors} failed requests")

    for problem in problems:
        print(f"WARNING: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
