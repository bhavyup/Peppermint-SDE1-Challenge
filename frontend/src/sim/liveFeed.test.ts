import { describe, it, expect } from 'vitest';
import { LiveFeedSimulator, EMIT_SECONDS } from './liveFeed';
import type { RobotState, RobotStatus } from '../types';

const seed: RobotState[] = [
  { robot_id: 'r1', robot_type: 'picker', x: 100, y: 100, status: 'idle', battery: 80, lastT: 900 },
  { robot_id: 'r2', robot_type: 'hauler', x: 500, y: 300, status: 'idle', battery: 15, lastT: 900 },
];

const VALID_STATUSES: RobotStatus[] = ['idle', 'active', 'on_mission', 'charging', 'blocked', 'error', 'maintenance', 'offline'];

describe('live feed simulator', () => {
  it('emits one event per robot per emit interval', () => {
    const sim = new LiveFeedSimulator(seed, 1, 900);
    const evs = sim.step(EMIT_SECONDS);
    expect(evs).toHaveLength(2);
    expect(new Set(evs.map((e) => e.robot_id))).toEqual(new Set(['r1', 'r2']));
  });

  it('keeps positions in bounds, battery in [0,100], and statuses valid over a long run', () => {
    const sim = new LiveFeedSimulator(seed, 7, 900);
    for (let i = 0; i < 2000; i++) {
      for (const e of sim.step(1)) {
        expect(e.x).toBeGreaterThanOrEqual(20);
        expect(e.x).toBeLessThanOrEqual(880);
        expect(e.y).toBeGreaterThanOrEqual(20);
        expect(e.y).toBeLessThanOrEqual(540);
        expect(e.battery).toBeGreaterThanOrEqual(0);
        expect(e.battery).toBeLessThanOrEqual(100);
        expect(VALID_STATUSES).toContain(e.status);
      }
    }
  });

  it('a low-battery robot eventually reaches charging and recovers', () => {
    const sim = new LiveFeedSimulator(seed, 3, 900);
    let sawCharging = false;
    let recovered = false;
    for (let i = 0; i < 6000 && !recovered; i++) {
      for (const e of sim.step(1)) {
        if (e.robot_id !== 'r2') continue;
        if (e.status === 'charging') sawCharging = true;
        if (sawCharging && e.battery > 90) recovered = true;
      }
    }
    expect(sawCharging).toBe(true);
    expect(recovered).toBe(true);
  });

  it('is deterministic for a fixed seed', () => {
    const a = new LiveFeedSimulator(seed, 42, 900);
    const b = new LiveFeedSimulator(seed, 42, 900);
    for (let i = 0; i < 100; i++) {
      expect(a.step(1)).toEqual(b.step(1));
    }
  });
});
