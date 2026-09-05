# Build Plan — Assignment 2: Backend for Fleet Dashboard

## Goal
`docker compose up` brings up: a robot-simulation service (8 robot publishers replaying
their own slices of `events.jsonl`), a broker, and a backend that ingests the feed and
serves both a WebSocket stream and a REST endpoint from one consistent in-memory state.
Must tolerate publisher reconnects and WebSocket client drops.

## Data facts (same package as Assignment 1)
900-second log, ~5 s per robot, 8 robots, statuses idle/active/on_mission/charging/
blocked/error/maintenance/offline. Each robot replays only its own lines, in order.

## Stack choice
- **Python 3.12 + FastAPI** — one framework serves REST + WebSocket cleanly, async by
  default, tiny Dockerfile.
- **Transport: MQTT over Mosquitto** (eclipse-mosquitto image). Chosen because:
  real robots commonly use MQTT; QoS gives an honest tradeoff to discuss in ANSWERS Q2;
  Mosquitto is a single off-the-shelf container. Alternatives (Redis pub/sub, plain
  HTTP POST) documented as considered. Fallback if MQTT proves fiddly: Redis pub/sub.
- **State**: in-process dict guarded by asyncio semantics (single event loop → no locks
  needed for reads; one writer task).

## Architecture (compose services)
```
robot-sim    python service: spawns 8 publisher "processes"
             (multiprocessing.Process per robot — satisfies "not coroutines
             inside one process"; each replays its events at 1x, configurable)
broker       eclipse-mosquitto:2, topic fleet/robots/{robot_id}
backend      FastAPI:
               MQTT subscriber task -> StateStore
               GET /robots            -> full snapshot
               GET /robots/{id}       -> one robot
               GET /healthz
               WS  /ws                -> pushes RobotEvent on every ingest
```
Images pinned `linux/amd64` via compose `platform:` where needed.

## Core design
### State shape (ANSWERS Q1)
```python
class FleetState:
    robots: dict[str, RobotState]   # latest event per robot (Last-Value table)
    def ingest(event) -> list[subscribers to notify]
```
One dict-of-latest per robot_id = exactly what both consumers need: REST reads the
dict directly; WS clients get the same dict's deltas. Consistency is free because a
single `ingest()` is the only writer.

### Publisher detail
- `robot_sim/main.py`: parse robots.json, spawn Process per robot; each process reads
  its lines from a shared volume-mounted `events.jsonl`, sleeps `delta_t / SPEED`
  between events, publishes JSON to `fleet/robots/{id}` with QoS 0 (documented tradeoff:
  QoS 0 = drop-on-disconnect, acceptable because telemetry is ephemeral; QoS 1/retained
  discussed as alternative).
- Reconnect loop with backoff; on broker outage the publisher retries and resends its
  next scheduled event (no replay of skipped ones — state converges on next event).
- `PUBLISH_SPEED` env (default 5) to compress 15 min into 3 min.

### WebSocket fanout
- ConnectionManager: set of active sockets; on ingest → `json.dumps(event)` broadcast
  with try/except per socket, drop dead ones. Snapshot-on-connect: new WS client first
  receives `{type:"snapshot", robots:[...]}` then `{type:"update",...}` deltas — solves
  join-mid-stream and reconnect catch-up.

### Flakiness handling (required)
- Publisher: resiliencer loop around connect/publish (exponential backoff).
- Backend subscriber: auto-reconnect, count missed events via per-robot monotonic
  `seq` the publisher adds → backend can note gaps (surfaced as `last_seen`/staleness).
- Staleness: every 5 s a sweeper marks robots `offline`-flagged in API responses if no
  event for >N seconds — no state mutation, computed at read time.
- WS client: client of any consumer reconnects and gets fresh snapshot.

## Stretch goal (only if ≥1 h spare)
SQLite via aiosqlite; append each event; `GET /robots/history/{id}?from=&to=`.
Keeps write path async; SQLite chosen for zero extra services.

## Testing (the trickiest part)
pytest (no Docker needed):
1. StateStore ingest semantics — ordering, last-value-wins, snapshot/delta coherence.
2. WS flow — integration test with TestClient: connect 2 clients, ingest event, both
   receive identical payload; reconnect gets snapshot.
3. (If MQTT layer is thin) publisher event slicing: robot r_N receives only its own
   events, in order.

## Work breakdown (≈8–10 h)
1. Event slicing + multi-process publisher (1.5 h)
2. Compose wiring: mosquitto + conf (1 h)
3. StateStore + REST (1 h)
4. WS fanout + snapshot-on-connect (1.5 h)
5. Resilience: reconnect loops, staleness sweep (1.5 h)
6. Tests (1 h)
7. README (design decisions incl. why MQTT) + ANSWERS.md + SYSTEM_DESIGN.md (1.5 h)
8. Stretch history endpoint if time (1 h)

## Cut list (pre-declared)
- No auth/TLS on MQTT or WS.
- No per-subscriber rate limiting.
- History endpoint optional.
- A minimal HTML probe page on `/` only if trivially cheap (not required).

## Deliverables checklist
docker-compose.yml (one command, includes sim service) • README (design + AI notes) •
ANSWERS.md • SYSTEM_DESIGN.md • tests
