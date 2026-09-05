import type { RobotState } from '../types';
import { needsAttention, STATUS_COLORS } from '../types';

export default function RobotPanel({ robot, onClose }: { robot: RobotState | null; onClose: () => void }) {
  if (!robot) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <strong>{robot.robot_id}</strong>
        <span className="muted">{robot.robot_type}</span>
        <button onClick={onClose} aria-label="close">×</button>
      </div>
      <div className="row">
        <span>Status</span>
        <span className="chip" style={{ background: STATUS_COLORS[robot.status] }}>{robot.status}</span>
        {needsAttention(robot) && <span className="chip warn">needs attention</span>}
      </div>
      <div className="row">
        <span>Battery</span>
        <div className="battery">
          <div
            className="battery-fill"
            style={{
              width: `${robot.battery}%`,
              background: robot.battery < 20 ? '#ef4444' : robot.battery < 50 ? '#eab308' : '#22c55e',
            }}
          />
        </div>
        <span>{robot.battery.toFixed(0)}%</span>
      </div>
      <div className="row">
        <span>Position</span>
        <span>({robot.x.toFixed(0)}, {robot.y.toFixed(0)})</span>
      </div>
      <div className="row">
        <span>Last update</span>
        <span>t = {robot.lastT.toFixed(0)}s</span>
      </div>
    </div>
  );
}
