# Build Plan — Assignment 1: Frontend Fleet Dashboard

## Goal
A deployed single-page dashboard where an operator watches 8 robots on the site map,
replays `events.jsonl` at adjustable speed *and* watches a simulated live feed, sees at
least one fleet-level trend over time, and can click any robot to inspect it.

## Data facts (verified)
- `layout.png` — 900 × 560 px, origin top-left, 1 px = 1 unit.
- `robots.json` — 8 robots (4 picker, 4 hauler), start positions.
- `events.jsonl` — 15 min (t: 0–900), one JSON per line, ~5 s per robot (~1 440 lines).
  Statuses: idle, active, on_mission, charging, blocked, error, maintenance, offline.
  Rare `task_event` keys — safe to ignore or show as a small badge.

## Stack choice
- **Vite + React + TypeScript** — fast to build, free static hosting.
- **Canvas (or SVG) for the map** — 8 markers is trivial; plain `<canvas>` redraw is
  simple and cheap. No map library needed.
- **No backend.** Static bundle + a small client-side live-feed generator. Deploy on
  GitHub Pages / Netlify / Vercel. This trivially satisfies "deployed link works with
  no setup" and the fallback rule for the live feed.
- Tiny trend chart: hand-rolled SVG sparkline (no chart lib dependency) or Recharts if
  time allows.

## Architecture
```
src/
  data/loadEvents.ts      — fetch + parse events.jsonl & robots.json, index per robot
  sim/liveFeed.ts         — live-feed generator (see below)
  state/fleetStore.ts     — single source of truth (Zustand or useReducer)
  components/MapView.tsx  — canvas: layout.png + robot dots (colored by status)
  components/TrendChart.tsx — fleet-level trend (e.g. % active) over t
  components/RobotPanel.tsx — selected robot detail (status, battery, pos, type)
  components/Controls.tsx — mode toggle (replay/live), speed (1x/5x/10x/30x), scrubber
```

### State shape (ANSWERS Q1)
`fleetStore: { mode: 'replay'|'live', simTime: number, robots: Record<robot_id, {x,y,status,battery}>, series: [{t, activeCount, chargingCount, ...}] }`
Both replay and live feed push the same `RobotEvent` type through one `ingest(event)`
function → identical views regardless of source. History series appended on ingest.

### Replay engine
- Wall-clock timer (requestAnimationFrame or setInterval at ~4 ticks/s).
- `simTime` advances at `speed` × real time; ingest all events with `t <= simTime`.
- Scrubber lets the operator jump; on jump back, reset robots to nearest prior event
  per robot (precompute per-robot sorted arrays once at load).

### Live feed generator
Pure client-side state machine per robot, seeded from each robot's final replayed state:
- Movement: pick a random waypoint on the floor area of the layout, move toward it at
  a plausible speed (~20–40 px/s), pick a new waypoint on arrival. Keep robots inside
  free space **or** just use bounding-box edges with walls only lightly honored —
  document the simplification.
- Battery: −0.3–0.8 %/tick while moving; when <20 % go to charging waypoint, `charging`,
  +3 %/tick until >95 % → back to idle/active.
- Status transitions: idle → active/on_mission; occasional blocked (30 s) → resumes;
  rare error requiring longer pause. Emit an event per robot every ~2–5 s.

### Trend (rubric #2)
Primary: **% of fleet "productive" (active + on_mission) over time** — line chart updated
each ingest. Secondary cheap one: average battery over time. Decisions documented as:
"working = active+on_mission; attention = blocked/error/offline or battery<20%".

### Robot inspection (rubric #3)
- Click dot (or list) → side panel: id, type, live status w/ color, battery bar, pos,
  last-update age.
- "Needs attention" filter chip that highlights blocked/error/offline/low-battery robots
  on the map (pulsing outline).

## Testing (the trickiest part)
Vitest unit tests for:
1. Replay ingest + **seek-backwards** logic (reset to nearest prior event).
2. Live-feed simulator invariants: positions stay in bounds, battery within 0–100,
   status machine transitions legal.

## Work breakdown (≈6–8 h)
1. Scaffold + data loading + static map render (1 h)
2. Replay engine + speed control + scrubber (1.5 h)
3. fleetStore + status color scheme + robot panel (1 h)
4. Trend chart (1 h)
5. Live feed generator (1.5 h)
6. Tests (0.75 h)
7. Deploy + README + ANSWERS.md + SYSTEM_DESIGN.md (1.5 h)

## Cut list (pre-declared if squeezed)
- Fancy walls/pathfinding for live feed (robots may drift over obstacles).
- Chart library → hand-rolled SVG.
- No WebSocket server; live feed purely in-browser (documented decision).

## Deliverables checklist
README (run + AI notes) • ANSWERS.md • SYSTEM_DESIGN.md (5 questions) •
deployed link verified incognito • 2+ tests
