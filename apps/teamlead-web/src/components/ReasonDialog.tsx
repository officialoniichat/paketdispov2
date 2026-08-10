/**
 * Mandatory-reason confirmation dialog (§8.4 / Anhang E.4 "Override mit Grund").
 *
 * No teamlead override – Vorziehen, Parken, Entziehen, Neuverteilen … – can be
 * confirmed without a reason: the submit button stays disabled until the reason
 * passes `isValidReason`, so the audited event always carries a justification.
 */
import { useEffect, useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { MIN_REASON_LENGTH, isValidReason } from '../data/audit.js';

export interface ReasonDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Quick-pick reasons to speed up common overrides. */
  suggestions?: string[];
  /**
   * true = der Grund ist OPTIONAL (Kundenfeedback 07.08.2026): „Bestätigen" ist
   * immer aktiv, ein leeres Feld kommt als '' zurück und der Aufrufer lässt den
   * Grund dann einfach weg. Das Audit-Event wird trotzdem geschrieben, nur ohne
   * Text. Default bleibt der Pflicht-Grund aus §8.4.
   */
  optional?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel = 'Bestätigen',
  suggestions = [],
  optional = false,
  onConfirm,
  onClose,
}: ReasonDialogProps): JSX.Element {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const valid = optional || isValidReason(reason);

  function handleConfirm(): void {
    if (!valid) return;
    onConfirm(reason.trim());
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {description && <DialogContentText sx={{ mb: 2 }}>{description}</DialogContentText>}
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          required={!optional}
          label={optional ? 'Grund (optional)' : 'Grund (Pflichtfeld)'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={!optional && reason.length > 0 && !valid}
          helperText={
            !optional && reason.length > 0 && !valid
              ? `Bitte mindestens ${MIN_REASON_LENGTH} Zeichen angeben.`
              : optional
                ? 'Kann leer bleiben — der Eingriff wird so oder so auditiert (§8.4).'
                : 'Wird mit vorheriger und neuer Zuordnung auditiert (§8.4).'
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleConfirm();
          }}
        />
        {suggestions.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.5 }}>
            {suggestions.map((s) => (
              <Button key={s} size="small" variant="outlined" onClick={() => setReason(s)}>
                {s}
              </Button>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" disabled={!valid} onClick={handleConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
