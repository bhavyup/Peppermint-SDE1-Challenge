/**
 * Wall-aware movement support: decode layout.png into a coarse occupancy grid
 * and route with A* so simulated robots drive around obstacles, not through.
 */

export type Grid = {
  cols: number;
  rows: number;
  cell: number; // px per cell
  blocked: Uint8Array; // 1 = wall
};

/** Build a grid by sampling each cell's center pixel; lit pixels are free. */
export function gridFromImage(img: HTMLImageElement, cell = 10): Grid {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const cols = Math.ceil(img.width / cell);
  const rows = Math.ceil(img.height / cell);
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.min(img.width - 1, c * cell + (cell >> 1));
      const y = Math.min(img.height - 1, r * cell + (cell >> 1));
      const i = (y * img.width + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      blocked[r * cols + c] = lum < 220 ? 1 : 0;
    }
  }
  return { cols, rows, cell, blocked };
}

export function isFree(grid: Grid, x: number, y: number): boolean {
  const c = Math.floor(x / grid.cell);
  const r = Math.floor(y / grid.cell);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return false;
  return grid.blocked[r * grid.cols + c] === 0;
}

const key = (c: number, r: number) => r * 1e6 + c;

/** A* over the grid, 8-connected, no diagonal corner cutting. Returns pixel waypoints or null. */
export function findPath(
  grid: Grid,
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x: number; y: number }[] | null {
  const clampCell = (p: { x: number; y: number }) => ({
    c: Math.min(grid.cols - 1, Math.max(0, Math.floor(p.x / grid.cell))),
    r: Math.min(grid.rows - 1, Math.max(0, Math.floor(p.y / grid.cell))),
  });
  let start = clampCell(from);
  const goal = clampCell(to);

  // If an endpoint sits inside a wall, nudge to the nearest free cell (small spiral).
  const nearestFree = (cell: { c: number; r: number }) => {
    if (!grid.blocked[cell.r * grid.cols + cell.c]) return cell;
    for (let d = 1; d < 8; d++) {
      for (let dr = -d; dr <= d; dr++) {
        for (let dc = -d; dc <= d; dc++) {
          const c = cell.c + dc;
          const r = cell.r + dr;
          if (c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && !grid.blocked[r * grid.cols + c]) {
            return { c, r };
          }
        }
      }
    }
    return null;
  };
  const s = nearestFree(start);
  const g = nearestFree(goal);
  if (!s || !g) return null;
  start = s;

  const open: { c: number; r: number; f: number }[] = [{ c: start.c, r: start.r, f: 0 }];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[key(start.c, start.r), 0]]);
  const closed = new Set<number>();
  const h = (c: number, r: number) => Math.hypot(c - goal.c, r - goal.r);

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ck = key(cur.c, cur.r);
    if (cur.c === goal.c && cur.r === goal.r) {
      const path: { x: number; y: number }[] = [];
      let k = ck;
      let cr = cur.c,
        rr = cur.r;
      while (true) {
        path.push({ x: cr * grid.cell + grid.cell / 2, y: rr * grid.cell + grid.cell / 2 });
        const p = came.get(k);
        if (p === undefined) break;
        k = p;
        cr = p % 1e6;
        rr = Math.floor(p / 1e6);
      }
      path.reverse();
      path.push({ x: to.x, y: to.y });
      return path;
    }
    closed.add(ck);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = cur.c + dc;
        const nr = cur.r + dr;
        if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
        if (grid.blocked[nr * grid.cols + nc]) continue;
        // no diagonal cutting through wall corners
        if (dc && dr && (grid.blocked[cur.r * grid.cols + nc] || grid.blocked[nr * grid.cols + cur.c])) continue;
        const nk = key(nc, nr);
        if (closed.has(nk)) continue;
        const g = gScore.get(ck)! + Math.hypot(dc, dr);
        if (g < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, g);
          came.set(nk, ck);
          open.push({ c: nc, r: nr, f: g + h(nc, nr) });
        }
      }
    }
  }
  return null;
}
