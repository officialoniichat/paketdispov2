/**
 * Single-source case-action registry (§8.4). The §7.1 case status is the only
 * input that decides which teamlead actions are offered — every surface (Belege
 * list, Belege detail, Digitale Ablagen) renders from {@link caseActions} so the
 * buttons stay consistent and there is no per-surface availability logic.
 */
import type { CaseStatus } from '@paket/domain-types';

export interface CaseActionCtx {
  caseId: string;
  bundleId?: string | null;
  issueId?: string | null;
  store: {
    prioritiseCase(id: string, reason: string): void;
    parkCase(id: string, reason: string): void;
    releaseCase(id: string, reason: string): void; // unpark
    cancelCase(id: string, reason: string): void;
    resolveIssue(issueId: string, reason: string): void; // issue_open -> in_progress
  };
}

export type ActionTone = 'default' | 'primary' | 'warning' | 'error' | 'success';

export interface CaseActionDescriptor {
  id: 'prioritise' | 'park' | 'unpark' | 'resolve_issue' | 'cancel';
  label: string;
  tone: ActionTone;
  primary: boolean;
  reasonSuggestions: string[];
  run(ctx: CaseActionCtx, reason: string): void;
}

const REGISTRY: CaseActionDescriptor[] = [
  { id: 'resolve_issue', label: 'Problem freigeben', tone: 'success', primary: true,
    reasonSuggestions: ['Klärung erledigt', 'Daten korrigiert'],
    run: (c, r) => { if (c.issueId) c.store.resolveIssue(c.issueId, r); } },
  { id: 'park', label: 'Parken', tone: 'warning', primary: true,
    reasonSuggestions: ['Wartet auf Klärung', 'Unvollständige Ware', 'Rücksprache nötig'],
    run: (c, r) => c.store.parkCase(c.caseId, r) },
  { id: 'unpark', label: 'Entparken', tone: 'primary', primary: true,
    reasonSuggestions: ['Klärung erledigt', 'Daten korrigiert'],
    run: (c, r) => c.store.releaseCase(c.caseId, r) },
  { id: 'prioritise', label: 'Priorisieren', tone: 'default', primary: false,
    reasonSuggestions: ['Kunde wartet', 'Verladetag heute', 'Eskalation Markt'],
    run: (c, r) => c.store.prioritiseCase(c.caseId, r) },
  { id: 'cancel', label: 'Stornieren', tone: 'error', primary: false,
    reasonSuggestions: ['Dublette', 'ERP-Korrektur', 'Fehlimport'],
    run: (c, r) => c.store.cancelCase(c.caseId, r) },
];

const AVAILABILITY: Record<CaseStatus, CaseActionDescriptor['id'][]> = {
  needs_review: ['park', 'prioritise', 'cancel'],
  ready: ['park', 'prioritise', 'cancel'],
  parked: ['unpark', 'prioritise', 'cancel'],
  assigned: ['prioritise', 'cancel'],
  in_progress: ['prioritise'],
  issue_open: ['resolve_issue', 'prioritise'],
  partially_completed: [],
  completed: [],
  zst_done: [],
  cancelled: [],
};

export function caseActions(status: CaseStatus): CaseActionDescriptor[] {
  const allowed = new Set(AVAILABILITY[status]);
  return REGISTRY.filter((a) => allowed.has(a.id)).sort((a, b) => Number(b.primary) - Number(a.primary));
}
