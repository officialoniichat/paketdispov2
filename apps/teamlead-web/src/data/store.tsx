/**
 * In-memory cockpit store (React context). Single source of UI state for the
 * teamlead surface; every mutation is an audited teamlead override (§8.4) that
 * appends a WorkflowEvent and returns a new immutable dataset.
 *
 * Today the initial snapshot comes from `loadMockDataset()`; in EPIC 3/6 the
 * provider seeds from @paket/api-client reads and the mutators POST commands.
 */
import { createContext, useContext, useMemo, useState, type JSX, type ReactNode } from 'react';
import type {
  AssignmentBundle,
  GoodsReceiptCase,
  LocationMaster,
  WorkflowEvent,
} from '@paket/domain-types';
import { createOverrideEvent, type OverrideAction } from './audit.js';
import { loadMockDataset } from './mock.js';
import {
  buildBoardRows,
  buildCockpitSummary,
  buildLanes,
  simulateRecalculation,
} from './selectors.js';
import type {
  BoardRow,
  CockpitSummary,
  Lane,
  OperationsDataset,
  RuleConfig,
  SimulationResult,
} from './types.js';

/** Logged-in teamlead; replaced by the OIDC subject in EPIC 3 (§16.1). */
export const CURRENT_TEAMLEAD_ID = 'tl-001';

export interface CockpitApi {
  dataset: OperationsDataset;
  cockpit: CockpitSummary;
  lanes: Lane[];
  board: BoardRow[];
  recentOverrides: WorkflowEvent[];
  simulate(): SimulationResult;
  parkCase(caseId: string, reason: string): void;
  releaseCase(caseId: string, reason: string): void;
  prioritiseCase(caseId: string, reason: string): void;
  withdrawCase(caseId: string, bundleId: string, reason: string): void;
  addCaseToBundle(caseId: string, bundleId: string, reason: string): void;
  reorderBundle(bundleId: string, caseIds: string[], reason: string): void;
  pauseBundle(bundleId: string, reason: string): void;
  commitSimulation(result: SimulationResult, reason: string): void;
  /** §11 Regelpflege – config edits (not an override; persisted by Admin-API in EPIC 3). */
  updateRules(rules: RuleConfig): void;
  /** §11.2 LocationMaster-Pflege. */
  setLocations(locations: LocationMaster[]): void;
}

const CockpitContext = createContext<CockpitApi | null>(null);

function mapCases(
  ds: OperationsDataset,
  caseId: string,
  fn: (c: GoodsReceiptCase) => GoodsReceiptCase,
): GoodsReceiptCase[] {
  return ds.cases.map((c) => (c.id === caseId ? fn(c) : c));
}

function mapBundles(
  ds: OperationsDataset,
  bundleId: string,
  fn: (b: AssignmentBundle) => AssignmentBundle,
): AssignmentBundle[] {
  return ds.bundles.map((b) => (b.id === bundleId ? fn(b) : b));
}

interface OverrideExtra {
  previousBundleId?: string;
  newBundleId?: string;
  previousState?: string;
  newState?: string;
  entityType?: string;
}

