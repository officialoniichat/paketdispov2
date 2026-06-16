/**
 * Status chips (Anhang E.6): Belegstatus, Priorität, CatMan, Problem, Sync.
 *
 * Hard rule (E.6 / WCAG 1.4.1): colour is ALWAYS paired with an icon and a text
 * label. There is no colour-only chip in this library.
 */
import type { JSX } from 'react';
import Chip from '@mui/material/Chip';
import type { SvgIconComponent } from '@mui/icons-material';
import Inbox from '@mui/icons-material/MoveToInbox';
import CheckCircle from '@mui/icons-material/CheckCircle';
import DoneAll from '@mui/icons-material/DoneAll';
import PauseCircle from '@mui/icons-material/PauseCircle';
import PlayCircle from '@mui/icons-material/PlayCircle';
import Warning from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import Flag from '@mui/icons-material/Flag';
import PriorityHigh from '@mui/icons-material/PriorityHigh';
import Schedule from '@mui/icons-material/Schedule';
import Sync from '@mui/icons-material/Sync';
import SyncProblem from '@mui/icons-material/SyncProblem';
import CloudOff from '@mui/icons-material/CloudOff';
import CloudDone from '@mui/icons-material/CloudDone';
import Pending from '@mui/icons-material/Pending';
import Cancel from '@mui/icons-material/Cancel';
import Build from '@mui/icons-material/Build';
import Inventory from '@mui/icons-material/Inventory2';
import type { CaseStatus, IssueStatus, PriorityFlag } from '@paket/domain-types';
import {
  caseStatusMeta,
  issueStatusMeta,
  priorityMeta,
  syncStateMeta,
  type ChipIconKey,
  type ChipMeta,
  type SyncState,
} from '../theme/tokens.js';

const chipIcons: Record<ChipIconKey, SvgIconComponent> = {
  inbox: Inbox,
  check: CheckCircle,
  doneAll: DoneAll,
  pause: PauseCircle,
  play: PlayCircle,
  warning: Warning,
  error: ErrorIcon,
  flag: Flag,
  priority: PriorityHigh,
  schedule: Schedule,
  sync: Sync,
  syncProblem: SyncProblem,
  cloudOff: CloudOff,
  cloudDone: CloudDone,
  pending: Pending,
  cancel: Cancel,
  build: Build,
  inventory: Inventory,
};

export type ChipSize = 'small' | 'medium';

interface BaseChipProps {
  /** May be undefined at runtime if the data carries an out-of-enum value. */
  meta: ChipMeta | undefined;
  /** Override the default German label from the meta table. */
  label?: string;
  size?: ChipSize;
  title?: string;
}

/** Neutral fallback so an unknown/stale status never crashes the whole view. */
const FALLBACK_META: ChipMeta = { label: '–', bg: '#6b6b6b', fg: '#ffffff', icon: 'inbox' };

/** Internal: render a meta descriptor as colour + icon + text. */
function BaseChip({ meta, label, size = 'medium', title }: BaseChipProps): JSX.Element {
  const safe = meta ?? FALLBACK_META;
  const Icon = chipIcons[safe.icon] ?? chipIcons.inbox;
  const text = label ?? safe.label;
  return (
    <Chip
      size={size}
      icon={<Icon fontSize="small" style={{ color: safe.fg }} aria-hidden />}
      label={text}
      title={title ?? text}
      sx={{
        backgroundColor: safe.bg,
        color: safe.fg,
        '& .MuiChip-icon': { color: safe.fg },
        fontWeight: 700,
        height: size === 'medium' ? 32 : undefined,
      }}
    />
  );
}

export interface StatusChipProps {
  status: CaseStatus;
  label?: string;
  size?: ChipSize;
}

/** Belegstatus chip (back-compatible with the foundation scaffold). */
export function StatusChip({ status, label, size }: StatusChipProps): JSX.Element {
  return <BaseChip meta={caseStatusMeta[status]} label={label} size={size} />;
}

/** Alias that reads better alongside the other domain chips. */
export const CaseStatusChip = StatusChip;

export interface PriorityChipProps {
  flag: PriorityFlag;
  label?: string;
  size?: ChipSize;
}

export function PriorityChip({ flag, label, size }: PriorityChipProps): JSX.Element {
  return <BaseChip meta={priorityMeta[flag]} label={label} size={size} />;
}

export interface CatManChipProps {
  /** Optional due-date label (e.g. "fällig 17.06."). */
  dueLabel?: string;
  size?: ChipSize;
}

/** CatMan chip – a derived priority signal with its own visual identity. */
export function CatManChip({ dueLabel, size }: CatManChipProps): JSX.Element {
  const base = priorityMeta.catman_due;
  return (
    <BaseChip
      meta={base}
      label={dueLabel ? `CatMan · ${dueLabel}` : 'CatMan'}
      size={size}
      title="Category-Management-Termin"
    />
  );
}

export interface ProblemChipProps {
  status: IssueStatus;
  /** Number of open issues, shown in the label when > 1. */
  count?: number;
  label?: string;
  size?: ChipSize;
}

export function ProblemChip({ status, count, label, size }: ProblemChipProps): JSX.Element {
  const meta = issueStatusMeta[status];
  const text = label ?? (count && count > 1 ? `${meta.label} (${count})` : meta.label);
  return <BaseChip meta={meta} label={text} size={size} />;
}

export interface SyncChipProps {
  state: SyncState;
  label?: string;
  size?: ChipSize;
}

export function SyncChip({ state, label, size }: SyncChipProps): JSX.Element {
  return <BaseChip meta={syncStateMeta[state]} label={label} size={size} />;
}
