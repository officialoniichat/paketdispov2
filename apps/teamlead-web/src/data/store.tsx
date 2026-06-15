/**
 * Cockpit store (React context) — now backed by the live backend.
 *
 * `cockpit`, `board`, `lanes` and `recentOverrides` come from a TanStack Query
 * read of the teamlead endpoints (see {@link fetchCockpit}); "Neu berechnen"
 * runs the real assignment engine via `/assignments/recalculate`, and the
 * audited overrides with backend endpoints (prioritize/park/unpark) are POSTed
 * and then invalidate the cockpit query.
 *
 * Surfaces without a backend endpoint yet (Belegdetails, Admin/Regelpflege,
 * positions/boxes/documents) still read the in-memory `dataset` mock so they
 * keep compiling; their manual-override controls are gated behind
 * {@link MANUAL_OVERRIDES_ENABLED}.
 */
import { createContext, useContext, useMemo, useState, type JSX, type ReactNode } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { LocationMaster, WorkflowEvent } from '@paket/domain-types';
import type { components } from '@paket/api-client';
import { api, CURRENT_TEAMLEAD_ID } from './api.js';
import { fetchCockpit, type CockpitSnapshot } from './remoteDataset.js';
import { loadMockDataset } from './mock.js';
import type {
  BoardRow,
  CockpitSummary,
  Lane,
  OperationsDataset,
  RuleConfig,
} from './types.js';

export { CURRENT_TEAMLEAD_ID };

/** No backend endpoint for free-form bundle edits yet — keep the code, hide the UI. */
export const MANUAL_OVERRIDES_ENABLED = false;

type RecalculateResultDto = components['schemas']['RecalculateResultDto'];

/** Today's planning date (YYYY-MM-DD), local time. */
function today(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Empty cockpit shown while the first read is in flight. */
function emptyCockpit(date: string): CockpitSummary {
  return {
    date,
    capacity: {
      plannedEmployees: 0,
      netCapacityMinutes: 0,
      plannedMinutes: 0,
      reserveMinutes: 0,
      utilisationPct: 0,
    },
    pool: { openCases: 0, overdue: 0, prio: 0, catManDue: 0, openIssues: 0 },
    zst: {
      completedCases: 0,
      totalCases: 0,
      completedParts: 0,
      effortPoints: 0,
      partsPerHour: 0,
      effortPointsPerHour: 0,
    },
  };
}

export interface CockpitApi {
  /** Live read state. */
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** Live view-models (from the backend). */
  cockpit: CockpitSummary;
  board: BoardRow[];
  lanes: Lane[];
  recentOverrides: WorkflowEvent[];
  /** Mock fallback for surfaces without a backend read yet (details/admin). */
  dataset: OperationsDataset;
  /** §E.4 "Neu berechnen" → real assignment engine. */
  recalculate: UseMutationResult<RecalculateResultDto, Error, void>;
  /** Feature flag for the not-yet-wired manual overrides. */
  manualOverridesEnabled: boolean;
  /** Audited overrides backed by a real endpoint. */
  parkCase(caseId: string, reason: string): void;
  releaseCase(caseId: string, reason: string): void;
  prioritiseCase(caseId: string, reason: string): void;
  /** No backend endpoint yet — gated off (MANUAL_OVERRIDES_ENABLED). */
  withdrawCase(caseId: string, bundleId: string, reason: string): void;
  addCaseToBundle(caseId: string, bundleId: string, reason: string): void;
  reorderBundle(bundleId: string, caseIds: string[], reason: string): void;
  pauseBundle(bundleId: string, reason: string): void;
  /** §11 Regelpflege – local-only config edits for now. */
  updateRules(rules: RuleConfig): void;
  setLocations(locations: LocationMaster[]): void;
}

const CockpitContext = createContext<CockpitApi | null>(null);

export function CockpitDataProvider({ children }: { children: ReactNode }): JSX.Element {
  const [date] = useState<string>(() => today());
  const queryClient = useQueryClient();

  const query = useQuery<CockpitSnapshot, Error>({
    queryKey: ['cockpit', date],
    queryFn: () => fetchCockpit(date),
  });

  // Mock-only state for surfaces the backend does not expose yet.
  const [dataset, setDataset] = useState<OperationsDataset>(() => loadMockDataset());

  const invalidateCockpit = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
  };

  const recalculate = useMutation<RecalculateResultDto, Error, void>({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/teamlead/assignments/recalculate', {
        body: { date },
      });
      if (error || !data) {
        throw new Error(`recalculate failed (${JSON.stringify(error)})`);
      }
      return data;
    },
    onSettled: invalidateCockpit,
  });

  const prioritiseMutation = useMutation<unknown, Error, { caseId: string; reason: string }>({
    mutationFn: async ({ caseId, reason }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/prioritize', {
        params: { path: { caseId } },
        body: { reason },
      });
      if (error) throw new Error(`prioritize failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpit,
  });

  const parkMutation = useMutation<unknown, Error, { caseId: string; reason: string }>({
    mutationFn: async ({ caseId, reason }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/park', {
        params: { path: { caseId } },
        body: { reason },
      });
      if (error) throw new Error(`park failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpit,
  });

  const unparkMutation = useMutation<unknown, Error, { caseId: string }>({
    mutationFn: async ({ caseId }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/unpark', {
        params: { path: { caseId } },
        body: undefined,
      });
      if (error) throw new Error(`unpark failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpit,
  });

  const cockpitApi = useMemo<CockpitApi>(() => {
    const noop = (): void => undefined;
    return {
      isLoading: query.isLoading,
      error: query.error ?? null,
      refetch: () => void query.refetch(),
      cockpit: query.data?.cockpit ?? emptyCockpit(date),
      board: query.data?.board ?? [],
      lanes: query.data?.lanes ?? [],
      recentOverrides: query.data?.recentOverrides ?? [],
      dataset,
      recalculate,
      manualOverridesEnabled: MANUAL_OVERRIDES_ENABLED,

      prioritiseCase: (caseId, reason) => prioritiseMutation.mutate({ caseId, reason }),
      parkCase: (caseId, reason) => parkMutation.mutate({ caseId, reason }),
      releaseCase: (caseId) => unparkMutation.mutate({ caseId }),

      // No backend endpoint yet — gated off (MANUAL_OVERRIDES_ENABLED === false).
      withdrawCase: noop,
      addCaseToBundle: noop,
      reorderBundle: noop,
      pauseBundle: noop,

      updateRules: (rules) => setDataset((ds) => ({ ...ds, rules })),
      setLocations: (locations) => setDataset((ds) => ({ ...ds, locations })),
    };
  }, [query, dataset, recalculate, prioritiseMutation, parkMutation, unparkMutation, date]);

  return <CockpitContext.Provider value={cockpitApi}>{children}</CockpitContext.Provider>;
}

export function useCockpitData(): CockpitApi {
  const ctx = useContext(CockpitContext);
  if (!ctx) throw new Error('useCockpitData must be used within CockpitDataProvider');
  return ctx;
}
