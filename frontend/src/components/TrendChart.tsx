import type { FleetSample } from '../state/fleetStore';

const W = 560;
const H = 140;
const PAD = 28;

/** Fleet-level trend: % working (active+on_mission), % needing attention, avg battery. */
export default function TrendChart({ series, fleetSize }: { series: FleetSample[]; fleetSize: number }) {
  if (series.length < 2) {
    return <div className="trend-empty">Collecting data for trends…</div>;
  }
  const tMin = series[0].t;
  const tMax = Math.max(series[series.length - 1].t, tMin + 1);

  const px = (t: number) => PAD + ((t - tMin) / (tMax - tMin)) * (W - PAD * 2);
  const py = (v: number) => H - PAD - v * (H - PAD * 2); // v in 0..1

  const line = (get: (s: FleetSample) => number) =>
    series.map((s, i) => `${i === 0 ? 'M' : 'L'}${px(s.t).toFixed(1)},${py(get(s)).toFixed(1)}`).join(' ');

  const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend">
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line x1={PAD} x2={W - PAD} y1={py(pct / 100)} y2={py(pct / 100)} stroke="#334155" strokeDasharray="3 4" />
            <text x={4} y={py(pct / 100) + 3} fontSize="9" fill="#94a3b8">
              {pct}%
            </text>
          </g>
        ))}
        <path d={line((s) => s.working / fleetSize)} fill="none" stroke="#4ade80" strokeWidth="2" />
        <path d={line((s) => s.attention / fleetSize)} fill="none" stroke="#f87171" strokeWidth="2" />
        <path d={line((s) => s.avgBattery / 100)} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="6 3" />
        <text x={PAD} y={H - 6} fontSize="9" fill="#94a3b8">{fmtT(tMin)}</text>
        <text x={W - PAD - 24} y={H - 6} fontSize="9" fill="#94a3b8">{fmtT(tMax)}</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: '#4ade80' }} /> working</span>
        <span><i style={{ background: '#f87171' }} /> attention</span>
        <span><i style={{ background: '#38bdf8' }} /> avg battery</span>
      </div>
    </div>
  );
}
