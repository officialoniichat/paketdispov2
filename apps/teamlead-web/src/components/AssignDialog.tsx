/**
 * Beleg-Zuweisung dialog (§8.4 audited override, B1 WE-Nr-Zuweisung). The teamlead
 * types the WE-Belegnummer (vom Papier-Beleg ablesbar); a debounced backend lookup
 * validates it and returns the assignability verdict — the dialog only displays it
 * (Fachlogik single-source). On a valid Beleg it shows Bereich, Teile and the
 * Lieferung context, plus the SOFT Bereich warning (like the automatic planner, a
 * warning, never a block) and the visible target — "Neues Bündel anlegen" for a
 * free employee, "An bestehendes Bündel anhängen" for a belegt one. Der Grund ist
 * optional (B2); the override is audited either way.
 */
import { useEffect, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { LieferungChip } from './LieferungChip.js';
import { lookupBeleg, type BelegLookup } from '../data/belege.js';
import { formatMinutes } from '../lib/format.js';
import type { BoardRow } from '../data/types.js';

const ASSIGN_REASONS = ['Kapazität frei', 'Prio-Beleg', 'Bereich-Aushilfe'] as const;

/** Debounce before the WE-Nr lookup fires (keystroke-quiet window, ms). */
const LOOKUP_DEBOUNCE_MS = 350;

/** Inline validation message per backend verdict (B1). */
function lookupMessage(lookup: BelegLookup): string {
  switch (lookup.reasonCode) {
    case 'not_found':
      return 'Kein Beleg mit dieser WE-Belegnummer gefunden.';
    case 'already_assigned':
      return `Bereits zugeteilt${lookup.assignedEmployeeName ? ` an ${lookup.assignedEmployeeName}` : ''} — erst entziehen, dann neu zuweisen.`;
    case 'wrong_status':
      return `Status „${lookup.status ?? 'unbekannt'}" ist nicht zuweisbar — nur freie Belege im Pool (ready).`;
    case 'blocked':
      return 'Durch Datenqualität blockiert (Intake-Gate) — erst im Topf freigeben.';
    default:
      return '';
  }
}

export interface AssignDialogProps {
  open: boolean;
  row: BoardRow | null;
  /** Confirmed manual assign: validated Beleg + optional §8.4 reason (B2). */
  onConfirm: (caseId: string, reason?: string) => void;
  onClose: () => void;
}

export function AssignDialog({ open, row, onConfirm, onClose }: AssignDialogProps): JSX.Element | null {
  const [weBelegNo, setWeBelegNo] = useState('');
  const [lookupTerm, setLookupTerm] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setWeBelegNo('');
      setLookupTerm('');
      setReason('');
    }
  }, [open]);

  // Debounced lookup: fire only once the input is keystroke-quiet.
  useEffect(() => {
    const t = setTimeout(() => setLookupTerm(weBelegNo.trim()), LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [weBelegNo]);

  const lookup = useQuery<BelegLookup, Error>({
    queryKey: ['case-lookup', lookupTerm],
    queryFn: () => lookupBeleg(lookupTerm),
    enabled: open && lookupTerm.length > 0,
  });

  if (!row) return null;

  const result = lookupTerm.length > 0 ? (lookup.data ?? null) : null;
  const assignable = result?.assignable === true && result.caseId !== null;
  const pendingLookup = lookupTerm.length > 0 && (lookup.isFetching || weBelegNo.trim() !== lookupTerm);

  const isFree = row.bundleId == null;
  const freeMinutes = Math.max(0, row.netCapacityMinutes - row.assignedMinutes);
  // Soft Bereich warning: only when we know the Beleg's Bereich and the employee is
  // not staffed for it. Like the automatic planner — a warning, never a hard block.
  const bereichMismatch =
    result != null &&
    result.bereich != null &&
    row.bereiche.length > 0 &&
    !row.bereiche.includes(result.bereich);

  const confirmLabel = isFree ? 'Zuweisen & Bündel anlegen' : 'Zuweisen';

  function handleConfirm(): void {
    if (!result?.assignable || result.caseId === null) return;
    const trimmed = reason.trim();
    onConfirm(result.caseId, trimmed.length > 0 ? trimmed : undefined);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Beleg zuweisen — {row.displayName}</DialogTitle>
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

          <TextField
            autoFocus
            fullWidth
            label="WE-Belegnummer"
            placeholder="z. B. WE-2026-01234"
            value={weBelegNo}
            onChange={(e) => setWeBelegNo(e.target.value)}
            helperText={pendingLookup ? 'Beleg wird geprüft …' : 'Nummer vom Beleg eingeben — wird live geprüft.'}
          />

          {lookup.isError && (
            <Alert severity="error" variant="outlined">
              Prüfung fehlgeschlagen: {lookup.error.message}
            </Alert>
          )}

          {!pendingLookup && result && !result.assignable && (
            <Alert severity={result.found ? 'warning' : 'info'} variant="outlined">
              {lookupMessage(result)}
            </Alert>
          )}

          {!pendingLookup && assignable && result && (
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography sx={{ fontWeight: 700 }}>{result.weBelegNo}</Typography>
                {result.bereich && <Chip size="small" variant="outlined" label={result.bereich} />}
                <Chip size="small" variant="outlined" label={`${result.teile ?? 0} Teile`} />
                <LieferungChip group={result.deliveryGroup} />
              </Stack>
            </Paper>
          )}

          {!pendingLookup && bereichMismatch && result?.bereich && (
            <Alert severity="warning" variant="outlined">
              Bereich-Hinweis: Beleg ist <strong>{result.bereich}</strong>, {row.displayName} ist
              für <strong>{row.bereiche.join(', ')}</strong> eingeteilt. Zuweisung bleibt möglich
              (weiche Warnung wie in der Automatik) — bitte bewusst entscheiden.
            </Alert>
          )}

          {assignable && (
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
                  ? `${row.displayName} hat heute noch kein Bündel. Mit dieser Zuweisung wird das Bündel erstellt und ${result?.weBelegNo ?? ''} als erster Beleg gesetzt.`
                  : `${result?.weBelegNo ?? ''} wird ans Ende des Bündels (${row.bundleSize ?? 0} Belege) angehängt; die Reihenfolge ist danach editierbar.`}
              </Typography>
            </Paper>
          )}

          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Grund (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Wird mit Mitarbeitenden und Beleg auditiert (§8.4)."
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
        <Button variant="contained" disabled={!assignable || pendingLookup} onClick={handleConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
