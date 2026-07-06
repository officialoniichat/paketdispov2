/**
 * C5 „Weiterleiten an …" — shared forwarding control for Ablage cards and the
 * Belegdetail header. Not part of the {@link caseActions} registry: forwarding is
 * status-neutral (no §7.1 transition) and needs a recipient pick, not a reason
 * dialog. A forwarded Beleg shows „Zurückholen" instead; both invalidate the
 * cockpit + Beleg query families so every surface refreshes.
 */
import { useState, type JSX, type MouseEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ForwardIcon from '@mui/icons-material/Forward';
import ReplayIcon from '@mui/icons-material/Replay';
import { FORWARD_RECIPIENTS, type ForwardRecipient } from '@paket/domain-types';
import { forwardCase, unforwardCase } from '../data/belege.js';

/** German display labels for the fixed recipient catalog (C5). */
export const FORWARD_RECIPIENT_LABEL: Record<ForwardRecipient, string> = {
  retourenabteilung: 'Retourenabteilung',
  lieferscheinbucher: 'Lieferscheinbucher',
};

/** Best-effort label for a recipient value coming over the wire as string. */
export function forwardRecipientLabel(recipient: string): string {
  return FORWARD_RECIPIENT_LABEL[recipient as ForwardRecipient] ?? recipient;
}

interface ForwardMenuButtonProps {
  caseId: string;
  /** Current recipient; null renders „Weiterleiten an …", non-null „Zurückholen". */
  forwardedTo: string | null;
}

export function ForwardMenuButton({ caseId, forwardedTo }: ForwardMenuButtonProps): JSX.Element {
  const queryClient = useQueryClient();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
    void queryClient.invalidateQueries({ queryKey: ['beleg'] });
    void queryClient.invalidateQueries({ queryKey: ['belege'] });
  };
  const forwardMutation = useMutation<void, Error, ForwardRecipient>({
    mutationFn: (recipient) => forwardCase(caseId, recipient),
    onSettled: invalidate,
  });
  const unforwardMutation = useMutation<void, Error, void>({
    mutationFn: () => unforwardCase(caseId),
    onSettled: invalidate,
  });

  if (forwardedTo !== null) {
    return (
      <Button
        size="small"
        startIcon={<ReplayIcon />}
        disabled={unforwardMutation.isPending}
        onClick={() => unforwardMutation.mutate()}
      >
        Zurückholen
      </Button>
    );
  }

  return (
    <>
      <Button
        size="small"
        startIcon={<ForwardIcon />}
        disabled={forwardMutation.isPending}
        onClick={(e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
      >
        Weiterleiten an…
      </Button>
      <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={() => setAnchorEl(null)}>
        {FORWARD_RECIPIENTS.map((recipient) => (
          <MenuItem
            key={recipient}
            onClick={() => {
              setAnchorEl(null);
              forwardMutation.mutate(recipient);
            }}
          >
            {FORWARD_RECIPIENT_LABEL[recipient]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
