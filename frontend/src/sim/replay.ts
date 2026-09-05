import type { RobotEvent, RobotMeta, RobotState } from '../types';

export type LogData = {
  events: RobotEvent[]; // global, sorted by t
  byRobot: Map<string, RobotEvent[]>; // per robot, sorted by t
  metas: Map<string, RobotMeta>;
};

export function parseLog(text: string, metas: RobotMeta[]): LogData {
  const events: RobotEvent[] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    events.push(JSON.parse(s));
  }
  events.sort((a, b) => a.t - b.t);
  const byRobot = new Map<string, RobotEvent[]>();
  for (const e of events) {
    const arr = byRobot.get(e.robot_id);
    if (arr) arr.push(e);
    else byRobot.set(e.robot_id, [e]);
  }
  return { events, byRobot, metas: new Map(metas.map((m) => [m.robot_id, m])) };
}

/** Initial fleet state from robot start positions (status idle until first event). */
export function initialState(byRobot: Map<string, RobotEvent[]>, metas: Map<string, RobotMeta>): Map<string, RobotState> {
  const out = new Map<string, RobotState>();
  for (const [id, meta] of metas) {
    const first = byRobot.get(id)?.[0];
    out.set(id, {
      robot_id: id,
      robot_type: meta.robot_type,
      x: first ? first.x : meta.start.x,
      y: first ? first.y : meta.start.y,
      status: first ? first.status : 'idle',
      battery: first ? first.battery : 100,
      lastT: first ? first.t : 0,
    });
  }
  return out;
}

/**
 * Rebuild fleet state exactly as of simTime by taking, per robot, the latest
 * recorded event with t <= simTime. This is the primitive that makes
 * seek-backwards cheap and correct (log(n) binary search per robot).
 */
export function stateAtTime(data: LogData, simTime: number): Map<string, RobotState> {
  const out = initialState(data.byRobot, data.metas);
  for (const [id, arr] of data.byRobot) {
    let lo = 0;
    let hi = arr.length; // find last index with arr[i].t <= simTime
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].t <= simTime) lo = mid + 1;
      else hi = mid;
    }
    const e = lo > 0 ? arr[lo - 1] : undefined;
    if (e) {
      out.set(id, {
        robot_id: id,
        robot_type: out.get(id)!.robot_type,
        x: e.x,
        y: e.y,
        status: e.status,
        battery: e.battery,
        lastT: e.t,
      });
    }
  }
  return out;
}

/** All events in (fromT, toT], sorted — the forward-advance primitive. */
export function eventsBetween(events: RobotEvent[], fromT: number, toT: number): RobotEvent[] {
  // events are short-lived in tests; linear scan is fine and simpler than indexing
  return events.filter((e) => e.t > fromT && e.t <= toT);
}

export function applyEvents(state: Map<string, RobotState>, events: RobotEvent[], metas: Map<string, RobotMeta>): Map<string, RobotState> {
  const next = new Map(state);
  for (const e of events) {
    const prev = next.get(e.robot_id);
    next.set(e.robot_id, {
      robot_id: e.robot_id,
      robot_type: prev?.robot_type ?? metas.get(e.robot_id)?.robot_type ?? 'unknown',
      x: e.x,
      y: e.y,
      status: e.status,
      battery: e.battery,
      lastT: e.t,
    });
  }
  return next;
}
