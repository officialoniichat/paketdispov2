/**
 * Inline-Dialog zur Problem-Erfassung pro Position/Größe (Kundenfeedback
 * 14.07.2026, Punkt 5+6). Die Problemarten kommen dynamisch aus dem
 * admin-verwalteten Katalog (`useProblemReasons`); das Problem wird NICHT sofort
 * gesendet, sondern lokal gesammelt und erst beim Teilabschluss übertragen.
 */
import { useMemo, useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useProblemReasons } from '../data/useProblemReasons.js';
import type { PositionView, RecordedProblem } from '../domain/types.js';

/** Client-seitige Id für ein lokal gesammeltes Problem (kein Backend-Wert). */
function localId(): string {
  return `p-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

interface ProblemDialogProps {
  open: boolean;
  position: PositionView | null;
  onClose: () => void;
  onSave: (problem: RecordedProblem) => void;
}

export function ProblemDialog({ open, position, onClose, onSave }: ProblemDialogProps): JSX.Element {
  const reasonsQuery = useProblemReasons();
  const [reasonId, setReasonId] = useState('');
  const [skuLineId, setSkuLineId] = useState('');
  const [note, setNote] = useState('');

  const reasons = useMemo(() => reasonsQuery.data ?? [], [reasonsQuery.data]);

  const reset = (): void => {
    setReasonId('');
    setSkuLineId('');
    setNote('');
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const handleSave = (): void => {
    if (!position || !reasonId) return;
    const reason = reasons.find((r) => r.id === reasonId);
    if (!reason) return;
    onSave({
      id: localId(),
      positionId: position.id,
      skuLineId: skuLineId || undefined,
      reasonId: reason.id,
      reasonLabel: reason.label,
      note: note.trim() || undefined,
    });
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth>
      <DialogTitle>Problem melden{position ? ` – Position ${position.positionNo}` : ''}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Das Problem wird beim Teilabschluss gesammelt an die Teamleitung gesendet.
          </Typography>
          {reasonsQuery.isError ? (
            <Alert severity="error">Problemarten konnten nicht geladen werden.</Alert>
          ) : null}
          <TextField
            select
            required
            label="Problemart"
            value={reasonId}
            onChange={(e) => setReasonId(e.target.value)}
            disabled={reasonsQuery.isLoading}
            helperText={reasonsQuery.isLoading ? 'Problemarten werden geladen …' : undefined}
          >
            {reasons.map((r) => (
              <MenuItem key={r.id} value={r.id}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          {position && position.skuLines.length > 0 ? (
            <TextField
              select
              label="Größe (optional)"
              value={skuLineId}
              onChange={(e) => setSkuLineId(e.target.value)}
            >
              <MenuItem value="">Ganze Position</MenuItem>
              {position.skuLines.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.size} · {s.ean}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField
            label="Notiz (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Abbrechen</Button>
        <Button variant="contained" onClick={handleSave} disabled={!reasonId}>
          Problem erfassen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
