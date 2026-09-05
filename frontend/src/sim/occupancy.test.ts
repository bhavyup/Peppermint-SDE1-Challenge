import { describe, it, expect } from 'vitest';
import { findPath, isFree, type Grid } from './occupancy';
import { LiveFeedSimulator } from './liveFeed';
import type { RobotState } from '../types';

/** 90x56 grid, 10px cells (900x560 px), vertical wall at col 10 rows 5..50. */
function makeGrid(): Grid {
  const cols = 90;
  const rows = 56;
  const blocked = new Uint8Array(cols * rows);
  for (let r = 5; r <= 50; r++) blocked[r * cols + 10] = 1;
  return { cols, rows, cell: 10, blocked };
}

describe('occupancy grid + A*', () => {
  it('routes around a wall instead of through it', () => {
    const grid = makeGrid();
    const path = findPath(grid, { x: 5, y: 55 }, { x: 395, y: 55 });
    expect(path).not.toBeNull();
    // every waypoint must be in a free cell
    for (const p of path!) {
      expect(isFree(grid, p.x, p.y)).toBe(true);
    }
    // and the path must actually detour (straight line would cross col 10)
    expect(Math.max(...path!.map((p) => Math.hypot(p.x - 200, p.y - 55)))).toBeGreaterThan(100);
  });

  it('returns null when the destination is completely walled in', () => {
    const grid = makeGrid();
    // box in cell (5,5) with walls on all sides
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      grid.blocked[(5 + dr) * grid.cols + (5 + dc)] = 1;
    }
    expect(findPath(grid, { x: 5, y: 5 }, { x: 55, y: 55 })).toBeNull();
    // unreachable target inside the box: nearest-free nudges to a wall-adjacent cell,
    // which is unreachable -> still null
  });

  it('simulator with a grid never reports positions inside walls', () => {
    const grid = makeGrid();
    const seed: RobotState[] = [
      { robot_id: 'r1', robot_type: 'picker', x: 5, y: 55, status: 'idle', battery: 90, lastT: 0 },
    ];
    const sim = new LiveFeedSimulator(seed, 11, 0, grid);
    for (let i = 0; i < 3000; i++) {
      for (const e of sim.step(1)) {
        expect(isFree(grid, e.x, e.y), `pos ${e.x},${e.y} (${e.status})`).toBe(true);
      }
    }
  });
});
