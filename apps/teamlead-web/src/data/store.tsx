/**
 * Cockpit store (React context) — backed by the live backend.
 *
 * `cockpit`, `board`, `lanes`, `recentOverrides` and the addable `pool` come from
 * a TanStack Query read of the teamlead endpoints (see {@link fetchCockpit}).
 *
 * Every teamlead action is wired to a real, audited (§8.4) endpoint via
 * {@link ./mutations}: park/unpark/prioritise, and the manual interventions
 * withdraw/add/reorder/pause/resume. Bundle interventions apply an optimistic
 * patch to the cached snapshot, roll back on error, and always invalidate
 * `['cockpit']` once settled so the board/KPIs/audit feed refetch.
 *
 * §E.4 "Neu berechnen" is split into a non-committal preview
 * (`/assignments/preview`, persists nothing) and a commit
 * (`/assignments/recalculate`, the real persist).
 *
 * Surfaces without a backend endpoint yet (Belegdetails, Admin/Regelpflege)
 * still read the in-memory `dataset` mock so they keep compiling.
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
import {
  addCaseToBundle as addCaseToBundleRequest,
  commitAssignment,
  pauseBundle as pauseBundleRequest,
  previewAssignment,
  reorderBundle as reorderBundleRequest,
  resumeBundle as resumeBundleRequest,
  withdrawCase as withdrawCaseRequest,
} from './mutations.js';
import type {
  BoardRow,
  CockpitSummary,
  Lane,
  OperationsDataset,
  PoolCase,
  PreviewResult,
  RuleConfig,
} from './types.js';

export { CURRENT_TEAMLEAD_ID };

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

/** A bundle intervention mutation (withdraw/add/reorder/pause/resume). */
export type BundleMutation<V> = UseMutationResult<unknown, Error, V>;

export interface WithdrawVars {
  caseId: string;
  bundleId: string;
  reason: string;
}
export interface AddVars {
  caseId: string;
  bundleId: string;
  reason: string;
}
export interface ReorderVars {
  bundleId: string;
  caseIds: string[];
  reason: string;
}
export interface PauseVars {
  bundleId: string;
  reason: string;
  /** Current bundle state; decides pause vs. resume. */
  paused: boolean;
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
  /** Ready, unassigned cases that can be added to a bundle (§10.3). */
  pool: PoolCase[];
  /** Mock fallback for surfaces without a backend read yet (details/admin). */
  dataset: OperationsDataset;
  /** §E.4 commit "Live zuweisen" → real assignment engine (persists). */
  recalculate: UseMutationResult<RecalculateResultDto, Error, void>;
  /** §E.4 preview "Simulieren" → engine dry-run (persists nothing). */
  preview: UseMutationResult<PreviewResult, Error, void>;
  /** Audited single-case overrides backed by real endpoints. */
  parkCase(caseId: string, reason: string): void;
  releaseCase(caseId: string, reason: string): void;
  prioritiseCase(caseId: string, reason: string): void;
  /** Audited bundle interventions backed by real endpoints (§8.4). */
  withdraw: BundleMutation<WithdrawVars>;
  addToBundle: BundleMutation<AddVars>;
  reorder: BundleMutation<ReorderVars>;
  pauseResume: BundleMutation<PauseVars>;
  /** §11 Regelpflege – local-only config edits for now. */
  updateRules(rules: RuleConfig): void;
  setLocations(locations: LocationMaster[]): void;
}

const CockpitContext = createContext<CockpitApi | null>(null);

/** Immutably patch the board row that owns `bundleId`. */
function patchBoardRow(
  snapshot: CockpitSnapshot,
  bundleId: string,
  fn: (row: BoardRow) => BoardRow,
): CockpitSnapshot {
  return {
    ...snapshot,
    board: snapshot.board.map((row) => (row.bundleId === bundleId ? fn(row) : row)),
  };
}

