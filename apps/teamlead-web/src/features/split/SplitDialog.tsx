/**
 * Beleg-Split dialog (§8.4 manual intervention). The Teamlead splits one oversized
 * Beleg across N employees: pick people, assign quantity shares, see live remaining
 * quantity + per-share effort and shift-fit, choose the capture mode (getrennt vs.
 * anteilig) and give a mandatory reason. Mirrors
 * docs/concept/beleg-split-multi-employee-ux-mockup.html (dialog #2).
 *
 * All math comes from {@link ./splitMath} (single source); this component only
 * renders + steers. The engine's automatic flagging/persistence is deferred.
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
  apportion,
  fitForShare,
  suggestedQuantities,
  suggestedSplitCount,
  validateShares,
  type CaptureMode,
  type ShareFit,
  type SplitMode,
} from './splitMath.js';
import type { RecordSplitInput } from './SplitProvider.js';

/** The Beleg being split (effort envelope + identity). */
export interface SplitDialogBeleg {
  caseId: string;
  weBelegNo: string;
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
}

/** A pickable employee with today's net capacity (the shift ceiling for fit). */
export interface SplitDialogEmployee {
  id: string;
  name: string;
  ceilingMinutes: number;
}

export interface SplitDialogProps {
  open: boolean;
  beleg: SplitDialogBeleg | null;
  employees: SplitDialogEmployee[];
  onConfirm: (input: RecordSplitInput) => void;
  onClose: () => void;
}

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

