import type { RobotEvent, RobotState, RobotStatus } from '../types';

/**
 * Client-side live feed: one independent walker per robot, seeded from the
 * final replayed state. Emits one event per robot every EMIT_SECONDS of sim
 * time, so downstream views treat it exactly like replay data.
 */

export const EMIT_SECONDS = 3;

const ARENA = { minX: 20, maxX: 880, minY: 20, maxY: 540 }; // inside layout bounds
const CHARGE_DOCK = { x: 40, y: 40 };

// Small deterministic PRNG so tests are stable.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Walker = {
  id: string;
  x: number;
  y: number;
  status: RobotStatus;
  battery: number;
  target: { x: number; y: number } | null;
  statusTimer: number; // seconds remaining in a fixed-duration status (blocked/error)
};

const SPEED = 25; // px per sim second
const DRAIN_PER_S = 0.05; // battery %/s while moving/working
const CHARGE_PER_S = 1.2;
const LOW = 20;
const FULL = 95;

export class LiveFeedSimulator {
  private walkers: Walker[];
  private rand: () => number;
  private clock: number;

  constructor(seedStates: RobotState[], seed = 42, startClock = 0) {
    this.rand = mulberry32(seed);
    this.clock = startClock;
    this.walkers = seedStates.map((s) => ({
      id: s.robot_id,
      x: s.x,
      y: s.y,
      status: s.status === 'offline' ? 'idle' : s.status,
      battery: Math.min(100, Math.max(5, s.battery)),
      target: null,
      statusTimer: 0,
    }));
  }

  /** Advance `dt` sim seconds; returns events due in this step. */
  step(dt: number): RobotEvent[] {
    const events: RobotEvent[] = [];
    const prevBucket = Math.floor(this.clock / EMIT_SECONDS);
    this.clock += dt;
    const curBucket = Math.floor(this.clock / EMIT_SECONDS);

    for (const w of this.walkers) {
      this.tickWalker(w, dt);
      if (curBucket !== prevBucket) {
        events.push({
          t: this.clock,
          robot_id: w.id,
          x: Math.round(w.x * 10) / 10,
          y: Math.round(w.y * 10) / 10,
          status: w.status,
          battery: Math.round(w.battery * 10) / 10,
        });
      }
    }
    return events;
  }

  private tickWalker(w: Walker, dt: number) {
    // Fixed-duration statuses tick down before anything else.
    if (w.status === 'blocked' || w.status === 'error' || w.status === 'maintenance') {
      w.statusTimer -= dt;
      if (w.statusTimer <= 0) {
        w.status = 'idle';
        w.target = null;
      }
      return;
    }

    if (w.status === 'charging') {
      w.battery = Math.min(100, w.battery + CHARGE_PER_S * dt);
      if (w.battery >= FULL) {
        w.status = 'idle';
        w.target = null;
      }
      return;
    }

    // Decision point: idle or arrived at target.
    if (w.target === null) {
      if (w.battery < LOW) {
        w.status = 'on_mission';
        w.target = { ...CHARGE_DOCK };
        // when it arrives there it will begin charging
        (w as Walker & { headingToCharge?: boolean }).headingToCharge = true;
      } else {
        const roll = this.rand();
        if (roll < 0.02) {
          w.status = 'blocked';
          w.statusTimer = 10 + this.rand() * 20;
          return;
        } else if (roll < 0.025) {
          w.status = 'error';
          w.statusTimer = 20 + this.rand() * 40;
          return;
        } else if (roll < 0.03) {
          w.status = 'maintenance';
          w.statusTimer = 30 + this.rand() * 60;
          return;
        }
        w.status = this.rand() < 0.5 ? 'active' : 'on_mission';
        (w as Walker & { headingToCharge?: boolean }).headingToCharge = false;
        w.target = {
          x: ARENA.minX + this.rand() * (ARENA.maxX - ARENA.minX),
          y: ARENA.minY + this.rand() * (ARENA.maxY - ARENA.minY),
        };
      }
    }

    // Move toward target.
    const dx = w.target!.x - w.x;
    const dy = w.target!.y - w.y;
    const dist = Math.hypot(dx, dy);
    const stepDist = SPEED * dt;
    if (stepDist >= dist) {
      w.x = w.target!.x;
      w.y = w.target!.y;
      const toCharge = (w as Walker & { headingToCharge?: boolean }).headingToCharge;
      w.target = null;
      w.status = toCharge ? 'charging' : 'idle';
      (w as Walker & { headingToCharge?: boolean }).headingToCharge = false;
    } else {
      w.x += (dx / dist) * stepDist;
      w.y += (dy / dist) * stepDist;
      w.battery = Math.max(0, w.battery - DRAIN_PER_S * dt);
    }
    w.battery = Math.min(100, Math.max(0, w.battery));
    w.x = Math.min(ARENA.maxX, Math.max(ARENA.minX, w.x));
    w.y = Math.min(ARENA.maxY, Math.max(ARENA.minY, w.y));
  }
}
