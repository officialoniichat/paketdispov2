/**
 * Beleg-Zuweisung dialog (§8.4 audited override). The same dialog serves free and
 * belegt employees: it shows the chosen employee + free capacity, a SOFT Bereich
 * warning (Beleg-Bereich vs. the employee's Bereiche — like the automatic planner, a
 * warning, never a block), and the visible target — "Neues Bündel anlegen" for a free
 * employee, "An bestehendes Bündel anhängen" for a belegt one. A reason is mandatory.
 * Confirm routes to assignToEmployee (free) or addToBundle (belegt) in the board.
 */
import { useEffect, useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { MIN_REASON_LENGTH, isValidReason } from '../data/audit.js';
import { formatMinutes } from '../lib/format.js';
import type { BoardRow, PoolCase } from '../data/types.js';

const ASSIGN_REASONS = ['Kapazität frei', 'Prio-Beleg', 'Bereich-Aushilfe'] as const;

export interface AssignDialogProps {
  open: boolean;
  row: BoardRow | null;
  poolCase: PoolCase | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export function AssignDialog({
  open,
  row,
  poolCase,
  onConfirm,
  onClose,
}: AssignDialogProps): JSX.Element | null {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!row || !poolCase) return null;

  const isFree = row.bundleId == null;
  const freeMinutes = Math.max(0, row.netCapacityMinutes - row.assignedMinutes);
  // Soft Bereich warning: only when we know the Beleg's Bereich and the employee is
  // not staffed for it. Like the automatic planner — a warning, never a hard block.
  const bereichMismatch =
    poolCase.bereich != null &&
    row.bereiche.length > 0 &&
    !row.bereiche.includes(poolCase.bereich);

  const valid = isValidReason(reason);
  const confirmLabel = isFree ? 'Zuweisen & Bündel anlegen' : 'Zuweisen';

  function handleConfirm(): void {
    if (!valid) return;
    onConfirm(reason.trim());
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Beleg zuweisen — {poolCase.weBelegNo}
        {poolCase.bereich ? ` · ${poolCase.bereich}` : ''} · {formatMinutes(poolCase.estimatedMinutes)}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography sx={{ fontWeight: 700 }}>{row.displayName}</Typography>
              {row.bereiche.map((b) => (
                <Chip key={b} size="small" variant="outlined" label={b} />
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {isFree ? 'frei · ' : ''}
                {formatMinutes(freeMinutes)} Kapazität frei
              </Typography>
            </Stack>
          </Paper>

          {bereichMismatch && (
            <Alert severity="warning" variant="outlined">
              Bereich-Hinweis: Beleg ist <strong>{poolCase.bereich}</strong>, {row.displayName} ist
              für <strong>{row.bereiche.join(', ')}</strong> eingeteilt. Zuweisung bleibt möglich
              (weiche Warnung wie in der Automatik) — bitte bewusst entscheiden.
            </Alert>
          )}

          <Paper
            variant="outlined"
            sx={{ p: 1.5, borderColor: 'warning.main', bgcolor: 'action.hover' }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              {isFree
                ? `Neues Bündel für ${row.displayName} anlegen`
                : 'An bestehendes Bündel anhängen'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isFree
                ? `${row.displayName} hat heute noch kein Bündel. Mit dieser Zuweisung wird das Bündel erstellt und ${poolCase.weBelegNo} als erster Beleg gesetzt.`
                : `${poolCase.weBelegNo} wird ans Ende des Bündels (${row.bundleSize ?? 0} Belege) angehängt; die Reihenfolge ist danach editierbar.`}
            </Typography>
          </Paper>

          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            required
            label="Grund (Pflichtfeld)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reason.length > 0 && !valid}
            helperText={
              reason.length > 0 && !valid
                ? `Bitte mindestens ${MIN_REASON_LENGTH} Zeichen angeben.`
                : 'Wird mit Mitarbeitenden und Beleg auditiert (§8.4).'
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleConfirm();
            }}
          />
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {ASSIGN_REASONS.map((s) => (
              <Button key={s} size="small" variant="outlined" onClick={() => setReason(s)}>
                {s}
              </Button>
            ))}
          </Stack>
        </Stack>
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
