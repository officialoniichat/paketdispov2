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
 * Belegdetails (§10.4) and Admin/Regelpflege (§11) are wired to their own live
 * endpoints (see {@link ./belege} and {@link ./admin}), so this store no longer
 * carries an in-memory mock dataset for them.
 */
import { createContext, useContext, useMemo, useState, type JSX, type ReactNode } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { WorkflowEvent } from '@paket/domain-types';
import type { AuditPayload } from './audit.js';
import type { components } from '@paket/api-client';
import { api, CURRENT_TEAMLEAD_ID } from './api.js';
import { fetchCockpit, type CockpitSnapshot } from './remoteDataset.js';
import {
  addCaseToBundle as addCaseToBundleRequest,
  assignToEmployee as assignToEmployeeRequest,
  commitAssignment,
  pauseBundle as pauseBundleRequest,
  previewAssignment,
  reorderBundle as reorderBundleRequest,
  resumeBundle as resumeBundleRequest,
  withdrawCase as withdrawCaseRequest,
} from './mutations.js';
import type {
  BoardCase,
  BoardRow,
  CockpitSummary,
  Lane,
  PoolCase,
  PreviewResult,
} from './types.js';

export { CURRENT_TEAMLEAD_ID };

type RecalculateResultDto = components['schemas']['RecalculateResultDto'];
type ZstExportResultDto = components['schemas']['ZstExportResultDto'];

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
      freeCapacityMinutes: 0,
      utilisationPct: 0,
    },
    pool: { openCases: 0, overdue: 0, prio: 0, catManDue: 0, openIssues: 0, endOfShiftOpen: 0 },
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
  /** Optional §8.4 audit reason (B2). */
  reason?: string;
}
export interface AssignVars {
  /** employeeNo of the target (the only employee id the board exposes). */
  employeeNo: string;
  caseId: string;
  /** Optional §8.4 audit reason (B2). */
  reason?: string;
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
  recentOverrides: WorkflowEvent<AuditPayload>[];
  /** Ready, unassigned cases that can be added to a bundle (§10.3). */
  pool: PoolCase[];
  /** §E.4 commit "Live zuweisen" → real assignment engine (persists). */
  recalculate: UseMutationResult<RecalculateResultDto, Error, void>;
  /** §E.4 preview "Simulieren" → engine dry-run (persists nothing). */
  preview: UseMutationResult<PreviewResult, Error, void>;
  /** §15.1 Tagesabschluss: export completed cases (→ zst_done) and download the ZST CSV. */
  exportZst: UseMutationResult<ZstExportResultDto, Error, void>;
  /** Audited single-case overrides backed by real endpoints. */
  parkCase(caseId: string, reason: string): void;
  releaseCase(caseId: string, reason: string): void;
  prioritiseCase(caseId: string, reason: string): void;
  /** Remove a manual teamlead priority (→ back to normal pool order). */
  deprioritiseCase(caseId: string, reason: string): void;
  /** Approve a needs_review case into the planning pool (needs_review → ready). */
  approveCase(caseId: string, reason: string): void;
  /** Reactivate the remainder of a partially completed case (partially_completed → ready). */
  reactivateCase(caseId: string, reason: string): void;
  /** Storno — cancel a case (→ cancelled, case.cancelled). Reasoned + audited. */
  cancelCase(caseId: string, reason: string): void;
  /** Issue triage: resolve an open issue (issue_open → in_progress). */
  resolveIssue(caseId: string, reason: string): void;
  /** Audited bundle interventions backed by real endpoints (§8.4). */
  withdraw: BundleMutation<WithdrawVars>;
  addToBundle: BundleMutation<AddVars>;
  /** §8.4 manual assign: append the Beleg to the employee's Bündel, or create it if free. */
  assignToEmployee: BundleMutation<AssignVars>;
  reorder: BundleMutation<ReorderVars>;
  pauseResume: BundleMutation<PauseVars>;
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

