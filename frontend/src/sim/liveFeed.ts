import type { RobotEvent, RobotState, RobotStatus } from '../types';
import { findPath, isFree, type Grid } from './occupancy';

/**
 * Client-side live feed: one independent walker per robot, seeded from the
 * final replayed state. Emits one event per robot every EMIT_SECONDS of sim
 * time, so downstream views treat it exactly like replay data.
 *
 * If an occupancy Grid (from layout.png) is supplied, robots route around
 * walls with A*; otherwise they fall back to straight-line waypoints.
 */

export const EMIT_SECONDS = 3;

// Fallback bounds when no grid is available; with a grid the arena follows it.
const FALLBACK_ARENA = { minX: 20, maxX: 880, minY: 20, maxY: 540 };
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
  path: { x: number; y: number }[] | null; // remaining waypoints; null = parked
  headingToCharge: boolean;
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
  private grid: Grid | null;
  private arena: typeof FALLBACK_ARENA;

  constructor(seedStates: RobotState[], seed = 42, startClock = 0, grid: Grid | null = null) {
    this.rand = mulberry32(seed);
    this.clock = startClock;
    this.grid = grid;
    // With a grid, roam the whole walkable area so A* waypoints (free-cell
    // centers) are always reachable without fighting a clamp boundary.
    this.arena = grid
      ? { minX: 0, maxX: grid.cols * grid.cell, minY: 0, maxY: grid.rows * grid.cell }
      : FALLBACK_ARENA;
    this.walkers = seedStates.map((s) => ({
      id: s.robot_id,
      x: s.x,
      y: s.y,
      status: s.status === 'offline' ? 'idle' : s.status,
      battery: Math.min(100, Math.max(5, s.battery)),
      path: null,
      headingToCharge: false,
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

  /** Pick a random destination that is actually drivable, and route to it. */
  private planRoute(w: Walker, dest: { x: number; y: number }): boolean {
    if (!this.grid) {
      w.path = [dest];
      return true;
    }
    const path = findPath(this.grid, { x: w.x, y: w.y }, dest);
    if (!path) return false;
    w.path = path;
    return true;
  }

  private randomFreePoint(): { x: number; y: number } {
    for (let i = 0; i < 40; i++) {
      const p = {
        x: this.arena.minX + this.rand() * (this.arena.maxX - this.arena.minX),
        y: this.arena.minY + this.rand() * (this.arena.maxY - this.arena.minY),
      };
      if (!this.grid || isFree(this.grid, p.x, p.y)) return p;
    }
    return { x: this.arena.minX, y: this.arena.minY };
  }

  private tickWalker(w: Walker, dt: number) {
    // Fixed-duration statuses tick down before anything else.
    if (w.status === 'blocked' || w.status === 'error' || w.status === 'maintenance') {
      w.statusTimer -= dt;
      if (w.statusTimer <= 0) {
        w.status = 'idle';
        w.path = null;
      }
      return;
    }

    if (w.status === 'charging') {
      w.battery = Math.min(100, w.battery + CHARGE_PER_S * dt);
      if (w.battery >= FULL) {
        w.status = 'idle';
        w.path = null;
      }
      return;
    }

    // Decision point: idle or finished a route.
    if (w.path === null) {
      if (w.battery < LOW) {
        w.status = 'on_mission';
        w.headingToCharge = true;
        if (!this.planRoute(w, CHARGE_DOCK)) {
          w.status = 'idle';
          w.headingToCharge = false;
        }
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
        w.headingToCharge = false;
        // Try a few destinations until one routes successfully.
        for (let tries = 0; tries < 5 && w.path === null; tries++) {
          this.planRoute(w, this.randomFreePoint());
        }
        if (w.path === null) return; // parked somewhere odd; idle this tick
      }
    }

    // Move along the route.
    let stepDist = SPEED * dt;
    while (stepDist > 0 && w.path && w.path.length > 0) {
      const wp = w.path[0];
      const dx = wp.x - w.x;
      const dy = wp.y - w.y;
      const dist = Math.hypot(dx, dy);
      if (stepDist >= dist) {
        w.x = wp.x;
        w.y = wp.y;
        w.path.shift();
        stepDist -= dist;
      } else {
        w.x += (dx / dist) * stepDist;
        w.y += (dy / dist) * stepDist;
        stepDist = 0;
      }
    }
    if (w.path && w.path.length === 0) {
      w.path = null;
      w.status = w.headingToCharge ? 'charging' : 'idle';
      w.headingToCharge = false;
    }
    w.battery = Math.min(100, Math.max(0, w.battery - DRAIN_PER_S * dt));
    w.x = Math.min(this.arena.maxX, Math.max(this.arena.minX, w.x));
    w.y = Math.min(this.arena.maxY, Math.max(this.arena.minY, w.y));
  }
}
