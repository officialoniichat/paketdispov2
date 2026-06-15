/**
 * §11 Mitarbeiter-Einstellungen tab (concept §d Screen 1 + detail). Left: the
 * employee list with the team-capacity header that mirrors the cockpit. Right: the
 * selected employee's detail/settings panel. Everything writes the same
 * Shift.netCapacityMinutes the assignment engine reads.
 */
import { useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { fetchEmployees, type EmployeeListItem, type EmployeeListResponse } from '../../data/employees.js';
import { EmployeeDetailPanel } from './EmployeeDetailPanel.js';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EmployeeSettings(): JSX.Element {
  const [date] = useState(todayIso());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryKey = ['admin', 'employees', date] as const;
  const query = useQuery<EmployeeListResponse, Error>({
    queryKey,
    queryFn: () => fetchEmployees(date),
  });

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
      <Paper variant="outlined" sx={{ p: 2, flex: 1, width: '100%' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
          Mitarbeiter
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
                <TableCell>Bereich</TableCell>
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
      <TableCell>{emp.displayName}</TableCell>
      <TableCell>{emp.roles.join(', ')}</TableCell>
      <TableCell>{emp.areaTags.length ? emp.areaTags.join(', ') : '—'}</TableCell>
      <TableCell align="right">{emp.netCapacityToday} min</TableCell>
      <TableCell>
        <Chip size="small" label={statusLabel} color={statusColor} variant={selected ? 'filled' : 'outlined'} />
      </TableCell>
    </TableRow>
  );
}