/** Build the initial rows: even split across the engine-suggested number of people. */
function initialRows(beleg: SplitDialogBeleg, employees: SplitDialogEmployee[]): Row[] {
  const ceiling = Math.max(0, ...employees.map((e) => e.ceilingMinutes));
  const suggested = suggestedSplitCount(beleg.estimatedMinutes, ceiling);
  const count = Math.min(suggested, employees.length || suggested);
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
  onConfirm,
  onClose,
}: SplitDialogProps): JSX.Element | null {
  const [splitMode, setSplitMode] = useState<SplitMode>('quantity');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('getrennt');
  const [rows, setRows] = useState<Row[]>([]);
  const [reason, setReason] = useState('');

  // Re-seed whenever a new Beleg opens (or the employee list resolves). `employees`
  // is memoised upstream, so this only fires on a real open/beleg/list change.
  useEffect(() => {
    if (open && beleg) {
      setSplitMode('quantity');
      setCaptureMode('getrennt');
      setRows(initialRows(beleg, employees));
      setReason('');
    }
  }, [open, beleg, employees]);

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const ceilingById = useMemo(
    () => new Map(employees.map((e) => [e.id, e.ceilingMinutes])),
    [employees],
  );

  const caseEffort = beleg
    ? {
        totalQuantity: beleg.totalQuantity,
        effortPoints: beleg.effortPoints,
        estimatedMinutes: beleg.estimatedMinutes,
      }
    : { totalQuantity: 0, effortPoints: 0, estimatedMinutes: 0 };

  const computed = useMemo(() => apportion(rows, caseEffort), [rows, caseEffort]);
  const validation = validateShares(rows, caseEffort.totalQuantity);
  const assignedPct =
    caseEffort.totalQuantity > 0
      ? (validation.assignedQuantity / caseEffort.totalQuantity) * 100
      : 0;

  const chosenIds = rows.map((r) => r.employeeId).filter(Boolean);
  const usedIds = new Set(chosenIds);
  const hasDuplicate = usedIds.size !== chosenIds.length;
  const allChosen = rows.every((r) => r.employeeId !== '');
  const reasonOk = isValidReason(reason);
  const canConfirm = validation.isValid && allChosen && !hasDuplicate && reasonOk;

  if (!beleg) return null;

  const nextFreeEmployee = (): string => employees.find((e) => !usedIds.has(e.id))?.id ?? '';

  const setRow = (index: number, patch: Partial<Row>): void => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const addRow = (): void => {
    const remaining = Math.max(0, caseEffort.totalQuantity - validation.assignedQuantity);
    setRows((prev) => [...prev, { employeeId: nextFreeEmployee(), quantity: remaining }]);
  };
  const removeRow = (index: number): void => setRows((prev) => prev.filter((_, i) => i !== index));
  const reSuggest = (count: number): void => {
    const qty = suggestedQuantities(caseEffort.totalQuantity, count);
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
      weBelegNo: beleg.weBelegNo,
      caseEffort,
      splitMode,
      captureMode,
      reason: reason.trim(),
      shares: rows.map((r) => ({
        employeeId: r.employeeId,
        employeeName: nameById.get(r.employeeId) ?? r.employeeId,
        quantity: r.quantity,
      })),
    });
    onClose();
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
          {beleg.totalQuantity.toLocaleString('de-DE')} Teile · {formatMinutes(beleg.estimatedMinutes)}{' '}
          Aufwand
        </Typography>
      </DialogTitle>
      <DialogContent>
        {/* Mode toggles + engine suggestion */}
        <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mt: 1.5, mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
              Aufteilen nach
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={splitMode}
              onChange={(_e, v) => v && setSplitMode(v as SplitMode)}
              aria-label="Aufteilen nach"
            >
              <ToggleButton value="quantity">Menge</ToggleButton>
              <ToggleButton value="position">Position</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
              Leistung erfassen
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={captureMode}
              onChange={(_e, v) => v && setCaptureMode(v as CaptureMode)}
              aria-label="Leistung erfassen"
            >
              <ToggleButton value="getrennt">getrennt</ToggleButton>
              <ToggleButton value="anteilig">anteilig</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
              Vorschlag (Anzahl)
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

        {splitMode === 'position' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Positions-Auswahl folgt — aktuell wird mengenbasiert aufgeteilt.
          </Alert>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          {captureMode === 'getrennt'
            ? 'getrennt: jede Teilmenge wird real gemessen, Aufwand pro Anteil neu gerechnet.'
            : 'anteilig: der Gesamtaufwand wird strikt nach Mengenanteil aufgeteilt.'}
        </Typography>

        {/* Remaining quantity bar */}
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
          ) : (
            <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>
              ✓ Summe ≤ Gesamtmenge — Teilaufteilung erlaubt, Rest bleibt offen.
            </Typography>
          )}
        </Box>

        {/* Share rows */}
        <Stack spacing={1.5}>
          {rows.map((row, index) => {
            const share = computed[index];
            const ceiling = ceilingById.get(row.employeeId) ?? 0;
            const fit = fitForShare(share?.estimatedMinutes ?? 0, ceiling);
            const dup =
              row.employeeId !== '' && rows.filter((r) => r.employeeId === row.employeeId).length > 1;
            return (
              <Stack key={index} direction="row" spacing={1.5} alignItems="center">
                <TextField
                  select
                  size="small"
                  label="Mitarbeiter:in"
                  value={row.employeeId}
                  error={dup}
                  helperText={dup ? 'doppelt' : undefined}
                  onChange={(e) => setRow(index, { employeeId: e.target.value })}
                  sx={{ minWidth: 220 }}
                >
                  {employees.map((emp) => (
                    <MenuItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  type="number"
                  label="Menge"
                  value={Number.isFinite(row.quantity) ? row.quantity : 0}
                  onChange={(e) =>
                    setRow(index, { quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                  }
                  sx={{ width: 110 }}
                  inputProps={{ min: 0, 'aria-label': `Menge Anteil ${index + 1}` }}
                />
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ width: 110, fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatMinutes(share?.estimatedMinutes ?? 0)}
                </Typography>
                <Chip size="small" color={FIT_META[fit].color} variant="outlined" label={FIT_META[fit].label} />
                <Tooltip title="Anteil entfernen">
                  <span>
                    <IconButton
                      size="small"
                      aria-label="Anteil entfernen"
                      disabled={rows.length <= 2}
                      onClick={() => removeRow(index)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            );
          })}
        </Stack>

        <Button
          size="small"
          startIcon={<AddIcon />}
          sx={{ mt: 1 }}
          disabled={rows.length >= employees.length}
          onClick={addRow}
        >
          Mitarbeiter:in hinzufügen
        </Button>

        {/* Mandatory reason */}
        <TextField
          fullWidth
          multiline
          minRows={2}
          required
          label="Grund (Pflichtfeld · Audit §8.4)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reason.length > 0 && !reasonOk}
          helperText={
            reason.length > 0 && !reasonOk
              ? `Bitte mindestens ${MIN_REASON_LENGTH} Zeichen angeben.`
              : 'Wird als „Beleg aufteilen" mit Anteilen auditiert.'
          }
          sx={{ mt: 2.5 }}
        />
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
          {REASON_SUGGESTIONS.map((s) => (
            <Button key={s} size="small" variant="outlined" onClick={() => setReason(s)}>
              {s}
            </Button>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" disabled={!canConfirm} onClick={handleConfirm}>
          Aufteilen bestätigen · {rows.length} Anteile
        </Button>
      </DialogActions>
    </Dialog>
  );
}
