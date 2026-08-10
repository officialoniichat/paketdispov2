/**
 * Beleg aufteilen (§8.4 manueller Eingriff).
 *
 * Der Teamlead zerlegt einen zu großen Beleg in echte Teil-Belege und entscheidet dabei
 * nur zwei Dinge: wie viele Teile mit welcher Menge — und ob er sie gleich jemandem gibt
 * oder die Automatik verteilen lässt.
 *
 * „Ohne Zuweisung" ist der Normalfall für Monster-Belege: die Teile landen als bereite
 * Belege im Topf und werden beim nächsten Starter-Pack bzw. Self-Pull regulär verteilt.
 * Liegt jeder Teil unter der Monster-Schwelle, fasst die Automatik sie wieder an.
 *
 * Der Dialog rechnet nichts Fachliches: die tatsächliche Mengenverteilung entlang der
 * Größenzeilen, die Container-Markierung und die Zuweisung macht das Backend. Hier
 * laufen nur Eingabehilfen (Vorschlagsmengen, Rest-Anzeige, Schicht-Passung).
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { isValidReason, MIN_REASON_LENGTH } from '../../data/audit.js';
import { formatMinutes } from '../../lib/format.js';
import {
  fitForShare,
  suggestedQuantities,
  suggestedSplitCount,
  validateShares,
  type ShareFit,
} from './splitMath.js';

/** Der Beleg, der aufgeteilt wird (Identität + Aufwandsrahmen). */
export interface SplitDialogBeleg {
  caseId: string;
  weBelegNo: string;
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
}

/** Ein wählbarer Mitarbeiter mit heutiger Netto-Kapazität (Deckel für die Passung). */
export interface SplitDialogEmployee {
  id: string;
  /** Mitarbeiter-Nr — damit adressiert das Backend die Zuweisung. */
  employeeNo: string;
  name: string;
  ceilingMinutes: number;
}

/** Was der Dialog nach oben meldet: Mengen, optionale Personen, Grund. */
export interface SplitSubmit {
  caseId: string;
  parts: { quantity: number; employeeNo?: string }[];
  reason: string;
}

export interface SplitDialogProps {
  open: boolean;
  beleg: SplitDialogBeleg | null;
  employees: SplitDialogEmployee[];
  /** Läuft, während das Backend die Teile anlegt. */
  pending?: boolean;
  /** Fehlermeldung des Backends (z. B. „nur 2 Größenzeilen"). */
  error?: string | null;
  onConfirm: (input: SplitSubmit) => void;
  onClose: () => void;
}

/** Wer die Teile bekommt. */
type Handover = 'automatik' | 'mitarbeiter';

interface Row {
  employeeId: string;
  quantity: number;
}

const REASON_SUGGESTIONS = [
  'Mengenvolumen zu groß',
  'Koffer / sperrig',
  'Verladetag heute',
  'Schicht reicht nicht',
];

const FIT_META: Record<ShareFit, { label: string; color: 'success' | 'warning' | 'error' }> = {
  ok: { label: 'passt', color: 'success' },
  tight: { label: 'eng · 2. Tag', color: 'warning' },
  over: { label: 'zu groß', color: 'error' },
};

/** Startaufteilung: gleichmäßig über die vorgeschlagene Anzahl Teile. */
function initialRows(beleg: SplitDialogBeleg, employees: SplitDialogEmployee[]): Row[] {
  const ceiling = Math.max(0, ...employees.map((e) => e.ceilingMinutes));
  const count = suggestedSplitCount(beleg.estimatedMinutes, ceiling);
  const qty = suggestedQuantities(beleg.totalQuantity, count);
  return Array.from({ length: count }, (_, i) => ({
    employeeId: employees[i]?.id ?? '',
    quantity: qty[i] ?? 0,
  }));
}