export function CockpitDataProvider({ children }: { children: ReactNode }): JSX.Element {
  const [dataset, setDataset] = useState<OperationsDataset>(() => loadMockDataset());

  const api = useMemo<CockpitApi>(() => {
    /** Append an audit event and apply the matching immutable dataset change. */
    function override(
      action: OverrideAction,
      entityId: string,
      reason: string,
      mutate: (ds: OperationsDataset) => Partial<OperationsDataset>,
      extra: OverrideExtra = {},
    ): void {
      const event = createOverrideEvent({
        action,
        entityId,
        reason,
        actorId: CURRENT_TEAMLEAD_ID,
        ...extra,
      });
      setDataset((ds) => ({ ...ds, ...mutate(ds), events: [event, ...ds.events] }));
    }

    return {
      dataset,
      cockpit: buildCockpitSummary(dataset),
      lanes: buildLanes(dataset),
      board: buildBoardRows(dataset),
      recentOverrides: dataset.events.filter((e) => e.actorType === 'teamlead'),
      simulate: () => simulateRecalculation(dataset),

      parkCase: (caseId, reason) =>
        override(
          'parken',
          caseId,
          reason,
          (ds) => ({ cases: mapCases(ds, caseId, (c) => ({ ...c, status: 'parked' })) }),
          { previousState: 'ready', newState: 'parked' },
        ),

      releaseCase: (caseId, reason) =>
        override(
          'freigeben',
          caseId,
          reason,
          (ds) => ({ cases: mapCases(ds, caseId, (c) => ({ ...c, status: 'ready' })) }),
          { previousState: 'parked', newState: 'ready' },
        ),

      prioritiseCase: (caseId, reason) =>
        override('priorisieren', caseId, reason, (ds) => ({
          cases: mapCases(ds, caseId, (c) =>
            c.priorityFlags.includes('manual_teamlead_priority')
              ? c
              : { ...c, priorityFlags: [...c.priorityFlags, 'manual_teamlead_priority'] },
          ),
        })),

      withdrawCase: (caseId, bundleId, reason) =>
        override(
          'entziehen',
          caseId,
          reason,
          (ds) => ({
            bundles: mapBundles(ds, bundleId, (b) => ({
              ...b,
              caseIds: b.caseIds.filter((id) => id !== caseId),
            })),
            cases: mapCases(ds, caseId, (c) => ({
              ...c,
              status: 'ready',
              assignedBundleId: undefined,
            })),
          }),
          { previousBundleId: bundleId },
        ),

      addCaseToBundle: (caseId, bundleId, reason) =>
        override(
          'hinzufuegen',
          caseId,
          reason,
          (ds) => ({
            bundles: mapBundles(ds, bundleId, (b) =>
              b.caseIds.includes(caseId) ? b : { ...b, caseIds: [...b.caseIds, caseId] },
            ),
            cases: mapCases(ds, caseId, (c) => ({
              ...c,
              status: 'assigned',
              assignedBundleId: bundleId,
            })),
          }),
          { newBundleId: bundleId },
        ),

      reorderBundle: (bundleId, caseIds, reason) =>
        override(
          'reihenfolge',
          bundleId,
          reason,
          (ds) => ({ bundles: mapBundles(ds, bundleId, (b) => ({ ...b, caseIds })) }),
          { entityType: 'bundle', previousBundleId: bundleId },
        ),

      pauseBundle: (bundleId, reason) =>
        override(
          'pause',
          bundleId,
          reason,
          (ds) => ({
            bundles: mapBundles(ds, bundleId, (b) => ({
              ...b,
              status: b.status === 'paused' ? 'active' : 'paused',
            })),
          }),
          { entityType: 'bundle' },
        ),

      commitSimulation: (result, reason) =>
        override(
          'neuverteilen',
          'pool',
          reason,
          (ds) => {
            const byEmp = new Map(result.perEmployee.map((p) => [p.employeeId, p.afterMinutes]));
            return {
              bundles: ds.bundles.map((b) => ({
                ...b,
                plannedEffortMinutes: byEmp.get(b.employeeId) ?? b.plannedEffortMinutes,
              })),
            };
          },
          { entityType: 'pool', newState: `assigned:${result.newlyAssigned}` },
        ),

      updateRules: (rules) => setDataset((ds) => ({ ...ds, rules })),
      setLocations: (locations) => setDataset((ds) => ({ ...ds, locations })),
    };
  }, [dataset]);

  return <CockpitContext.Provider value={api}>{children}</CockpitContext.Provider>;
}

export function useCockpitData(): CockpitApi {
  const ctx = useContext(CockpitContext);
  if (!ctx) throw new Error('useCockpitData must be used within CockpitDataProvider');
  return ctx;
}
