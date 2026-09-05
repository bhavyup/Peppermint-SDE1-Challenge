export type Mode = 'replay' | 'live';

export default function Controls({
  mode,
  onMode,
  playing,
  onPlayPause,
  speed,
  onSpeed,
  simTime,
  maxTime,
  onSeek,
  attentionOnly,
  onToggleAttention,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  playing: boolean;
  onPlayPause: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  simTime: number;
  maxTime: number;
  onSeek: (t: number) => void;
  attentionOnly: boolean;
  onToggleAttention: () => void;
}) {
  return (
    <div className="controls">
      <div className="control-group">
        <button className={mode === 'replay' ? 'active' : ''} onClick={() => onMode('replay')}>Replay</button>
        <button className={mode === 'live' ? 'active' : ''} onClick={() => onMode('live')}>Live feed</button>
      </div>
      <button onClick={onPlayPause}>{playing ? 'Pause' : 'Play'}</button>
      {mode === 'replay' && (
        <div className="control-group">
          {[1, 5, 10, 30].map((s) => (
            <button key={s} className={speed === s ? 'active' : ''} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
      )}
      {mode === 'replay' && (
        <input
          type="range"
          min={0}
          max={maxTime}
          step={1}
          value={Math.min(simTime, maxTime)}
          onChange={(e) => onSeek(Number(e.target.value))}
          style={{ flex: 1, minWidth: 120 }}
          aria-label="seek"
        />
      )}
      <span className="clock">
        {Math.floor(simTime / 60)}:{String(Math.floor(simTime % 60)).padStart(2, '0')}
      </span>
      <button className={attentionOnly ? 'active warn-btn' : ''} onClick={onToggleAttention}>
        ⚠ attention
      </button>
    </div>
  );
}
