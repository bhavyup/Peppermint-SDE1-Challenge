import { useCallback, useEffect, useRef, useState } from 'react';
import type { RobotMeta, RobotState } from './types';
import { needsAttention, STATUS_COLORS } from './types';
import { parseLog, eventsBetween, type LogData } from './sim/replay';
import { LiveFeedSimulator } from './sim/liveFeed';
import { gridFromImage, type Grid } from './sim/occupancy';
import { createStore, ingest, seek, type FleetStore } from './state/fleetStore';
import MapView from './components/MapView';
import TrendChart from './components/TrendChart';
import RobotPanel from './components/RobotPanel';
import Controls, { type Mode } from './components/Controls';
import './styles.css';

const TICK_MS = 250;
const MAX_REPLAY_T = 900;
const LIVE_SPEED = 5; // live feed runs at 5 sim-seconds per wall second

export default function App() {
  const [data, setData] = useState<LogData | null>(null);
  const [metas, setMetas] = useState<RobotMeta[]>([]);
  const [store, setStore] = useState<FleetStore | null>(null);
  const [mode, setMode] = useState<Mode>('replay');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const liveSim = useRef<LiveFeedSimulator | null>(null);
  const grid = useRef<Grid | null>(null);

  // Load data
  useEffect(() => {
    (async () => {
      const base = import.meta.env.BASE_URL;
      const [robotsJson, eventsText] = await Promise.all([
        fetch(`${base}robots.json`).then((r) => r.json()) as Promise<RobotMeta[]>,
        fetch(`${base}events.jsonl`).then((r) => r.text()),
      ]);
      const logData = parseLog(eventsText, robotsJson);
      setMetas(robotsJson);
      setData(logData);
      setStore(createStore(logData));
      // Build the wall grid for live-feed routing once the layout image loads.
      const img = new Image();
      img.src = `${base}layout.png`;
      img.onload = () => {
        grid.current = gridFromImage(img);
      };
    })();
  }, []);

  const metaMap = useCallback(() => data?.metas ?? new Map(), [data]);

  // Engine loop
  useEffect(() => {
    if (!data || !store || !playing) return;
    const id = setInterval(() => {
      setStore((prev) => {
        if (!prev) return prev;
        if (mode === 'replay') {
          const dt = (TICK_MS / 1000) * speed;
          const nextT = Math.min(prev.simTime + dt, MAX_REPLAY_T);
          const evs = eventsBetween(data.events, prev.simTime, nextT);
          let next = ingest(prev, evs, metaMap());
          if (nextT !== prev.simTime && evs.length === 0) next = { ...next, simTime: nextT };
          if (nextT >= MAX_REPLAY_T) setPlaying(false);
          return next;
        }
        // live mode
        if (!liveSim.current) {
          liveSim.current = new LiveFeedSimulator([...prev.robots.values()], 1337, prev.simTime, grid.current);
        }
        const dt = (TICK_MS / 1000) * LIVE_SPEED;
        const evs = liveSim.current.step(dt);
        let next = ingest(prev, evs, metaMap());
        if (evs.length === 0) next = { ...next, simTime: next.simTime + dt };
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [data, store !== null, playing, mode, speed, metaMap]);

  // Reset live sim when leaving live mode so it reseeds from fresh state next time
  useEffect(() => {
    if (mode !== 'live') liveSim.current = null;
  }, [mode]);

  const handleSeek = useCallback(
    (t: number) => {
      if (!data) return;
      setStore((prev) => (prev ? seek(prev, data, t) : prev));
    },
    [data]
  );

  if (!data || !store) return <div className="loading">Loading fleet data…</div>;

  let robots: RobotState[] = [...store.robots.values()];
  if (attentionOnly) robots = robots.filter(needsAttention);
  const shownRobots: Map<string, RobotState> = attentionOnly ? new Map(robots.map((r) => [r.robot_id, r])) : store.robots;
  const selected = selectedId ? store.robots.get(selectedId) ?? null : null;
  const attentionCount = [...store.robots.values()].filter(needsAttention).length;

  return (
    <div className="app">
      <header>
        <h1>Fleet Dashboard</h1>
        <span className="muted">
          {store.robots.size} robots · {attentionCount > 0 ? `⚠ ${attentionCount} need attention` : 'all clear'}
        </span>
      </header>
      <Controls
        mode={mode}
        onMode={setMode}
        playing={playing}
        onPlayPause={() => setPlaying((p) => !p)}
        speed={speed}
        onSpeed={setSpeed}
        simTime={store.simTime}
        maxTime={MAX_REPLAY_T}
        onSeek={handleSeek}
        attentionOnly={attentionOnly}
        onToggleAttention={() => setAttentionOnly((v) => !v)}
      />
      <div className="main">
        <div className="map-wrap">
          <MapView robots={shownRobots} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <aside>
          <div className="card">
            <h2>Fleet trends</h2>
            <TrendChart series={store.series} fleetSize={metas.length} />
          </div>
          <div className="card">
            <h2>Robots</h2>
            <ul className="robot-list">
              {robots.map((r) => (
                <li key={r.robot_id} className={r.robot_id === selectedId ? 'sel' : ''}>
                  <button onClick={() => setSelectedId(r.robot_id)}>
                    <i style={{ background: STATUS_COLORS[r.status] }} />
                    {r.robot_id}
                    <span className="muted">{r.status}</span>
                    <span>{r.battery.toFixed(0)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <RobotPanel robot={selected} onClose={() => setSelectedId(null)} />
        </aside>
      </div>
    </div>
  );
}
