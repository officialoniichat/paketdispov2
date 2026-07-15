/**
 * Reusable, compact case-action control (§8.4). Renders every teamlead action
 * allowed for a case's §7.1 status + assign/forward/attention flags straight
 * from the single-source {@link getAvailableActions} registry, so Belege
 * list, Belege detail and Digitale Ablagen all expose the exact same
 * state-machine-driven actions — nothing is filtered per-surface.
 *
 * Space discipline: `density="compact"` (list rows, board cards) shows AT
 * MOST one action as a visible control — everything else, however many
 * "primary" actions the registry offers, collapses into the kebab.
 * `density="detail"` allows up to two. This is deliberate: the old surfaces
 * each rendered assign/forward/attention as their own separate full-size
 * Button next to this component, which is exactly what made the row/card
 * controls sprawl. Folding them into the same primary+kebab budget is what
 * fixes the space problem, not just the availability-consistency problem.
 *
 * Non-custom actions run through the mandatory-reason {@link ReasonDialog}.
 * `custom` actions (split/assign/forward/attention) delegate to the matching
 * `onSplit`/`onAssign`/`onForward`/`onAttention` handler the surface supplies
 * and are hidden if that handler is absent. `instant` actions (Zurückholen,
 * Aufmerksamkeit entfernen) run immediately with no dialog at all, mirroring
 * the one-click UX of the action they reverse.
 */
import { useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import ApproveIcon from '@mui/icons-material/CheckCircleOutline';
import CancelActionIcon from '@mui/icons-material/DoDisturbAlt';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FlagIcon from '@mui/icons-material/Flag';
import ForwardIcon from '@mui/icons-material/Forward';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import {
  getAvailableActions,
  type ActionTone,
  type CaseActionCtx,
  type CaseActionDescriptor,
  type CaseActionId,
  type CaseLike,
} from '../actions/caseActions.js';
import { ReasonDialog } from './ReasonDialog.js';

type Density = 'compact' | 'detail';

/** How many actions render as visible buttons before the rest collapse into the kebab. */
const PRIMARY_BUDGET: Record<Density, number> = { compact: 1, detail: 2 };

const ACTION_ICON: Record<CaseActionId, JSX.Element> = {
  approve: <ApproveIcon fontSize="small" />,
  resolve_problems: <ApproveIcon fontSize="small" />,
  assign: <PersonAddAlt1Icon fontSize="small" />,
  park: <PauseCircleOutlineIcon fontSize="small" />,
  unpark: <PlayCircleOutlineIcon fontSize="small" />,
  split: <CallSplitIcon fontSize="small" />,
  prioritise: <ArrowUpwardIcon fontSize="small" />,
  deprioritise: <ArrowDownwardIcon fontSize="small" />,
  forward: <ForwardIcon fontSize="small" />,
  unforward: <ReplayIcon fontSize="small" />,
  attention: <FlagIcon fontSize="small" />,
  unattention: <FlagIcon fontSize="small" />,
  cancel: <CancelActionIcon fontSize="small" />,
};

export interface CaseActionMenuProps {
  /** §7.1 status + assign/forward/attention flags decide which actions render. */
  case: CaseLike;
  ctx: CaseActionCtx;
  weBelegNo: string;
  density?: Density;
  /** Custom actions only render when their handler is wired for this surface. */
  onSplit?: (caseId: string) => void;
  onAssign?: (caseId: string) => void;
  onForward?: (caseId: string) => void;
  onAttention?: (caseId: string) => void;
}

/** Map a descriptor tone onto an MUI button/menu color. */
function toneColor(tone: ActionTone): 'inherit' | 'primary' | 'warning' | 'error' | 'success' {
  return tone === 'default' ? 'inherit' : tone;
}

export function CaseActionMenu({
  case: caseLike,
  ctx,
  weBelegNo,
  density = 'compact',
  onSplit,
  onAssign,
  onForward,
  onAttention,
}: CaseActionMenuProps): JSX.Element | null {
  const [pending, setPending] = useState<CaseActionDescriptor | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const customHandler: Record<NonNullable<CaseActionDescriptor['custom']>, unknown> = {
    split: onSplit,
    assign: onAssign,
    forward: onForward,
    attention: onAttention,
  };

  // Custom actions only render where a handler is wired; hide them otherwise.
  const actions = getAvailableActions(caseLike).filter((a) =>
    a.custom ? customHandler[a.custom] !== undefined : true,
  );
  if (actions.length === 0) return null;

  const budget = PRIMARY_BUDGET[density];
  const primary = actions.filter((a) => a.primary).slice(0, budget);
  const primaryIds = new Set(primary.map((a) => a.id));
  const overflow = actions.filter((a) => !primaryIds.has(a.id));
  // Destructive actions sort last and get a divider, whatever registry order gave them.
  const destructive = overflow.filter((a) => a.tone === 'error');
  const rest = overflow.filter((a) => a.tone !== 'error');

  function trigger(a: CaseActionDescriptor): void {
    setMenuAnchor(null);
    if (a.custom) {
      (customHandler[a.custom] as ((caseId: string) => void) | undefined)?.(ctx.caseId);
      return;
    }
    if (a.instant) {
      a.run(ctx, '');
      return;
    }
    setPending(a);
  }

  const buttonSize = density === 'detail' ? 'medium' : 'small';
  const buttonVariant = density === 'detail' ? 'outlined' : 'text';

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
        {primary.map((a) => (
          <Tooltip key={a.id} title={a.label}>
            <Button
              size={buttonSize}
              variant={buttonVariant}
              color={toneColor(a.tone)}
              startIcon={ACTION_ICON[a.id]}
              onClick={() => trigger(a)}
              sx={buttonVariant === 'text' ? { fontWeight: 700 } : undefined}
            >
              {a.label}
            </Button>
          </Tooltip>
        ))}
        {overflow.length > 0 && (
          <Tooltip title="Weitere Aktionen">
            <IconButton
              size="small"
              aria-label="Weitere Aktionen"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={() => setMenuAnchor(null)}>
        {rest.map((a) => (
          <MenuItem key={a.id} onClick={() => trigger(a)}>
            <ListItemIcon sx={{ color: a.tone !== 'default' ? `${toneColor(a.tone)}.main` : undefined }}>
              {ACTION_ICON[a.id]}
            </ListItemIcon>
            <ListItemText>{a.label}</ListItemText>
          </MenuItem>
        ))}
        {destructive.length > 0 && rest.length > 0 && <Divider />}
        {destructive.map((a) => (
          <MenuItem key={a.id} onClick={() => trigger(a)} sx={{ color: 'error.main' }}>
            <ListItemIcon sx={{ color: 'error.main' }}>{ACTION_ICON[a.id]}</ListItemIcon>
            <ListItemText>{a.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      <ReasonDialog
        open={pending !== null}
        title={pending ? `${pending.label} · Beleg ${weBelegNo}` : ''}
        confirmLabel={pending?.label}
        suggestions={pending?.reasonSuggestions}
        optional={pending?.optionalReason === true}
        onConfirm={(reason) => pending?.run(ctx, reason)}
        onClose={() => setPending(null)}
      />
    </>
  );
}