export function CockpitDataProvider({ children }: { children: ReactNode }): JSX.Element {
  const [date] = useState<string>(() => today());
  const queryClient = useQueryClient();
  const cockpitKey = ['cockpit', date] as const;

  const query = useQuery<CockpitSnapshot, Error>({
    queryKey: cockpitKey,
    queryFn: () => fetchCockpit(date),
  });

  // Mock-only state for surfaces the backend does not expose yet.
  const [dataset, setDataset] = useState<OperationsDataset>(() => loadMockDataset());

  const invalidateCockpit = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
  };

  /**
   * Optimistically apply `patch` to the cached snapshot, returning a rollback
   * context. Shared by every bundle intervention so failures restore the board.
   */
  async function optimistic(
    patch: (snapshot: CockpitSnapshot) => CockpitSnapshot,
  ): Promise<{ previous: CockpitSnapshot | undefined }> {
    await queryClient.cancelQueries({ queryKey: cockpitKey });
    const previous = queryClient.getQueryData<CockpitSnapshot>(cockpitKey);
    if (previous) {
      queryClient.setQueryData<CockpitSnapshot>(cockpitKey, patch(previous));
    }
    return { previous };
  }

  function rollback(context: { previous: CockpitSnapshot | undefined } | undefined): void {
    if (context?.previous) {
      queryClient.setQueryData<CockpitSnapshot>(cockpitKey, context.previous);
    }
  }

  const recalculate = useMutation<RecalculateResultDto, Error, void>({
    mutationFn: () => commitAssignment(api, date),
    onSettled: invalidateCockpit,
  });

  const preview = useMutation<PreviewResult, Error, void>({
    mutationFn: () => previewAssignment(api, date),
    // Preview persists nothing → no invalidation, board stays unchanged.
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

  // --- §8.4 audited bundle interventions, with optimistic board patches -----

  const withdraw = useMutation<unknown, Error, WithdrawVars, { previous: CockpitSnapshot | undefined }>(
    {
      mutationFn: ({ caseId, bundleId, reason }) =>
        withdrawCaseRequest(api, { bundleId, caseId, reason }),
      onMutate: ({ caseId, bundleId }) =>
        optimistic((snapshot) =>
          patchBoardRow(snapshot, bundleId, (row) => {
            const cases = row.cases.filter((c) => c.caseId !== caseId);
            return { ...row, cases, bundleSize: cases.length };
          }),
        ),
      onError: (_e, _v, context) => rollback(context),
      onSettled: invalidateCockpit,
    },
  );

  const addToBundle = useMutation<unknown, Error, AddVars, { previous: CockpitSnapshot | undefined }>({
    mutationFn: ({ caseId, bundleId, reason }) =>
      addCaseToBundleRequest(api, { bundleId, caseId, reason }),
    onMutate: ({ caseId, bundleId }) =>
      optimistic((snapshot) => {
        const poolCase = snapshot.pool.find((p) => p.caseId === caseId);
        const withRow = patchBoardRow(snapshot, bundleId, (row) => {
          if (row.cases.some((c) => c.caseId === caseId)) return row;
          const cases = [
            ...row.cases,
            {
              caseId,
              weBelegNo: poolCase?.weBelegNo ?? caseId,
              status: 'assigned' as BoardRow['cases'][number]['status'],
              estimatedMinutes: poolCase?.estimatedMinutes ?? 0,
              effortPoints: 0,
              storageCode: '',
            },
          ];
          return { ...row, cases, bundleSize: cases.length };
        });
        return { ...withRow, pool: withRow.pool.filter((p) => p.caseId !== caseId) };
      }),
    onError: (_e, _v, context) => rollback(context),
    onSettled: invalidateCockpit,
  });

  const reorder = useMutation<unknown, Error, ReorderVars, { previous: CockpitSnapshot | undefined }>({
    mutationFn: ({ bundleId, caseIds, reason }) =>
      reorderBundleRequest(api, { bundleId, caseIds, reason }),
    onMutate: ({ bundleId, caseIds }) =>
      optimistic((snapshot) =>
        patchBoardRow(snapshot, bundleId, (row) => {
          const byId = new Map(row.cases.map((c) => [c.caseId, c]));
          const reordered = caseIds
            .map((id) => byId.get(id))
            .filter((c): c is BoardRow['cases'][number] => c !== undefined);
          return reordered.length === row.cases.length ? { ...row, cases: reordered } : row;
        }),
      ),
    onError: (_e, _v, context) => rollback(context),
    onSettled: invalidateCockpit,
  });

  const pauseResume = useMutation<unknown, Error, PauseVars, { previous: CockpitSnapshot | undefined }>(
    {
      mutationFn: ({ bundleId, reason, paused }) =>
        paused
          ? resumeBundleRequest(api, { bundleId, reason })
          : pauseBundleRequest(api, { bundleId, reason }),
      onMutate: ({ bundleId, paused }) =>
        optimistic((snapshot) =>
          patchBoardRow(snapshot, bundleId, (row) => ({ ...row, paused: !paused })),
        ),
      onError: (_e, _v, context) => rollback(context),
      onSettled: invalidateCockpit,
    },
  );

  const cockpitApi = useMemo<CockpitApi>(
    () => ({
      isLoading: query.isLoading,
      error: query.error ?? null,
      refetch: () => void query.refetch(),
      cockpit: query.data?.cockpit ?? emptyCockpit(date),
      board: query.data?.board ?? [],
      lanes: query.data?.lanes ?? [],
      recentOverrides: query.data?.recentOverrides ?? [],
      pool: query.data?.pool ?? [],
      dataset,
      recalculate,
      preview,

      prioritiseCase: (caseId, reason) => prioritiseMutation.mutate({ caseId, reason }),
      parkCase: (caseId, reason) => parkMutation.mutate({ caseId, reason }),
      releaseCase: (caseId) => unparkMutation.mutate({ caseId }),

      withdraw,
      addToBundle,
      reorder,
      pauseResume,

      updateRules: (rules) => setDataset((ds) => ({ ...ds, rules })),
      setLocations: (locations) => setDataset((ds) => ({ ...ds, locations })),
    }),
    [
      query,
      dataset,
      recalculate,
      preview,
      prioritiseMutation,
      parkMutation,
      unparkMutation,
      withdraw,
      addToBundle,
      reorder,
      pauseResume,
      date,
    ],
  );

  return <CockpitContext.Provider value={cockpitApi}>{children}</CockpitContext.Provider>;
}

export function useCockpitData(): CockpitApi {
  const ctx = useContext(CockpitContext);
  if (!ctx) throw new Error('useCockpitData must be used within CockpitDataProvider');
  return ctx;
}
