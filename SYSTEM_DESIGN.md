# SYSTEM_DESIGN

Written against the frontend submission (Assignment 1). File references are
relative to `frontend/src/`.

## 1. Adding a new feature — does the design accommodate it?

Take a concrete feature: **"notify the operator when any robot's battery drops
below 15% while not charging, and keep a dismissible alert list."**

This plugs in without touching the core. `FleetStore.ingest()`
(`state/fleetStore.ts`) is the single choke point where every robot update
passes, from both replay and live feed. An alert rule is a pure function of
`(prevRobot, newEvent)` — a natural place is a small `alerts.ts` module called
from `ingest`, appending `{t, robot_id, kind}` to a new `alerts` field in the
store. The view side is one new component reading `store.alerts`; map, trends,
and panels are untouched because `RobotState`'s shape doesn't change. The
reason this is easy is the decision described in ANSWERS.md: all sources funnel
through `ingest`, and the store is the only render input. A feature that needs
a new *kind* of data (e.g. temperature readings) would be a field on
`RobotEvent`/`RobotState`, again additive. The only rework-triggering change
would be needing *history* per robot in the UI — the store is
last-value-wins — but `stateAtTime` and the `series` already demonstrate the
two escape hatches (rebuild from log, append trend samples), so even that is
an extension, not a rewrite.

## 2. Scaling from 8 robots to 500 — what breaks first?

**The map rendering and the trend-line SVG, roughly together.** `MapView`
redraws the entire canvas every store update: with a 250 ms engine tick that's
fine for 8 dots; at 500 it's still OK per frame, but the *input rate* becomes
the problem: 500 robots reporting every 5 s is 100 events/s, replayed at 30×
that's 3 000 events/s, each producing a new `Map` via `applyEvents`
(`sim/replay.ts`) — a full 500-entry `Map` clone per tick plus a full canvas
redraw, plus `TrendChart` re-rendering an SVG `path` string of up to
`SERIES_MAX` points. So the first wall is **O(robots) work per tick in
React-land**. Fixes in order: (a) batch ticks (advance the engine per
animation frame, not fixed interval), (b) make `applyEvents` clone only
changed entries (structural sharing), (c) mark dirty rects / use offscreen
canvas or WebGL for dots, (d) downsample the trend series (already bounded by
`SERIES_MAX`, reduce 5 s cadence at high fleet counts). Data shape survives:
`Map<robot_id, RobotState>` is exactly the right structure for 500 robots.
If rendered robots go past ~2 000, canvas → WebGL (e.g. PixiJS) and the
rest of the design is unchanged.

## 3. Bandwidth-limited robot → backend links

Three knobs, in order of preference:

1. **Send deltas, not snapshots.** x, y change by a few px between 5 s samples;
   send `dx, dy` in fixed-point (1 byte each direction) plus status as an enum
   byte and battery as one byte. A full event goes from ~80 bytes of JSON to
   ~6 bytes. Requires a per-robot baseline the consumer holds — which my store
   already does (last-value state), so reconstruction is `x += dx`.
2. **Adaptive cadence by state.** An idle or charging robot is boring: report
   every 30–60 s. Robots `on_mission` report at 5 s; `blocked`/`error` keep
   reporting (you want to know they're *still* stuck). This is a policy on the
   robot, but the consumer must tolerate variable gaps — my `lastT` field and
   the staleness logic in q5 below already assume that.
3. **Reduce precision/content under pressure.** Drop the tenth-of-a-pixel,
   report battery in whole percents, batch several samples into one packet,
   and if things are dire, send only status changes plus a heartbeat.

What I'd *not* do first is compress on the wire — fixed-point delta encoding
goes much further and stays lossless enough for this dashboard.

## 4. A robot goes down mid-task and stops responding

**Detection:** there's no liveness status in the feed, so silence must be
inferred. Every `RobotState` already carries `lastT` — a robot is stale when
`now - lastT` exceeds a threshold (3× the publish interval ≈ 15 s here). In a
fuller version of this UI, a background sweep marks such robots as
provisionally `offline` (shown distinctly, greyed, with "last seen Xs ago");
right now the staleness signal exists in the data but isn't surfaced as its
own status — that's an explicit gap noted in ANSWERS.md.

**System response:** fleet-level: the working-% trend (`fleetStore.ts`
`sample()`) automatically excludes it, which is correct — a dead robot is not
productive capacity. Task-level: the mid-task part needs a task owner
(dispatcher/backend). The pattern is a lease: the task assigned to r6 has a
deadline derived from its last known position/ETA; on staleness timeout the
dispatcher re-queues the task and assigns the nearest healthy robot. Human
response: the attention filter and red chip already route the operator's eyes;
a persistent alert entry ("r6 silent 45 s during task") is the q1-style
extension described above.

## 5. Slow/unreliable robot link: late, out-of-order, missing updates

**During the outage:** the robot simply stops moving on the map and keeps its
last known status — which is dangerously optimistic (it could be `error`
now). So the three things the rest of the system should show are: (1) age —
`lastT` displayed in `RobotPanel` ("last update t=…") is the bare minimum,
(2) visual staleness decay (fade the dot past the threshold from q4), and
(3) trend samples should exclude stale robots from "working" after the
timeout.

**Ordering:** my store is last-value-wins keyed on `t`, so an out-of-order
event with an *older* `t` than `robots[id].lastT` must be dropped — a one-line
guard in `applyEvents` (`sim/replay.ts`). Currently not applied because the
replay log is ordered; that's the first guard I'd add for a real transport.

**Recovery:** last-value-wins makes healing trivial — the robot's next event,
whenever it arrives, is simply the new truth; no re-sync protocol needed as
long as events carry state (position/status/battery) rather than deltas. This
is a real argument *against* the q3 delta encoding: deltas save bandwidth but
make a recovered client dependent on history it may have missed. The
compromise: deltas plus a periodic full state message every N events (a
keyframe), which bounds desync to N reports even in the worst case.