export function SplitDialog({
  open,
  beleg,
  employees,
  pending = false,
  error = null,
  onConfirm,
  onClose,
}: SplitDialogProps): JSX.Element | null {
  const [handover, setHandover] = useState<Handover>('automatik');
  const [rows, setRows] = useState<Row[]>([]);
  const [reason, setReason] = useState('');

  // Neu aufsetzen, sobald ein anderer Beleg geöffnet wird (oder die MA-Liste eintrifft).
  useEffect(() => {
    if (open && beleg) {
      setHandover('automatik');
      setRows(initialRows(beleg, employees));
      setReason('');
    }
  }, [open, beleg, employees]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const totalQuantity = beleg?.totalQuantity ?? 0;
  const estimatedMinutes = beleg?.estimatedMinutes ?? 0;
  const validation = validateShares(rows, totalQuantity);
  const assignedPct = totalQuantity > 0 ? (validation.assignedQuantity / totalQuantity) * 100 : 0;

  const chosenIds = rows.map((r) => r.employeeId).filter(Boolean);
  const hasDuplicate = new Set(chosenIds).size !== chosenIds.length;
  const needsPeople = handover === 'mitarbeiter';
  const allChosen = !needsPeople || rows.every((r) => r.employeeId !== '');
  const reasonOk = isValidReason(reason);
  // Ein Beleg wird VOLLSTÄNDIG aufgeteilt: ein Rest hätte danach keinen Träger mehr,
  // weil das Original nur noch die Klammer über seinen Teilen ist.
  const canConfirm =
    validation.isValid &&
    validation.isComplete &&
    allChosen &&
    !hasDuplicate &&
    reasonOk &&
    !pending;

  if (!beleg) return null;

  const usedIds = new Set(chosenIds);
  const nextFreeEmployee = (): string => employees.find((e) => !usedIds.has(e.id))?.id ?? '';

  const setRow = (index: number, patch: Partial<Row>): void => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const addRow = (): void => {
    const remaining = Math.max(0, totalQuantity - validation.assignedQuantity);
    setRows((prev) => [...prev, { employeeId: nextFreeEmployee(), quantity: remaining }]);
  };
  const removeRow = (index: number): void => setRows((prev) => prev.filter((_, i) => i !== index));
  const reSuggest = (count: number): void => {
    const qty = suggestedQuantities(totalQuantity, count);
    const ids = employees.map((e) => e.id);
    setRows((prev) =>
      Array.from({ length: count }, (_, i) => ({
        employeeId: prev[i]?.employeeId || ids[i] || '',
        quantity: qty[i] ?? 0,
      })),
    );
  };

  const handleConfirm = (): void => {
    if (!canConfirm) return;
    onConfirm({
      caseId: beleg.caseId,
      reason: reason.trim(),
      parts: rows.map((r) => {
        const employeeNo = needsPeople ? employeeById.get(r.employeeId)?.employeeNo : undefined;
        return { quantity: r.quantity, ...(employeeNo ? { employeeNo } : {}) };
      }),
    });
  };

  const barColor: 'error' | 'success' | 'primary' = validation.overAssigned
    ? 'error'
    : validation.isComplete
      ? 'success'
      : 'primary';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 0.5 }}>
        Beleg aufteilen · {beleg.weBelegNo}
        <Typography variant="body2" color="text.secondary">
          {beleg.totalQuantity.toLocaleString('de-DE')} Teile · {formatMinutes(estimatedMinutes)}{' '}
          Aufwand
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mt: 1.5, mb: 2 }}>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700, display: 'block' }}
            >
              Wer bekommt die Teile?
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={handover}
              onChange={(_e, v) => v && setHandover(v as Handover)}
              aria-label="Wer bekommt die Teile"
            >
              <ToggleButton value="automatik">Ohne Zuweisung</ToggleButton>
              <ToggleButton value="mitarbeiter">Mitarbeiter wählen</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 700, display: 'block' }}
            >
              Anzahl Teile
            </Typography>
            <Stack direction="row" spacing={0.5}>
              {[2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  size="small"
                  variant={rows.length === n ? 'contained' : 'outlined'}
                  onClick={() => reSuggest(n)}
                  sx={{ minWidth: 38 }}
                >
                  {n}
                </Button>
              ))}
            </Stack>
          </Box>
        </Stack>

        <Alert severity="info" sx={{ mb: 2 }}>
          {handover === 'automatik'
            ? 'Die Teile gehen als eigenständige Belege in den Topf — die Automatik verteilt sie beim nächsten Pack. Liegt jeder Teil unter der Monster-Schwelle, wird er wieder automatisch zugeteilt.'
            : 'Die Teile werden direkt den gewählten Mitarbeitern zugeteilt. Es entstehen dieselben eigenständigen Teil-Belege wie ohne Zuweisung — nur eben schon vergeben.'}
        </Alert>

        <Box sx={{ mb: 2 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="body2">Verteilt</Typography>
            <Typography variant="body2">
              <strong>{validation.assignedQuantity.toLocaleString('de-DE')}</strong> /{' '}
              {beleg.totalQuantity.toLocaleString('de-DE')} Teile · Rest{' '}
              <strong>{validation.remaining.toLocaleString('de-DE')}</strong>
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, assignedPct)}
            color={barColor}
            sx={{ height: 12, borderRadius: 6 }}
          />
          {validation.overAssigned ? (
            <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
              Summe übersteigt die Belegmenge — bitte korrigieren.
            </Typography>
          ) : validation.isComplete ? (
            <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>
              ✓ Die Teile decken den ganzen Beleg ab.
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              Noch {validation.remaining.toLocaleString('de-DE')} Teile offen — der Beleg wird
              vollständig aufgeteilt.
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Größenzeilen werden nie zerrissen: die tatsächlichen Mengen können darum leicht von
            den Wunschmengen abweichen.
          </Typography>
        </Box>

        <Stack spacing={1.5}>
          {rows.map((row, index) => {
            const shareMinutes =
              totalQuantity > 0 ? (estimatedMinutes * row.quantity) / totalQuantity : 0;
            const ceiling = employeeById.get(row.employeeId)?.ceilingMinutes ?? 0;
            const fit = needsPeople && row.employeeId ? fitForShare(shareMinutes, ceiling) : null;
            return (
              <Stack key={index} direction="row" spacing={1.5} alignItems="center">
                <Chip size="small" label={`Teil ${index + 1}`} sx={{ minWidth: 72 }} />
                {needsPeople && (
                  <TextField
                    select
                    size="small"
                    label="Mitarbeiter"
                    value={row.employeeId}
                    onChange={(e) => setRow(index, { employeeId: e.target.value })}
                    sx={{ minWidth: 220 }}
                  >
                    {employees.map((e) => (
                      <MenuItem
                        key={e.id}
                        value={e.id}
                        disabled={usedIds.has(e.id) && e.id !== row.employeeId}
                      >
                        {e.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  size="small"
                  type="number"
                  label="Teile"
                  value={row.quantity}
                  onChange={(e) => setRow(index, { quantity: Math.max(0, Number(e.target.value)) })}
                  sx={{ width: 130 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>
                  ≈ {formatMinutes(shareMinutes)}
                </Typography>
                {fit && (
                  <Chip size="small" color={FIT_META[fit].color} label={FIT_META[fit].label} />
                )}
                <Tooltip title="Teil entfernen">
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => removeRow(index)}
                      disabled={rows.length <= 2}
                      aria-label={`Teil ${index + 1} entfernen`}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            );
          })}
          <Box>
            <Button size="small" startIcon={<AddIcon />} onClick={addRow}>
              Teil hinzufügen
            </Button>
          </Box>
        </Stack>

        {hasDuplicate && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Ein Mitarbeiter steht mehrfach in der Liste.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          size="small"
          label="Grund"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          helperText={`Pflicht (mindestens ${MIN_REASON_LENGTH} Zeichen) — steht später im Verlauf.`}
          sx={{ mt: 2 }}
        />
        <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
          {REASON_SUGGESTIONS.map((s) => (
            <Chip key={s} size="small" variant="outlined" label={s} onClick={() => setReason(s)} />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm}>
          {pending
            ? 'Wird aufgeteilt …'
            : handover === 'automatik'
              ? `In ${rows.length} Teile aufteilen`
              : 'Aufteilen und zuweisen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
