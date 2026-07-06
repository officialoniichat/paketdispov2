/**
 * B2 „Beleg verschieben": pick the destination employee for one Beleg that's
 * currently in another employee's Bündel. Only the employee is chosen here — the
 * §8.4 audit reason is collected by the existing {@link ReasonDialog} step right
 * after (same pattern as every other board intervention), so this stays a single-
 * purpose picker instead of duplicating the reason UI.
 */
import { useEffect, useState, type JSX } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import type { BoardRow } from '../data/types.js';

export interface MoveCaseTarget {
  employeeId: string;
  displayName: string;
}

export interface MoveCaseDialogProps {
  open: boolean;
  /** The Beleg being moved (label only). */
  weBelegNo: string | null;
  /** The employee the Beleg currently belongs to — excluded from the target list. */
  sourceEmployeeId: string | null;
  /** Every board row, used to build the target picker (excludes the source). */
  board: BoardRow[];
  onSelect: (target: MoveCaseTarget) => void;
  onClose: () => void;
}

export function MoveCaseDialog({
  open,
  weBelegNo,
  sourceEmployeeId,
  board,
  onSelect,
  onClose,
}: MoveCaseDialogProps): JSX.Element {
  const [target, setTarget] = useState<MoveCaseTarget | null>(null);

  useEffect(() => {
    if (open) setTarget(null);
  }, [open]);

  const options: MoveCaseTarget[] = board
    .filter((row) => row.employeeId !== sourceEmployeeId)
    .map((row) => ({ employeeId: row.employeeId, displayName: row.displayName }));

  function handleConfirm(): void {
    if (!target) return;
    onSelect(target);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{weBelegNo ?? 'Beleg'} verschieben</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Ziel-Mitarbeiter wählen — der Beleg wird direkt in dessen Bündel verschoben
          (neu angelegt, falls noch keins besteht).
        </DialogContentText>
        <Autocomplete
          autoFocus
          options={options}
          getOptionLabel={(o) => o.displayName}
          isOptionEqualToValue={(o, v) => o.employeeId === v.employeeId}
          value={target}
          onChange={(_e, value) => setTarget(value)}
          renderInput={(params) => <TextField {...params} label="Ziel-Mitarbeiter" fullWidth />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" disabled={!target} onClick={handleConfirm}>
          Weiter
        </Button>
      </DialogActions>
    </Dialog>
  );
}
