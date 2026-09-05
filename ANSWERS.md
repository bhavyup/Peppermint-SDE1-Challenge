# ANSWERS — Assignment 1 (Frontend)

## 1. What holds the fleet's state, and why that shape?

The source of truth is `FleetStore` in `frontend/src/state/fleetStore.ts`:

- `robots: Map<robot_id, RobotState>` — last-value-wins table, one entry per
  robot holding the latest x, y, status, battery, and the sim time of its last
  event.
- `series: FleetSample[]` — a rolling time series of fleet-level aggregates
  (% working, % needing attention, avg battery), one sample per ~5 sim seconds.
- `simTime` — the current clock.

This shape is chosen because both data sources must drive identical views.
Every event — from the replay file or from the live-feed simulator — enters
through one function, `ingest(store, events)`, which just applies
last-value-wins updates and appends a trend sample. No part of the UI knows
(or can know) which source an event came from; `MapView`, `TrendChart`, and
`RobotPanel` render purely from the store. The `Map` keyed by `robot_id` gives
O(1) updates and trivially supports an arbitrary number of robots without
reindexing.

The one place the replay needs something `ingest` can't express is seeking
backwards: last-value-wins has no memory. For that, `seek()` calls
`stateAtTime()` in `src/sim/replay.ts`, which rebuilds the exact state by
taking, per robot, the latest recorded event with `t <= simTime` via binary
search over the pre-indexed per-robot arrays. So forward motion is incremental
apply; backward jumps are exact rebuilds — no event-sourcing inverse needed.

## 2. One real tradeoff

**I render robot positions from the raw 5-second samples with no interpolation
between them.** The alternative — interpolating positions linearly between
consecutive events — makes motion look smooth on the map, but it fabricates
positions the data never contained, and it complicates seek logic
(interpolating across a status change like `active → blocked` produces a robot
gliding while blocked) and the live feed (which emits on its own cadence).
The cost is visible: at 1× replay speed robots teleport every 5 seconds and it
looks choppy. I judged that acceptable because (a) an operator reading a
dashboard cares about *where the robot was last reported*, not a CGI guess,
and displaying inferred positions as fact is the kind of quiet corner-cutting
that misleads; and (b) the challenge gives us a speed control specifically
because operators will usually run at 5×–30×, where the stepping is barely
noticeable. The decision lives in `MapView` (draws `r.x, r.y` as-is) and in
the absence of any interpolation helper in `sim/replay.ts`.

A second, smaller tradeoff worth naming: the live feed runs entirely in the
browser instead of a server process. Cost: it isn't a "real" network feed and
can't demonstrate transport failure modes. Benefit: the deployed static site
is fully self-contained — the challenge's fallback requirement is satisfied
with zero operational risk — and the seam at `ingest()` means a server feed
could be dropped in later without touching any component.

## 3. What I left out, and what I'd build next

Cut deliberately to stay inside the timebox:

- **Smooth motion interpolation** — with the caveat above.
- **Wall-aware movement in the live feed.** Simulated robots use waypoints
  inside the layout bounds but don't respect walls in `layout.png`, so they
  can cross obstacles. Real pathfinding (grid A* over the image) is the next
  step there.
- **Per-robot history views.** The trend is fleet-level by design (that's what
  the assignment asks an operator to look at); a per-robot battery/status
  timeline is the obvious next panel — the data plumbing supports it already,
  it's purely a view.
- **`task_event` markers.** They're rare and ungraded, so they're parsed
  through the type but not displayed.

Given more time: (1) grid-based pathing for the simulator, (2) smooth
interpolation rendered as *trail* so inferred positions are visually distinct
from reported ones, (3) WebSocket input as a third source into `ingest`,
(4) alerts log (timestamped entries when a robot enters an attention state).