  const invalidateCockpit = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
  };

  /**
   * Single-case audited actions (park/unpark/prioritise) change both the cockpit
   * snapshot AND any open Belegdetails, so they refresh both query families.
   */
  const invalidateCockpitAndBelege = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
    void queryClient.invalidateQueries({ queryKey: ['beleg'] });
    void queryClient.invalidateQueries({ queryKey: ['belege'] });
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

  const exportZst = useMutation<ZstExportResultDto, Error, void>({
    mutationFn: async () => {
      const { data, error } = await api.POST('/api/teamlead/assignments/export-zst', {});
      if (error || !data) throw new Error(`export failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpitAndBelege,
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
    onSettled: invalidateCockpitAndBelege,
  });

  const deprioritiseMutation = useMutation<unknown, Error, { caseId: string; reason: string }>({
    mutationFn: async ({ caseId, reason }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/deprioritize', {
        params: { path: { caseId } },
        body: { reason },
      });
      if (error) throw new Error(`deprioritize failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpitAndBelege,
  });

  const approveMutation = useMutation<unknown, Error, { caseId: string; reason: string }>({
    mutationFn: async ({ caseId, reason }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/approve', {
        params: { path: { caseId } },
        body: { reason },
      });
      if (error) throw new Error(`approve failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpitAndBelege,
  });

  const reactivateMutation = useMutation<unknown, Error, { caseId: string; reason: string }>({
    mutationFn: async ({ caseId, reason }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/reactivate', {
        params: { path: { caseId } },
        body: { reason },
      });
      if (error) throw new Error(`reactivate failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpitAndBelege,
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
    onSettled: invalidateCockpitAndBelege,
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
    onSettled: invalidateCockpitAndBelege,
  });

  const cancelMutation = useMutation<unknown, Error, { caseId: string; reason: string }>({
    mutationFn: async ({ caseId, reason }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/cancel', {
        params: { path: { caseId } },
        body: { reason },
      });
      if (error) throw new Error(`cancel failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpitAndBelege,
  });

  const resolveIssueMutation = useMutation<unknown, Error, { caseId: string; reason: string }>({
    mutationFn: async ({ caseId, reason }) => {
      const { data, error } = await api.POST('/api/teamlead/cases/{caseId}/resolve-issue', {
        params: { path: { caseId } },
        body: { resolution: reason },
      });
      if (error) throw new Error(`resolve failed (${JSON.stringify(error)})`);
      return data;
    },
    onSettled: invalidateCockpitAndBelege,
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
          const newCase: BoardCase = {
            caseId,
            weBelegNo: poolCase?.weBelegNo ?? caseId,
            status: 'assigned',
            // Optimistic placeholder; the settled refetch fills the real Teile.
            totalQuantity: 0,
            estimatedMinutes: poolCase?.estimatedMinutes ?? 0,
            effortPoints: 0,
            storageCode: '',
          };
          const cases = [...row.cases, newCase];
          return { ...row, cases, bundleSize: cases.length };
        });
        return { ...withRow, pool: withRow.pool.filter((p) => p.caseId !== caseId) };
      }),
    onError: (_e, _v, context) => rollback(context),
    onSettled: invalidateCockpit,
  });

  // Manual assign (§8.4). No optimistic patch: a free employee has no bundleId to
  // target with patchBoardRow, and the backend find-or-create decides the target —
  // a plain invalidate-on-settle is the correct, safe choice for both branches.
  const assignToEmployee = useMutation<unknown, Error, AssignVars>({
    mutationFn: ({ employeeNo, caseId, reason }) =>
      assignToEmployeeRequest(api, { employeeNo, caseId, reason, date }),
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
      recalculate,
      preview,
      exportZst,

      prioritiseCase: (caseId, reason) => prioritiseMutation.mutate({ caseId, reason }),
      deprioritiseCase: (caseId, reason) => deprioritiseMutation.mutate({ caseId, reason }),
      approveCase: (caseId, reason) => approveMutation.mutate({ caseId, reason }),
      reactivateCase: (caseId, reason) => reactivateMutation.mutate({ caseId, reason }),
      parkCase: (caseId, reason) => parkMutation.mutate({ caseId, reason }),
      releaseCase: (caseId) => unparkMutation.mutate({ caseId }),
      cancelCase: (caseId, reason) => cancelMutation.mutate({ caseId, reason }),
      resolveIssue: (caseId, reason) => resolveIssueMutation.mutate({ caseId, reason }),

      withdraw,
      addToBundle,
      assignToEmployee,
      reorder,
      pauseResume,
    }),
    [
      query,
      recalculate,
      preview,
      exportZst,
      prioritiseMutation,
      deprioritiseMutation,
      approveMutation,
      reactivateMutation,
      parkMutation,
      unparkMutation,
      cancelMutation,
      resolveIssueMutation,
      withdraw,
      addToBundle,
      assignToEmployee,
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
