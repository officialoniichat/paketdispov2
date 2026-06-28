/**
 * Single-source case-action registry (§8.4). The §7.1 case status *and* its
 * §8.2 priority flags decide which teamlead actions are offered — every surface
 * (Belege list, Belege detail, Digitale Ablagen) renders from {@link caseActions}
 * so the buttons stay consistent and there is no per-surface availability logic.
 *
 * Being flag-aware (not status-only) lets the priority toggle show the right
 * direction: "Priorisieren" only where it would change pool order and only when
 * the case is not already manually prioritised, otherwise "Priorität entfernen".
 */
import type { CaseStatus, PriorityFlag } from '@paket/domain-types';

export interface CaseActionCtx {
  caseId: string;
  bundleId?: string | null;
  store: {
    prioritiseCase(id: string, reason: string): void;
    deprioritiseCase(id: string, reason: string): void;
    parkCase(id: string, reason: string): void;
    releaseCase(id: string, reason: string): void; // unpark
    approveCase(id: string, reason: string): void; // needs_review -> ready
    reactivateCase(id: string, reason: string): void; // partially_completed -> ready
    cancelCase(id: string, reason: string): void;
    resolveIssue(id: string, reason: string): void; // issue_open -> in_progress (case-scoped)
  };
}

export type ActionTone = 'default' | 'primary' | 'warning' | 'error' | 'success';

export type CaseActionId =
  | 'approve'
  | 'prioritise'
  | 'deprioritise'
  | 'park'
  | 'unpark'
  | 'reactivate'
  | 'resolve_issue'
  | 'split'
  | 'cancel';

export interface CaseActionDescriptor {
  id: CaseActionId;
  label: string;
  tone: ActionTone;
  primary: boolean;
  reasonSuggestions: string[];
  /**
   * Custom actions are not confirmed through the generic mandatory-reason dialog;
   * they open their own dialog (which still captures a reason). `run` is a no-op
   * for them — the surface handles the interaction (see {@link CaseActions} onSplit).
   */
  custom?: 'split';
  run(ctx: CaseActionCtx, reason: string): void;
}

export interface CaseLike {
  status: CaseStatus;
  priorityFlags: readonly PriorityFlag[];
}

const REGISTRY: CaseActionDescriptor[] = [
  {
    id: 'approve',
    label: 'Zur Planung freigeben',
    tone: 'success',
    primary: true,
    reasonSuggestions: ['Daten geprüft', 'Klärung erledigt'],
    run: (c, r) => c.store.approveCase(c.caseId, r),
  },
  {
    id: 'resolve_issue',
    label: 'Problem freigeben',
    tone: 'success',
    primary: true,
    reasonSuggestions: ['Klärung erledigt', 'Daten korrigiert'],
    run: (c, r) => c.store.resolveIssue(c.caseId, r),
  },
  {
    id: 'reactivate',
    label: 'Rest reaktivieren',
    tone: 'primary',
    primary: true,
    reasonSuggestions: ['Rest heute fertig', 'Kapazität frei'],
    run: (c, r) => c.store.reactivateCase(c.caseId, r),
  },
  {
    id: 'park',
    label: 'Parken',
    tone: 'warning',
    primary: true,
    reasonSuggestions: ['Wartet auf Klärung', 'Unvollständige Ware', 'Rücksprache nötig'],
    run: (c, r) => c.store.parkCase(c.caseId, r),
  },
  {
    id: 'unpark',
    label: 'Entparken',
    tone: 'primary',
    primary: true,
    reasonSuggestions: ['Klärung erledigt', 'Daten korrigiert'],
    run: (c, r) => c.store.releaseCase(c.caseId, r),
  },
  {
    id: 'split',
    label: 'Aufteilen …',
    tone: 'primary',
    primary: true,
    // Driven by the SplitDialog, not the ReasonDialog (the dialog captures the reason).
    custom: 'split',
    reasonSuggestions: [],
    run: () => {
      /* custom: handled by the split dialog */
    },
  },
  {
    id: 'prioritise',
    label: 'Priorisieren',
    tone: 'default',
    primary: false,
    reasonSuggestions: ['Kunde wartet', 'Verladetag heute', 'Eskalation Markt'],
    run: (c, r) => c.store.prioritiseCase(c.caseId, r),
  },
  {
    id: 'deprioritise',
    label: 'Priorität entfernen',
    tone: 'default',
    primary: false,
    reasonSuggestions: ['Doch nicht dringend', 'Korrektur'],
    run: (c, r) => c.store.deprioritiseCase(c.caseId, r),
  },
  {
    id: 'cancel',
    label: 'Stornieren',
    tone: 'error',
    primary: false,
    reasonSuggestions: ['Dublette', 'ERP-Korrektur', 'Fehlimport'],
    run: (c, r) => c.store.cancelCase(c.caseId, r),
  },
];

const REGISTRY_ORDER = new Map(REGISTRY.map((a, i) => [a.id, i] as const));

export function caseActions(c: CaseLike): CaseActionDescriptor[] {
  const ids: CaseActionId[] = [];
  switch (c.status) {
    case 'needs_review':
      ids.push('approve', 'park', 'cancel');
      break;
    case 'ready':
      ids.push('split', 'park', 'cancel');
      break;
    case 'parked':
      ids.push('unpark', 'split', 'cancel');
      break;
    case 'assigned':
      ids.push('cancel');
      break;
    case 'in_progress':
      ids.push('cancel');
      break;
    case 'issue_open':
      ids.push('resolve_issue', 'cancel');
      break;
    case 'partially_completed':
      ids.push('reactivate');
      break;
    // completed / zst_done / cancelled: no actions
  }
  // Priority toggle only where it has an effect: pool states (the planning queue).
  const isPool = c.status === 'needs_review' || c.status === 'ready' || c.status === 'parked';
  if (isPool) {
    ids.push(c.priorityFlags.includes('manual_teamlead_priority') ? 'deprioritise' : 'prioritise');
  }

  const allowed = new Set(ids);
  return REGISTRY.filter((a) => allowed.has(a.id)).sort((a, b) => {
    if (a.primary !== b.primary) return Number(b.primary) - Number(a.primary);
    return (REGISTRY_ORDER.get(a.id) ?? 0) - (REGISTRY_ORDER.get(b.id) ?? 0);
  });
}
