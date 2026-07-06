/**
 * L&T design tokens (Anhang E.6).
 *
 * Pure data only – no React, no MUI imports – so the palette is usable from
 * tests, Storybook and the MUI theme alike. Status colour is ALWAYS paired with
 * a text label and an icon at the component layer; colour alone is never the
 * only signal (E.6 + WCAG 1.4.1).
 */
import type { CaseStatus, IssueStatus, PriorityFlag } from '@paket/domain-types';

/** L&T brand palette. */
export const ltColors = {
  brand: '#0a3d62',
  brandLight: '#3c6e8f',
  accent: '#e58e26',
  surface: '#f5f7fa',
  surfaceRaised: '#ffffff',
  textPrimary: '#1a2430',
  textSecondary: '#516170',
  border: '#d6dde5',
  danger: '#c62828',
  warning: '#b26a00',
  success: '#2e7d32',
  info: '#1565c0',
  neutral: '#516170',
} as const;

/** 8px-based spacing scale; large targets for gloved warehouse use. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Minimum tap target for primary warehouse actions (E.3 Next Best Action). */
export const touchTarget = { min: 48, primary: 64 } as const;

/** A status chip descriptor: never colour-only (E.6). */
export interface ChipMeta {
  /** Default German label shown next to the icon. */
  label: string;
  /** Background colour. */
  bg: string;
  /** Foreground (text + icon) colour, contrast-checked against `bg`. */
  fg: string;
  /** Semantic icon key resolved to an MUI icon at the component layer. */
  icon: ChipIconKey;
}

export type ChipIconKey =
  | 'inbox'
  | 'check'
  | 'doneAll'
  | 'pause'
  | 'play'
  | 'warning'
  | 'error'
  | 'flag'
  | 'priority'
  | 'schedule'
  | 'sync'
  | 'syncProblem'
  | 'cloudOff'
  | 'cloudDone'
  | 'pending'
  | 'cancel'
  | 'build'
  | 'inventory';

/** Belegstatus chips covering the full case lifecycle (Anhang A / §7). */
export const caseStatusMeta: Record<CaseStatus, ChipMeta> = {
  needs_review: { label: 'Prüfung nötig', bg: ltColors.warning, fg: '#ffffff', icon: 'warning' },
  // Intake-Gate (D1): Pflichtdaten fehlen — „zurück an Bucher".
  blocked: { label: 'Zurück an Bucher', bg: '#8e3b46', fg: '#ffffff', icon: 'error' },
  ready: { label: 'Bereit', bg: ltColors.success, fg: '#ffffff', icon: 'check' },
  parked: { label: 'Geparkt', bg: '#6b6b6b', fg: '#ffffff', icon: 'pause' },
  assigned: { label: 'Zugewiesen', bg: ltColors.info, fg: '#ffffff', icon: 'play' },
  in_progress: { label: 'In Arbeit', bg: ltColors.brandLight, fg: '#ffffff', icon: 'play' },
  issue_open: { label: 'Problem', bg: ltColors.danger, fg: '#ffffff', icon: 'error' },
  partially_completed: {
    label: 'Teilfertig',
    bg: ltColors.warning,
    fg: '#ffffff',
    icon: 'doneAll',
  },
  completed: { label: 'Fertig', bg: ltColors.success, fg: '#ffffff', icon: 'doneAll' },
  zst_done: { label: 'ZST erledigt', bg: '#00695c', fg: '#ffffff', icon: 'doneAll' },
  cancelled: { label: 'Storniert', bg: '#6b6b6b', fg: '#ffffff', icon: 'cancel' },
};

/** Prioritäts-Chips (PriorityFlag). */
export const priorityMeta: Record<PriorityFlag, ChipMeta> = {
  prio: { label: 'Prio', bg: ltColors.danger, fg: '#ffffff', icon: 'priority' },
  catman_due: { label: 'CatMan fällig', bg: ltColors.accent, fg: '#1a2430', icon: 'schedule' },
  overdue: { label: 'Überfällig', bg: ltColors.danger, fg: '#ffffff', icon: 'flag' },
  manual_teamlead_priority: {
    label: 'TL-Priorität',
    bg: ltColors.accent,
    fg: '#1a2430',
    icon: 'flag',
  },
  same_day_required: { label: 'Heute', bg: ltColors.danger, fg: '#ffffff', icon: 'schedule' },
};

/** Problem-Chips (IssueStatus). */
export const issueStatusMeta: Record<IssueStatus, ChipMeta> = {
  open: { label: 'Offen', bg: ltColors.danger, fg: '#ffffff', icon: 'error' },
  in_review: { label: 'In Prüfung', bg: ltColors.warning, fg: '#ffffff', icon: 'pending' },
  waiting_external: { label: 'Extern', bg: ltColors.warning, fg: '#ffffff', icon: 'pending' },
  resolved: { label: 'Gelöst', bg: ltColors.success, fg: '#ffffff', icon: 'check' },
  rejected: { label: 'Abgelehnt', bg: '#6b6b6b', fg: '#ffffff', icon: 'cancel' },
};

/** Offline/Outbox sync state – a UI-only concern (E.3 Offline confidence). */
export type SyncState = 'synced' | 'pending' | 'syncing' | 'error' | 'offline';

export const syncStateMeta: Record<SyncState, ChipMeta> = {
  synced: { label: 'Synchron', bg: ltColors.success, fg: '#ffffff', icon: 'cloudDone' },
  pending: { label: 'Ausstehend', bg: ltColors.warning, fg: '#ffffff', icon: 'sync' },
  syncing: { label: 'Synchronisiert…', bg: ltColors.info, fg: '#ffffff', icon: 'sync' },
  error: { label: 'Sync-Fehler', bg: ltColors.danger, fg: '#ffffff', icon: 'syncProblem' },
  offline: { label: 'Offline', bg: '#6b6b6b', fg: '#ffffff', icon: 'cloudOff' },
};

/**
 * Back-compat flat map (used by the early scaffold). Prefer the typed `*Meta`
 * records above for new code.
 */
export const statusColor: Record<string, string> = Object.fromEntries(
  Object.entries(caseStatusMeta).map(([k, v]) => [k, v.bg]),
);
