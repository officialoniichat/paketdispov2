/**
 * A7 „Besondere Aufmerksamkeit" — shared attention-flag dialog, driven from the
 * {@link CaseActionMenu} `attention` action (Belege list, Belege detail,
 * Digitale Ablagen). Flagging takes an optional note (Bucherinnen-Inlet mock);
 * "Aufmerksamkeit entfernen" is the paired instant action in the registry (one
 * click, no dialog) so it is not handled here.
 */
import { useEffect, useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

export interface AttentionDialogProps {
  open: boolean;
  weBelegNo: string;
  onConfirm: (note?: string) => void;
  onClose: () => void;
}

export function AttentionDialog({
  open,
  weBelegNo,
  onConfirm,
  onClose,
}: AttentionDialogProps): JSX.Element {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  function handleConfirm(): void {
    const trimmed = note.trim();
    onConfirm(trimmed.length > 0 ? trimmed : undefined);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Besondere Aufmerksamkeit · Beleg {weBelegNo}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label="Notiz (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ mt: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleConfirm();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" color="warning" onClick={handleConfirm}>
          Markieren
        </Button>
      </DialogActions>
    </Dialog>
  );
}
