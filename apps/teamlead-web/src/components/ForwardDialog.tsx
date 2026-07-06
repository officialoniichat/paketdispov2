/**
 * C5 „Weiterleiten an …" — shared forwarding dialog, driven from the
 * {@link CaseActionMenu} `forward` action (Belege list, Belege detail, Digitale
 * Ablagen). Forwarding is status-neutral (no §7.1 transition) and needs a
 * recipient pick, not a reason dialog; "Zurückholen" is the paired instant
 * action in the registry (one click, no dialog) so it is not handled here.
 */
import { type JSX } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { FORWARD_RECIPIENTS, type ForwardRecipient } from '@paket/domain-types';

/** German display labels for the fixed recipient catalog (C5). */
export const FORWARD_RECIPIENT_LABEL: Record<ForwardRecipient, string> = {
  retourenabteilung: 'Retourenabteilung',
  lieferscheinbucher: 'Lieferscheinbucher',
};

/** Best-effort label for a recipient value coming over the wire as string. */
export function forwardRecipientLabel(recipient: string): string {
  return FORWARD_RECIPIENT_LABEL[recipient as ForwardRecipient] ?? recipient;
}

export interface ForwardDialogProps {
  open: boolean;
  weBelegNo: string;
  onConfirm: (recipient: ForwardRecipient) => void;
  onClose: () => void;
}

export function ForwardDialog({
  open,
  weBelegNo,
  onConfirm,
  onClose,
}: ForwardDialogProps): JSX.Element {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Weiterleiten an… · Beleg {weBelegNo}</DialogTitle>
      <DialogContent>
        <List dense disablePadding>
          {FORWARD_RECIPIENTS.map((recipient) => (
            <ListItemButton
              key={recipient}
              onClick={() => {
                onConfirm(recipient);
                onClose();
              }}
            >
              <ListItemText primary={FORWARD_RECIPIENT_LABEL[recipient]} />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
      </DialogActions>
    </Dialog>
  );
}
