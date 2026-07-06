/**
 * Beleg-Zuweisung dialog (§8.4 audited override, B1 WE-Nr-Zuweisung, A1/A2 Bündel
 * anlegen). The teamlead types a WE-Belegnummer; a debounced backend lookup
 * validates it and returns the assignability verdict — the dialog only displays it
 * (Fachlogik single-source). A valid Beleg is added to a selection ("Bündel-Warenkorb")
 * via "Hinzufügen"; the list shows every selected Beleg with Bereich/Teile, a running
 * Teile/Minuten total, and a capacity-feasibility hint against the employee's free
 * minutes. ONE confirm sends every selected Beleg to the backend in a single atomic
 * call — appended to the existing Bündel, or creating it if the employee is free
 * (find-or-create, same as before; only now for N Belege at once). Der Grund ist
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
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
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
  /** Confirmed manual assign: validated Belege (A1 Bündel anlegen) + optional §8.4 reason (B2). */
  onConfirm: (caseIds: string[], reason?: string) => void;
  onClose: () => void;
}

export function AssignDialog({ open, row, onConfirm, onClose }: AssignDialogProps): JSX.Element | null {
  const [weBelegNo, setWeBelegNo] = useState('');
  const [lookupTerm, setLookupTerm] = useState('');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<BelegLookup[]>([]);

  useEffect(() => {
    if (open) {
      setWeBelegNo('');
      setLookupTerm('');
      setReason('');
      setSelected([]);
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
  const alreadySelected = result?.caseId != null && selected.some((s) => s.caseId === result.caseId);
  const assignable = result?.assignable === true && result.caseId !== null && !alreadySelected;
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

  const totalTeile = selected.reduce((sum, s) => sum + (s.teile ?? 0), 0);
  const totalMinutes = selected.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);
  const overCapacity = selected.length > 0 && totalMinutes > freeMinutes;

  const confirmLabel = isFree
    ? `Bündel anlegen & zuweisen (${selected.length})`
    : `Zum Bündel hinzufügen (${selected.length})`;

  function addToSelection(): void {
    if (!result?.assignable || result.caseId === null || alreadySelected) return;
    setSelected((prev) => [...prev, result]);
    setWeBelegNo('');
    setLookupTerm('');
  }

  function removeFromSelection(caseId: string): void {
    setSelected((prev) => prev.filter((s) => s.caseId !== caseId));
  }

  function handleConfirm(): void {
    if (selected.length === 0) return;
    const caseIds = selected.map((s) => s.caseId).filter((id): id is string => id !== null);
    const trimmed = reason.trim();
    onConfirm(caseIds, trimmed.length > 0 ? trimmed : undefined);
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
            helperText={
              pendingLookup
                ? 'Beleg wird geprüft …'
                : 'Nummer vom Beleg eingeben — wird live geprüft. Mehrere Belege für ein Bündel: nacheinander hinzufügen.'
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && assignable) {
                e.preventDefault();
                addToSelection();
              }
            }}
          />

          {lookup.isError && (
            <Alert severity="error" variant="outlined">
              Prüfung fehlgeschlagen: {lookup.error.message}
            </Alert>
          )}

          {!pendingLookup && result && alreadySelected && (
            <Alert severity="info" variant="outlined">
              {result.weBelegNo} ist bereits in der Auswahl.
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
                <Button size="small" variant="contained" sx={{ ml: 'auto' }} onClick={addToSelection}>
                  Zur Auswahl hinzufügen
                </Button>
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

          {selected.length > 0 && (
            <Paper variant="outlined" sx={{ p: 0 }}>
              <List dense disablePadding>
                {selected.map((s, i) => (
                  <ListItem
                    key={s.caseId}
                    divider={i < selected.length - 1}
                    secondaryAction={
                      <IconButton
                        size="small"
                        aria-label={`${s.weBelegNo} aus Auswahl entfernen`}
                        onClick={() => removeFromSelection(s.caseId!)}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography sx={{ fontWeight: 600 }}>
                            {i + 1}. {s.weBelegNo}
                          </Typography>
                          {s.bereich && <Chip size="small" variant="outlined" label={s.bereich} />}
                          <Chip size="small" variant="outlined" label={`${s.teile ?? 0} Teile`} />
                        </Stack>
                      }
                    />
                  </ListItem>
                ))}
              </List>
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ p: 1, borderTop: '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Gesamt: {totalTeile} Teile
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatMinutes(totalMinutes)} geschätzt
                </Typography>
              </Stack>
            </Paper>
          )}

          {overCapacity && (
            <Alert severity="warning" variant="outlined">
              Die Auswahl ({formatMinutes(totalMinutes)}) übersteigt die freie Kapazität von{' '}
              {row.displayName} ({formatMinutes(freeMinutes)}). Zuweisung bleibt möglich — bitte
              bewusst entscheiden.
            </Alert>
          )}

          {selected.length > 0 && (
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
                  ? `${row.displayName} hat heute noch kein Bündel. Mit dieser Zuweisung wird das Bündel erstellt und die ${selected.length} ausgewählten Belege werden seine ersten Mitglieder.`
                  : `Die ${selected.length} ausgewählten Belege werden ans Ende des Bündels (${row.bundleSize ?? 0} Belege) angehängt; die Reihenfolge ist danach editierbar.`}
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
            helperText="Wird mit Mitarbeitenden und Belegen auditiert (§8.4)."
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
        <Button variant="contained" disabled={selected.length === 0} onClick={handleConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
