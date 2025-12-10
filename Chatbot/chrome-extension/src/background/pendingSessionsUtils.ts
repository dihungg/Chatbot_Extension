export type PendingRequirement =
  | {
      type: 'new_task';
      taskId: string;
      task: string;
      tabId: number;
    }
  | {
      type: 'replay';
      taskId: string;
      task: string;
      tabId: number;
      historySessionId: string;
    };

export type PendingRequirementSnapshot = Array<[string, PendingRequirement]>;

export const snapshotPendingRequirementSessions = (
  sessions: Map<string, PendingRequirement>,
): PendingRequirementSnapshot => Array.from(sessions.entries());

export const applyPendingRequirementSnapshot = (target: Map<string, PendingRequirement>, snapshot: unknown): void => {
  target.clear();
  if (!Array.isArray(snapshot)) {
    return;
  }

  for (const entry of snapshot) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      continue;
    }
    const [sessionId, payload] = entry;
    if (typeof sessionId !== 'string' || !isPendingRequirement(payload)) {
      continue;
    }
    target.set(sessionId, payload);
  }
};

const isPendingRequirement = (value: unknown): value is PendingRequirement => {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'new_task') {
    return (
      typeof candidate.taskId === 'string' && typeof candidate.task === 'string' && typeof candidate.tabId === 'number'
    );
  }

  if (candidate.type === 'replay') {
    return (
      typeof candidate.taskId === 'string' &&
      typeof candidate.task === 'string' &&
      typeof candidate.tabId === 'number' &&
      typeof candidate.historySessionId === 'string'
    );
  }

  return false;
};
