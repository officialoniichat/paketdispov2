/**
 * Zuweisen aus der Belegliste (A4): pick an employee for ONE Beleg — the inverse
 * of the board dialog (there: employee fixed, Beleg gesucht). Employee options
 * come from the day board (scheduled heads incl. free ones); the teamlead
 * themself is pinned on top as „Mir zuweisen". Bereich mismatch stays a SOFT
 * warning (like the automatic planner), the Grund is optional. Confirm posts the
 * audited §8.4 assignToEmployee override and refreshes the Beleg list.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { LieferungChip } from '../../components/LieferungChip.js';
import { CURRENT_TEAMLEAD_ID, useCockpitData } from '../../data/store.js';
import type { BelegRow } from '../../data/belege.js';

/** Sentinel option value for the pinned „Mir zuweisen" entry. */
const SELF_OPTION = `self:${CURRENT_TEAMLEAD_ID}`;

export interface AssignFromListDialogProps {
  open: boolean;
  beleg: BelegRow | null;
  onClose: () => void;
}

export function AssignFromListDialog({
  open,
  beleg,
  onClose,
}: AssignFromListDialogProps): JSX.Element | null {
  const { board, assignToEmployee } = useCockpitData();
  const queryClient = useQueryClient();
  const [employeeValue, setEmployeeValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmployeeValue('');
      setReason('');
      setError(null);
    }
  }, [open]);

  const rows = useMemo(
    () => [...board].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [board],
  );

  if (!beleg) return null;

  const selectedRow = rows.find((r) => r.employeeId === employeeValue) ?? null;
  const targetEmployeeNo = employeeValue === SELF_OPTION ? CURRENT_TEAMLEAD_ID : employeeValue;
  // Soft Bereich warning — only when both sides are known (like the Automatik).
  const bereichMismatch =
    selectedRow !== null &&
    beleg.bereich !== null &&
    selectedRow.bereiche.length > 0 &&
    !selectedRow.bereiche.includes(beleg.bereich);

  async function handleConfirm(): Promise<void> {
    if (!beleg || targetEmployeeNo === '') return;
    setError(null);
    try {
      await assignToEmployee.mutateAsync({
        employeeNo: targetEmployeeNo,
        caseId: beleg.id,
        reason: reason.trim(),
      });
      void queryClient.invalidateQueries({ queryKey: ['belege'] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zuweisung fehlgeschlagen');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Beleg zuweisen — {beleg.weBelegNo}
        {beleg.bereich ? ` · ${beleg.bereich}` : ''} · {beleg.quantity} Teile
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction="row" gap={0.5} alignItems="center" flexWrap="wrap">
            {beleg.bereich && <Chip size="small" variant="outlined" label={beleg.bereich} />}
            <Chip size="small" variant="outlined" label={`${beleg.quantity} Teile`} />
            <LieferungChip group={beleg.deliveryGroup} />
            {beleg.attentionNote && (
              <Typography variant="caption" color="text.secondary">
                „{beleg.attentionNote}"
              </Typography>
            )}
          </Stack>

          <TextField
            select
            fullWidth
            label="Mitarbeiter:in"
            value={employeeValue}
            onChange={(e) => setEmployeeValue(e.target.value)}
          >
            <MenuItem value={SELF_OPTION} sx={{ fontWeight: 700 }}>
              Mir zuweisen (Teamleitung)
            </MenuItem>
            {rows.map((r) => (
              <MenuItem key={r.employeeId} value={r.employeeId}>
                {r.displayName}
                {r.bereiche.length > 0 ? ` · ${r.bereiche.join(', ')}` : ''}
                {r.bundleId == null ? ' · frei' : ` · ${r.bundleSize ?? 0} Belege`}
              </MenuItem>
            ))}
          </TextField>

          {bereichMismatch && selectedRow && (
            <Alert severity="warning" variant="outlined">
              Bereich-Hinweis: Beleg ist <strong>{beleg.bereich}</strong>,{' '}
              {selectedRow.displayName} ist für <strong>{selectedRow.bereiche.join(', ')}</strong>{' '}
              eingeteilt. Zuweisung bleibt möglich (weiche Warnung wie in der Automatik).
            </Alert>
          )}

          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Grund (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Wird mit Mitarbeitenden und Beleg auditiert (§8.4)."
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="contained"
          disabled={targetEmployeeNo === '' || assignToEmployee.isPending}
          onClick={() => void handleConfirm()}
        >
          Zuweisen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
