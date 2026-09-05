import type { RobotEvent, RobotMeta, RobotState } from '../types';
import { applyEvents, initialState, stateAtTime, type LogData } from '../sim/replay';

/**
 * The fleet store: one Map<robot_id, RobotState> of latest-known state plus a
 * circular time series of fleet-level samples. Replay, seek, and live feed all
 * funnel through `ingest`, so the UI never cares where events came from.
 */
export type FleetSample = {
  t: number;
  working: number; // count active+on_mission
  attention: number; // blocked/error/offline/low-battery
  avgBattery: number;
};

export type FleetStore = {
  robots: Map<string, RobotState>;
  series: FleetSample[];
  simTime: number;
};

import { needsAttention, WORKING_STATUSES } from '../types';

const SERIES_INTERVAL = 5; // record a sample at most every 5 sim seconds
const SERIES_MAX = 600; // ~50 minutes of history, then drop oldest

export function createStore(data: LogData): FleetStore {
  return { robots: initialState(data.byRobot, data.metas), series: [], simTime: 0 };
}

function sample(robots: Map<string, RobotState>, t: number): FleetSample {
  let working = 0;
  let attention = 0;
  let battery = 0;
  const n = robots.size || 1;
  for (const r of robots.values()) {
    if (WORKING_STATUSES.has(r.status)) working++;
    if (needsAttention(r)) attention++;
    battery += r.battery;
  }
  return { t, working, attention, avgBattery: battery / n };
}

export function ingest(store: FleetStore, events: RobotEvent[], metas: Map<string, RobotMeta>): FleetStore {
  if (events.length === 0) return store;
  const robots = applyEvents(store.robots, events, metas);
  const last = events[events.length - 1];
  const simTime = Math.max(store.simTime, last.t);
  let series = store.series;
  const prev = series[series.length - 1];
  if (!prev || simTime - prev.t >= SERIES_INTERVAL || simTime < prev.t) {
    series = [...series, sample(robots, simTime)];
    if (series.length > SERIES_MAX) series = series.slice(-SERIES_MAX);
  }
  return { robots, series, simTime };
}

/** Hard seek: rebuild state exactly at simTime (used by the scrubber). */
export function seek(store: FleetStore, data: LogData, simTime: number): FleetStore {
  const robots = stateAtTime(data, simTime);
  let series = store.series.filter((s) => s.t <= simTime);
  const prev = series[series.length - 1];
  if (!prev || simTime - prev.t >= SERIES_INTERVAL) {
    series = [...series, sample(robots, simTime)];
  }
  return { robots, series, simTime };
}
