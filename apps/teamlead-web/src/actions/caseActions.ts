/**
 * Single-source case-action registry (§8.4). The §7.1 case status *and* its
 * §8.2 priority flags — plus the status-neutral assign/forward/attention
 * flags — decide which teamlead actions are offered. Every surface (Belege
 * list, Belege detail, Digitale Ablagen) renders from
 * {@link getAvailableActions} so the buttons stay consistent and there is no
 * per-surface availability logic.
 *
 * Being flag-aware (not status-only) lets the priority toggle show the right
 * direction: "Priorisieren" only where it would change pool order and only when
 * the case is not already manually prioritised, otherwise "Priorität entfernen".
 * The same pattern applies to forwarding ("Weiterleiten an…" ↔ "Zurückholen")
 * and the attention flag ("Besondere Aufmerksamkeit" ↔ "Aufmerksamkeit entfernen").
 */
import type { CaseStatus, ForwardRecipient, PriorityFlag } from '@paket/domain-types';

export interface CaseActionCtx {
  caseId: string;
  bundleId?: string | null;
  store: {
    prioritiseCase(id: string, reason: string): void;
    deprioritiseCase(id: string, reason: string): void;
    parkCase(id: string, reason: string): void;
    releaseCase(id: string, reason: string): void; // unpark
    approveCase(id: string, reason: string): void; // needs_review -> ready
    cancelCase(id: string, reason: string): void;
    /** Klärt ALLE offenen Probleme des Belegs (issue_open -> problem_resolved). */
    resolveProblems(id: string, resolution?: string): void;
    forwardCase(id: string, recipient: ForwardRecipient, reason?: string): void;
    unforwardCase(id: string): void;
    flagAttention(id: string, note?: string): void;
    unflagAttention(id: string): void;
  };
}

export type ActionTone = 'default' | 'primary' | 'warning' | 'error' | 'success';

export type CaseActionId =
  | 'approve'
  | 'prioritise'
  | 'deprioritise'
  | 'park'
  | 'unpark'
  | 'resolve_problems'
  | 'split'
  | 'assign'
  | 'forward'
  | 'unforward'
  | 'attention'
  | 'unattention'
  | 'cancel';

export interface CaseActionDescriptor {
  id: CaseActionId;
  label: string;
  tone: ActionTone;
  primary: boolean;
  reasonSuggestions: string[];
  /**
   * Custom actions are not confirmed through the generic mandatory-reason dialog;
   * they open their own dialog (which still captures a reason where relevant). `run`
   * is a no-op for them — the surface handles the interaction via the matching
   * `onSplit`/`onAssign`/`onForward`/`onAttention` handler (see {@link CaseActionMenu}).
   */
  custom?: 'split' | 'assign' | 'forward' | 'attention';
  /**
   * Runs immediately on click with no dialog at all — a one-click reversal
   * (Zurückholen, Aufmerksamkeit entfernen), matching the reversed action's
   * own one-click UX rather than gating it behind a reason.
   */
  instant?: boolean;
  /**
   * Opens the reason dialog with an OPTIONAL note instead of the mandatory
   * §8.4 reason (e.g. „Probleme geklärt": the resolution is a courtesy note
   * for the Mitarbeiter, not an audit prerequisite).
   */
  optionalReason?: boolean;
  run(ctx: CaseActionCtx, reason: string): void;
}

export interface CaseLike {
  status: CaseStatus;
  priorityFlags: readonly PriorityFlag[];
  /** null/undefined = unassigned. "Zuweisen" only offered on unassigned ready cases. */
  assignedTo?: string | null;
  /** C5: forwarding is status-neutral (no §7.1 transition). null = not forwarded. */
  forwardedTo?: string | null;
  /** A7 TL-Topf: „Besondere Aufmerksamkeit" is status-neutral. */
  attentionFlag?: boolean;
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
    id: 'resolve_problems',
    label: 'Probleme geklärt',
    tone: 'success',
    primary: true,
    optionalReason: true,
    reasonSuggestions: ['Mit Mitarbeiter besprochen', 'Daten korrigiert', 'Lieferant informiert'],
    // Klärt ALLE offenen Probleme; der Beleg wird grün beim selben MA (problem_resolved).
    run: (c, r) => c.store.resolveProblems(c.caseId, r.trim() === '' ? undefined : r.trim()),
  },
  {
    id: 'assign',
    label: 'Zuweisen',
    tone: 'primary',
    primary: true,
    custom: 'assign',
    reasonSuggestions: [],
    run: () => {
      /* custom: handled by the assign dialog */
    },
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
    id: 'forward',
    label: 'Weiterleiten an…',
    tone: 'default',
    primary: false,
    custom: 'forward',
    reasonSuggestions: [],
    run: () => {
      /* custom: handled by the forward dialog */
    },
  },
  {
    id: 'unforward',
    label: 'Zurückholen',
    tone: 'default',
    primary: false,
    instant: true,
    reasonSuggestions: [],
    run: (c) => c.store.unforwardCase(c.caseId),
  },
  {
    id: 'attention',
    label: 'Besondere Aufmerksamkeit',
    tone: 'warning',
    primary: false,
    custom: 'attention',
    reasonSuggestions: [],
    run: () => {
      /* custom: handled by the attention dialog */
    },
  },
  {
    id: 'unattention',
    label: 'Aufmerksamkeit entfernen',
    tone: 'default',
    primary: false,
    instant: true,
    reasonSuggestions: [],
    run: (c) => c.store.unflagAttention(c.caseId),
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

/** Terminal statuses have no legal transitions and no status-neutral actions either. */
function isTerminal(status: CaseStatus): boolean {
  return status === 'completed' || status === 'zst_done' || status === 'cancelled';
}

export function getAvailableActions(c: CaseLike): CaseActionDescriptor[] {
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
      ids.push('resolve_problems', 'cancel');
      break;
    case 'problem_resolved':
      // Geklärt: liegt wieder beim selben MA — keine weitere TL-Statusaktion nötig.
      ids.push('cancel');
      break;
    // completed / zst_done / cancelled: no status-driven actions.
  }
  // Priority toggle only where it has an effect: pool states (the planning queue).
  const isPool = c.status === 'needs_review' || c.status === 'ready' || c.status === 'parked';
  if (isPool) {
    ids.push(c.priorityFlags.includes('manual_teamlead_priority') ? 'deprioritise' : 'prioritise');
  }

  // Zuweisen: only a free (ready, unassigned) case can be manually assigned.
  if (c.status === 'ready' && (c.assignedTo === undefined || c.assignedTo === null)) {
    ids.push('assign');
  }

  // C5 forwarding + A7 attention are status-neutral — offered on every non-terminal case.
  if (!isTerminal(c.status)) {
    ids.push(c.forwardedTo != null ? 'unforward' : 'forward');
    ids.push(c.attentionFlag === true ? 'unattention' : 'attention');
  }

  const allowed = new Set(ids);
  return REGISTRY.filter((a) => allowed.has(a.id)).sort((a, b) => {
    if (a.primary !== b.primary) return Number(b.primary) - Number(a.primary);
    return (REGISTRY_ORDER.get(a.id) ?? 0) - (REGISTRY_ORDER.get(b.id) ?? 0);
  });
}
