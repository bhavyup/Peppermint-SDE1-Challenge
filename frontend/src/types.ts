export type RobotStatus =
  | 'idle'
  | 'active'
  | 'on_mission'
  | 'charging'
  | 'blocked'
  | 'error'
  | 'maintenance'
  | 'offline';

export type RobotEvent = {
  t: number; // seconds from window start
  robot_id: string;
  x: number;
  y: number;
  status: RobotStatus;
  battery: number;
  task_event?: 'task_started' | 'task_completed';
};

export type RobotMeta = {
  robot_id: string;
  robot_type: string;
  start: { x: number; y: number };
};

/** Latest-known state of one robot, held by the fleet store. */
export type RobotState = {
  robot_id: string;
  robot_type: string;
  x: number;
  y: number;
  status: RobotStatus;
  battery: number;
  lastT: number; // sim time of last event
};

/** Statuses that count as "working" for the fleet-productivity trend. */
export const WORKING_STATUSES: ReadonlySet<RobotStatus> = new Set([
  'active',
  'on_mission',
]);

/** Statuses that flag a robot as needing operator attention. */
export const ATTENTION_STATUSES: ReadonlySet<RobotStatus> = new Set([
  'blocked',
  'error',
  'offline',
]);

export const LOW_BATTERY = 20;

export function needsAttention(r: RobotState): boolean {
  return ATTENTION_STATUSES.has(r.status) || r.battery < LOW_BATTERY;
}

export const STATUS_COLORS: Record<RobotStatus, string> = {
  idle: '#6b7280',
  active: '#22c55e',
  on_mission: '#3b82f6',
  charging: '#eab308',
  blocked: '#f97316',
  error: '#ef4444',
  maintenance: '#a855f7',
  offline: '#374151',
};
