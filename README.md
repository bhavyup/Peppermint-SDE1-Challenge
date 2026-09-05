# Fleet Management Dashboard — Assignment 1 (Frontend)

Peppermint Robotics SDE-1 hiring challenge. A single-page fleet dashboard that
replays `events.jsonl` at adjustable speed and can switch to a simulated live
feed, shows fleet-level trends over time, and lets an operator click into any
robot.

## Run it

```bash
cd frontend
npm install
npm run dev      # dev server
npm test         # vitest unit tests
npm run build    # production build in frontend/dist
npm run preview  # serve the production build locally
```

Node 18+ is enough. No backend, no environment variables.

## Live link

https://frontend-seven-ruby-40.vercel.app/

## What it does

- **Replay.** Loads `robots.json` + `events.jsonl`, plays the 15-minute window
  at 1×–30× with play/pause and a scrub slider (backward seeks are exact — see
  `stateAtTime`).
- **Live feed.** A client-side simulator (`src/sim/liveFeed.ts`) continues each
  robot from its final replayed state with plausible movement (waypoints routed around the walls in `layout.png` via A* on an
  occupancy grid built from the image pixels), a
  battery cycle (discharge → head to dock → charge → resume), and occasional
  blocked/error/maintenance episodes. It emits one event per robot every ~3 sim
  seconds, running at 5 sim-seconds per wall second. Both replay and live feed
  enter through the same `ingest` function, so every view is source-agnostic.
- **Map.** Canvas over `layout.png`, all 8 robots colored by status, attention
  highlights, click-to-select.
- **Trends.** % of fleet working (active + on_mission), % needing attention,
  and average battery over time (`TrendChart`).
- **Inspection.** Click a map dot or a list row for status, battery, position,
  and last-update time; a ⚠ filter shows only robots needing attention.

## Status semantics

- **Working** = `active` + `on_mission` (both mean the robot is usefully busy;
  `on_mission` additionally implies travel/executing a task).
- **Needs attention** = `blocked`, `error`, `offline`, or battery < 20%.
- `charging` is intentionally *not* attention; it's healthy behavior.
- `maintenance` is displayed but neither counted as working nor attention —
  it is a scheduled, expected state.

## Architecture

```
frontend/src/
  types.ts                   — RobotEvent, RobotState, status semantics
  sim/replay.ts              — parsing, per-robot indexing, stateAtTime (seek),
                               eventsBetween (forward advance)
  sim/liveFeed.ts            — LiveFeedSimulator (per-robot waypoint walkers,
                               battery cycle, seeded PRNG for determinism)
  sim/occupancy.ts           — layout.png → walkability grid + A* routing
                               (live feed avoids walls)
  state/fleetStore.ts        — THE store: Map<robot_id, RobotState> + trend
                               series; all sources enter via ingest()/seek()
  components/MapView.tsx     — canvas map
  components/TrendChart.tsx  — SVG fleet trends
  components/RobotPanel.tsx, Controls.tsx
  App.tsx                    — 250 ms engine loop driving replay or live feed
```

## AI delegation notes

Built by the user together with an AI pair-programmer (OpenCode). Rough split:
I set direction and reviewed; the AI drafted the plan
(`docs/BUILD_PLAN_FRONTEND.md`), scaffolded the Vite app, then I wrote the replay/seek
primitives, simulator, store, components, tests, and these docs. All code was
reviewed by AI and me both; the trickiest decisions (seek-by-
rebuild, snapshot-through-one-ingest design, `$headingToCharge` battery cycle)
are all done by me and covered by tests in `src/sim/*.test.ts` and discussed in ANSWERS.md.

## What I'd do next given more time

- Interpolated (smooth) motion between 5-second samples instead of jumps
- Historical trend for a single robot (battery curve per robot)
- Task-event markers on the trend chart
- WebSocket mode so a real backend can replace the in-browser live feed
  without touching the views
