import { describe, it, expect } from 'vitest';
import { parseLog, stateAtTime, eventsBetween, applyEvents } from './replay';
import type { RobotEvent, RobotMeta } from '../types';

const metas: RobotMeta[] = [
  { robot_id: 'r1', robot_type: 'picker', start: { x: 0, y: 0 } },
  { robot_id: 'r2', robot_type: 'hauler', start: { x: 5, y: 5 } },
];

const lines = [
  { t: 0, robot_id: 'r1', x: 0, y: 0, status: 'idle', battery: 90 },
  { t: 0, robot_id: 'r2', x: 5, y: 5, status: 'idle', battery: 80 },
  { t: 5, robot_id: 'r1', x: 10, y: 10, status: 'on_mission', battery: 85 },
  { t: 10, robot_id: 'r1', x: 20, y: 20, status: 'blocked', battery: 70 },
  { t: 10, robot_id: 'r2', x: 50, y: 50, status: 'active', battery: 60 },
  { t: 15, robot_id: 'r1', x: 30, y: 30, status: 'charging', battery: 75 },
];
const text = lines.map((l) => JSON.stringify(l)).join('\n');

describe('replay engine', () => {
  const data = parseLog(text, metas);

  it('parses and indexes per robot, sorted by t', () => {
    expect(data.events).toHaveLength(6);
    expect(data.byRobot.get('r1')!.map((e) => e.t)).toEqual([0, 5, 10, 15]);
    expect(data.byRobot.get('r2')!.map((e) => e.t)).toEqual([0, 10]);
  });

  it('stateAtTime picks the latest event per robot at or before t', () => {
    const s = stateAtTime(data, 7);
    expect(s.get('r1')).toMatchObject({ x: 10, y: 10, status: 'on_mission', lastT: 5 });
    expect(s.get('r2')).toMatchObject({ x: 5, y: 5, status: 'idle', lastT: 0 });
  });

  it('stateAtTime at the exact boundary uses that event', () => {
    const s = stateAtTime(data, 10);
    expect(s.get('r1')).toMatchObject({ status: 'blocked', lastT: 10 });
    expect(s.get('r2')).toMatchObject({ status: 'active', lastT: 10 });
  });

  it('seek backwards works: state at 7 after being at 15', () => {
    // Simulate having played to 15, then seeking back to 7 must restore r1 to t=5 state
    const fwd = applyEvents(stateAtTime(data, 0), eventsBetween(data.events, 0, 15), data.metas);
    expect(fwd.get('r1')!.status).toBe('charging');
    const back = stateAtTime(data, 7);
    expect(back.get('r1')).toMatchObject({ x: 10, status: 'on_mission' });
  });

  it('eventsBetween is exclusive of fromT and inclusive of toT', () => {
    const evs = eventsBetween(data.events, 5, 10);
    expect(evs.map((e: RobotEvent) => [e.robot_id, e.t])).toEqual([
      ['r1', 10],
      ['r2', 10],
    ]);
  });

  it('stateAtTime before first event falls back to start/initial', () => {
    const s = stateAtTime(data, -1);
    expect(s.get('r1')!.x).toBe(0);
    expect(s.get('r2')!.x).toBe(5);
  });
});
