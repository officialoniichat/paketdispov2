/**
 * §11 Mitarbeiter-Einstellungen tab (concept §d Screen 1 + detail). Left: the
 * employee list with the team-capacity header that mirrors the cockpit. Right: the
 * selected employee's detail/settings panel. Everything writes the same
 * Shift.netCapacityMinutes the assignment engine reads.
 */
import { useState, type JSX } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  createEmployee,
  fetchEmployees,
  type EmployeeDetail,
  type EmployeeListItem,
  type EmployeeListResponse,
} from '../../data/employees.js';
import { TierChip } from '../../components/TierChip.js';
import { employeeRoleLabels } from '@paket/ui';
import { toEmployeeRole, toSkillTier } from '../../data/narrow.js';
import { EmployeeDetailPanel } from './EmployeeDetailPanel.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EmployeeSettings(): JSX.Element {
  const [date] = useState(todayIso());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const queryKey = ['admin', 'employees', date] as const;
  const query = useQuery<EmployeeListResponse, Error>({
    queryKey,
    queryFn: () => fetchEmployees(date),
  });

  const onCreated = (created: EmployeeDetail): void => {
    setCreateOpen(false);
    setSelectedId(created.id);
    void query.refetch();
  };

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
      <Paper variant="outlined" sx={{ p: 2, flex: 1, width: '100%' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Mitarbeiter
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setCreateOpen(true)}>
            + Temporäre Kraft
          </Button>
        </Stack>
        <TempEmployeeDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          MSP-Import folgt später — hier nur Stammmannschaft; Azubis/Aushilfen über
          Dummy-Mitarbeiter.
        </Typography>
        {query.data && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Team-Kapazität: {query.data.activeCount} aktiv · Netto{' '}
            {query.data.teamCapacityMinutes} min · Früh {query.data.morningCapacityMinutes} min
          </Typography>
        )}
        {query.isLoading && (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Mitarbeiter werden geladen…
            </Typography>
          </Stack>
        )}
        {query.error && (
          <Alert severity="error">Mitarbeiter konnten nicht geladen werden: {query.error.message}</Alert>
        )}
        {query.data && (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Rolle</TableCell>
                <TableCell>Skill-Stufe</TableCell>
                <TableCell align="right">Netto heute</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.data.employees.map((e) => (
                <EmployeeRow
                  key={e.id}
                  emp={e}
                  selected={e.id === selectedId}
                  onSelect={() => setSelectedId(e.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ flex: 1, width: '100%', minHeight: 200 }}>
        {selectedId ? (
          <EmployeeDetailPanel
            employeeId={selectedId}
            date={date}
            onChanged={() => query.refetch()}
          />
        ) : (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Mitarbeiter links wählen, um Profil, Arbeitszeit und Kapazität zu bearbeiten.
            </Typography>
          </Box>
        )}
      </Paper>
    </Stack>
  );
}

function EmployeeRow({
  emp,
  selected,
  onSelect,
}: {
  emp: EmployeeListItem;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const statusLabel = emp.active ? 'aktiv' : 'inaktiv';
  const statusColor: 'default' | 'success' = emp.active ? 'success' : 'default';
  return (
    <TableRow hover selected={selected} onClick={onSelect} sx={{ cursor: 'pointer' }}>
      <TableCell>
        <Stack direction="row" spacing={1} alignItems="center">
          <span>{emp.displayName}</span>
          {!emp.measured && (
            <Chip size="small" color="warning" variant="outlined" label="Temp · ohne Messung" />
          )}
        </Stack>
      </TableCell>
      <TableCell>{emp.roles.map((r) => employeeRoleLabels[toEmployeeRole(r)]).join(', ')}</TableCell>
      <TableCell>
        <TierChip tier={toSkillTier(emp.skillTier)} />
      </TableCell>
      <TableCell align="right">{emp.netCapacityToday} min</TableCell>
      <TableCell>
        <Chip size="small" label={statusLabel} color={statusColor} variant={selected ? 'filled' : 'outlined'} />
      </TableCell>
    </TableRow>
  );
}

/**
 * Quick-create a temporary worker (Azubi/Saisonaushilfe). measured is forced false here
 * — that is the whole point of this path; performance KPIs exclude them. A reduced
 * default productivity reflects that temp workers are deutlich unproduktiver; capacity
 * (Schicht) is set afterwards in the „Schichtplan"-Tab.
 */
function TempEmployeeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (created: EmployeeDetail) => void;
}): JSX.Element {
  const [displayName, setDisplayName] = useState('');
  const [productivity, setProductivity] = useState('0.7');
  const mutation = useMutation({
    mutationFn: () =>
      createEmployee({
        displayName: displayName.trim(),
        measured: false,
        productivityFactor: Number(productivity) || undefined,
      }),
    onSuccess: (created) => {
      setDisplayName('');
      setProductivity('0.7');
      onCreated(created);
    },
  });

  const canSave = displayName.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Temporäre Kraft anlegen</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Azubi / Saisonaushilfe. Wird ohne Leistungsmessung geführt und kann manuell
            Belege bekommen. Arbeitszeit später im Tab „Schichtplan" setzen.
          </Typography>
          <TextField
            label="Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
            fullWidth
          />
          <TextField
            label="Produktivitätsfaktor (0,5–1,2)"
            value={productivity}
            onChange={(e) => setProductivity(e.target.value)}
            type="number"
            inputProps={{ min: 0.5, max: 1.2, step: 0.05 }}
            fullWidth
          />
          {mutation.error && (
            <Alert severity="error">Anlegen fehlgeschlagen: {mutation.error.message}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => mutation.mutate()}>
          Anlegen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
