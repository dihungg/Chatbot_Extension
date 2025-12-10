import { describe, expect, it } from 'vitest';
import {
  applyPendingRequirementSnapshot,
  snapshotPendingRequirementSessions,
  type PendingRequirement,
} from '../pendingSessionsUtils';

const buildSampleSessions = () =>
  new Map<string, PendingRequirement>([
    [
      'session-new',
      {
        type: 'new_task',
        taskId: 'session-new',
        task: 'Find shoes',
        tabId: 42,
      },
    ],
    [
      'session-replay',
      {
        type: 'replay',
        taskId: 'session-replay',
        task: 'Redo last task',
        tabId: 99,
        historySessionId: 'hist-1',
      },
    ],
  ]);

describe('pendingSessionsUtils', () => {
  it('serializes and hydrates snapshots without data loss', () => {
    const original = buildSampleSessions();
    const snapshot = snapshotPendingRequirementSessions(original);
    const target = new Map<string, PendingRequirement>();

    applyPendingRequirementSnapshot(target, snapshot);

    expect(Array.from(target.entries())).toEqual(Array.from(original.entries()));
  });

  it('ignores malformed snapshot entries when hydrating', () => {
    const target = new Map<string, PendingRequirement>();
    const snapshot = [
      ['valid', { type: 'new_task', taskId: 'valid', task: 'Task', tabId: 1 }],
      ['missingFields', { type: 'new_task' }],
      ['notArray', 'value'],
      ['badReplay', { type: 'replay', taskId: 'bad', task: 'Task', tabId: 2 }], // missing historySessionId
    ] as unknown[];

    applyPendingRequirementSnapshot(target, snapshot);

    expect(Array.from(target.keys())).toEqual(['valid']);
  });
});
