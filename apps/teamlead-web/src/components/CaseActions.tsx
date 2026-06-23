/**
 * Reusable case-action bar (§8.4). Renders the teamlead actions allowed for a
 * case's §7.1 status straight from the single-source {@link caseActions} registry,
 * so Belege list, Belege detail and Digitale Ablagen all expose the exact same
 * state-machine-driven buttons. Primary actions render inline; the rest collapse
 * into an overflow menu. Every action routes through the mandatory-reason
 * {@link ReasonDialog} before it runs.
 */
import { useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import {
  caseActions,
  type ActionTone,
  type CaseActionCtx,
  type CaseActionDescriptor,
  type CaseLike,
} from '../actions/caseActions.js';
import { ReasonDialog } from './ReasonDialog.js';

type Variant = 'row' | 'card' | 'header';

export interface CaseActionsProps {
  /** §7.1 status + §8.2 priority flags decide which actions render. */
  case: CaseLike;
  ctx: CaseActionCtx;
  weBelegNo: string;
  variant?: Variant;
  /**
   * Handler for custom actions that open their own dialog instead of the generic
   * mandatory-reason dialog (currently only `split` → SplitDialog). When absent,
   * custom actions are not rendered, so surfaces without a split dialog stay clean.
   */
  onSplit?: (caseId: string) => void;
}

/** Map a descriptor tone onto an MUI button/menu color. */
function toneColor(tone: ActionTone): 'inherit' | 'primary' | 'warning' | 'error' | 'success' {
  return tone === 'default' ? 'inherit' : tone;
}

export function CaseActions({
  case: caseLike,
  ctx,
  weBelegNo,
  variant = 'row',
  onSplit,
}: CaseActionsProps): JSX.Element | null {
  const [pending, setPending] = useState<CaseActionDescriptor | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // Custom actions (split) only render where a handler is wired; otherwise hide them.
  const actions = caseActions(caseLike).filter((a) => (a.custom ? onSplit !== undefined : true));
  if (actions.length === 0) return null;

  /** Custom actions open their own dialog; everything else goes through ReasonDialog. */
  const trigger = (a: CaseActionDescriptor): void => {
    if (a.custom === 'split') onSplit?.(ctx.caseId);
    else setPending(a);
  };

  const primary = actions.filter((a) => a.primary);
  const overflow = actions.filter((a) => !a.primary);

  const buttonSize = variant === 'header' ? 'medium' : 'small';
  const buttonVariant = variant === 'header' ? 'outlined' : 'text';

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
        {primary.map((a) => (
          <Button
            key={a.id}
            size={buttonSize}
            variant={buttonVariant}
            color={toneColor(a.tone)}
            onClick={() => trigger(a)}
          >
            {a.label}
          </Button>
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
        {overflow.map((a) => (
          <MenuItem
            key={a.id}
            onClick={() => {
              setMenuAnchor(null);
              trigger(a);
            }}
          >
            {a.label}
          </MenuItem>
        ))}
      </Menu>

      <ReasonDialog
        open={pending !== null}
        title={pending ? `${pending.label} · Beleg ${weBelegNo}` : ''}
        confirmLabel={pending?.label}
        suggestions={pending?.reasonSuggestions}
        onConfirm={(reason) => pending?.run(ctx, reason)}
        onClose={() => setPending(null)}
      />
    </>
  );
}
