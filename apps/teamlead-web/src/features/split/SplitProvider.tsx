/**
 * Session-scoped store for manual Beleg-Splits.
 *
 * The production split persists through a backend endpoint and writes per-share
 * ZstRecords (deferred — see docs/concept/beleg-split-manual-implementation-plan.md).
 * Until then a manual split lives here: the Teamlead splits a Beleg, the result is
 * held in memory for this session and rendered on the Aufteilungen/Leistung view,
 * and an audited `aufteilen` override event is produced for the feed.
 *
 * `createRecordedSplit` is a pure builder (apportionment + name merge) so it can be
 * unit-tested without React.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import type { WorkflowEvent } from '@paket/domain-types';
import { createOverrideEvent, type OverrideEventPayload } from '../../data/audit.js';
import { CURRENT_TEAMLEAD_ID } from '../../data/api.js';
import { apportion, type CaptureMode, type CaseEffort, type SplitMode } from './splitMath.js';

/** One employee's recorded share of a split (with resolved name + apportioned effort). */
export interface RecordedShare {
  employeeId: string;
  employeeName: string;
  quantity: number;
  sharePct: number;
  effortPoints: number;
  estimatedMinutes: number;
}

/** A manual split the Teamlead committed this session. */
export interface RecordedSplit {
  id: string;
  caseId: string;
  weBelegNo: string;
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
  splitMode: SplitMode;
  captureMode: CaptureMode;
  reason: string;
  createdAt: string;
  /** True when the shares cover the whole Beleg (no remainder left open). */
  isComplete: boolean;
  shares: RecordedShare[];
}

/** Input to commit a split (one row per chosen employee). */
export interface RecordSplitInput {
  caseId: string;
  weBelegNo: string;
  caseEffort: CaseEffort;
  splitMode: SplitMode;
  captureMode: CaptureMode;
  reason: string;
  shares: { employeeId: string; employeeName: string; quantity: number }[];
}

/**
 * Build a {@link RecordedSplit} from the dialog input: apportion the case effort by
 * quantity share and merge the resolved employee names back in. Pure + deterministic
 * (timestamp + sequence are passed in).
 */
export function createRecordedSplit(
  input: RecordSplitInput,
  seq: number,
  nowIso: string,
): RecordedSplit {
  const computed = apportion(
    input.shares.map((s) => ({ employeeId: s.employeeId, quantity: s.quantity })),
    input.caseEffort,
  );
  const nameById = new Map(input.shares.map((s) => [s.employeeId, s.employeeName]));
  const shares: RecordedShare[] = computed.map((c) => ({
    employeeId: c.employeeId,
    employeeName: nameById.get(c.employeeId) ?? c.employeeId,
    quantity: c.quantity,
    sharePct: c.sharePct,
    effortPoints: c.effortPoints,
    estimatedMinutes: c.estimatedMinutes,
  }));
  const assigned = shares.reduce((sum, s) => sum + s.quantity, 0);
  return {
    id: `split-${input.caseId}-${seq}`,
    caseId: input.caseId,
    weBelegNo: input.weBelegNo,
    totalQuantity: input.caseEffort.totalQuantity,
    effortPoints: input.caseEffort.effortPoints,
    estimatedMinutes: input.caseEffort.estimatedMinutes,
    splitMode: input.splitMode,
    captureMode: input.captureMode,
    reason: input.reason,
    createdAt: nowIso,
    isComplete: assigned >= input.caseEffort.totalQuantity,
    shares,
  };
}

export interface SplitApi {
  /** All splits committed this session, newest first. */
  splits: RecordedSplit[];
  splitByCaseId(caseId: string): RecordedSplit | undefined;
  /** Commit a split: records it and produces the audited override event. */
  recordSplit(input: RecordSplitInput): RecordedSplit;
  /** The audited `aufteilen` events produced this session (newest first). */
  events: WorkflowEvent<OverrideEventPayload>[];
}

const SplitContext = createContext<SplitApi | null>(null);

export function SplitProvider({ children }: { children: ReactNode }): JSX.Element {
  const [splits, setSplits] = useState<RecordedSplit[]>([]);
  const [events, setEvents] = useState<WorkflowEvent<OverrideEventPayload>[]>([]);
  const seqRef = useRef(0);

  const recordSplit = useCallback((input: RecordSplitInput): RecordedSplit => {
    seqRef.current += 1;
    const now = new Date();
    const recorded = createRecordedSplit(input, seqRef.current, now.toISOString());
    const event = createOverrideEvent(
      {
        action: 'aufteilen',
        entityId: input.caseId,
        reason: input.reason,
        actorId: CURRENT_TEAMLEAD_ID,
        newState: `${recorded.shares.length} Anteile`,
      },
      now,
    );
    setSplits((prev) => [recorded, ...prev.filter((s) => s.caseId !== input.caseId)]);
    setEvents((prev) => [event, ...prev]);
    return recorded;
  }, []);

  const api = useMemo<SplitApi>(
    () => ({
      splits,
      events,
      splitByCaseId: (caseId) => splits.find((s) => s.caseId === caseId),
      recordSplit,
    }),
    [splits, events, recordSplit],
  );

  return <SplitContext.Provider value={api}>{children}</SplitContext.Provider>;
}

export function useSplits(): SplitApi {
  const ctx = useContext(SplitContext);
  if (!ctx) throw new Error('useSplits must be used within SplitProvider');
  return ctx;
}
