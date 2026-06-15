/**
 * Reason-gated skip dialog. The confirm button stays disabled until a reason is
 * entered, enforcing "Skip nur mit Grund → Event" at the UI boundary.
 */
import { useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

export interface SkipDialogProps {
  open: boolean;
  title?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function SkipDialog({
  open,
  title = 'Schritt überspringen',
  onCancel,
  onConfirm,
}: SkipDialogProps): JSX.Element {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  const confirm = (): void => {
    if (trimmed.length === 0) return;
    onConfirm(trimmed);
    setReason('');
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Grund (Pflicht)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Abbrechen</Button>
        <Button variant="contained" onClick={confirm} disabled={trimmed.length === 0}>
          Überspringen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
