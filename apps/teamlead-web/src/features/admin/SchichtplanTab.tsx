/**
 * Schichtplan (concept §d Screen 3) — the simple, intuitive shift planner. One grid:
 * employees × Mo–So, each cell a named shift model (Früh / Spät / Frei). A legend
 * spells out what each model means. Saving a row writes the weekly pattern; the
 * backend materializes it into the capacity the assignment engine reads. Absence is
 * a small separate action. No per-day hand-editing — the pattern is the plan.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
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
  createAbsence,
  fetchEmployees,
  updateEmployeeProfile,
  type EmployeeListItem,
  type EmployeeListResponse,
  type WeeklyPattern,
} from '../../data/employees.js';

type DayKey = keyof WeeklyPattern;
const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Di' },
  { key: 'wed', label: 'Mi' },
  { key: 'thu', label: 'Do' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'So' },
];

/** The only shift models — fixed, with a clear meaning shown in the legend. */
const MODELS: Record<string, { start: string; end: string; breakMinutes: number } | null> = {
  Frühschicht: { start: '06:00', end: '14:00', breakMinutes: 30 },
  Spätschicht: { start: '10:00', end: '18:00', breakMinutes: 30 },
  Frei: null,
};
const MODEL_NAMES = Object.keys(MODELS);
const ABSENCE_KINDS = ['krank', 'urlaub', 'abwesend'] as const;

function freiDay(): WeeklyPattern['mon'] {
  return { working: false, breakMinutes: 0, partTimePct: 100 };
}

function blankPattern(): WeeklyPattern {
  return {
    mon: freiDay(),
    tue: freiDay(),
    wed: freiDay(),
    thu: freiDay(),
    fri: freiDay(),
    sat: freiDay(),
    sun: freiDay(),
  };
}

function modelOfDay(day: WeeklyPattern['mon']): string {
  return day.working ? (day.shiftModel ?? 'Frühschicht') : 'Frei';
}

function dayMinutes(day: WeeklyPattern['mon']): number {
  if (!day.working || !day.start || !day.end) return 0;
  const [sh, sm] = day.start.split(':').map(Number);
  const [eh, em] = day.end.split(':').map(Number);
  const win = (eh ?? 0) * 60 + (em ?? 0) - ((sh ?? 0) * 60 + (sm ?? 0));
  return Math.max(0, win - day.breakMinutes);
}

function weeklyHours(p: WeeklyPattern): string {
  const min = DAYS.reduce((sum, d) => sum + dayMinutes(p[d.key]), 0);
  return (min / 60).toFixed(1).replace('.', ',');
}

export function SchichtplanTab(): JSX.Element {
  const query = useQuery<EmployeeListResponse, Error>({
    queryKey: ['admin', 'employees', 'schichtplan'],
    queryFn: () => fetchEmployees(),
  });

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
          Schichtplan – Wochenmuster
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Lege je Mitarbeiter und Wochentag eine Schicht fest. Daraus berechnet das System die
          Kapazität für die Zuteilung.
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap">
          <Typography variant="caption">
            <b>Frühschicht</b> 06:00–14:00 · 30 min Pause
          </Typography>
          <Typography variant="caption">
            <b>Spätschicht</b> 10:00–18:00 · 30 min Pause
          </Typography>
          <Typography variant="caption">
            <b>Frei</b> – kein Einsatz
          </Typography>
        </Stack>
      </Paper>

      {query.error && (
        <Alert severity="error">Konnte nicht geladen werden: {query.error.message}</Alert>
      )}
      {query.data && (
        <Paper variant="outlined" sx={{ p: 1, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Mitarbeiter</TableCell>
                {DAYS.map((d) => (
                  <TableCell key={d.key} align="center" sx={{ fontWeight: 700 }}>
                    {d.label}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  Wo-Std
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.data.employees
                .filter((e) => e.roles.includes('employee'))
                .map((e) => (
                  <PlannerRow key={e.id} emp={e} />
                ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {query.data && <AbsencePanel employees={query.data.employees} />}
    </Stack>
  );
}

function PlannerRow({ emp }: { emp: EmployeeListItem }): JSX.Element {
  const queryClient = useQueryClient();
  const [pattern, setPattern] = useState<WeeklyPattern>(emp.weeklyPattern ?? blankPattern());
  useEffect(() => setPattern(emp.weeklyPattern ?? blankPattern()), [emp.id, emp.weeklyPattern]);

  const mutation = useMutation({
    mutationFn: (next: WeeklyPattern) => updateEmployeeProfile(emp.id, { weeklyPattern: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
    },
  });

  const setDay = (key: DayKey, model: string): void => {
    const m = MODELS[model];
    const next: WeeklyPattern = {
      ...pattern,
      [key]: m
        ? { working: true, shiftModel: model, start: m.start, end: m.end, breakMinutes: m.breakMinutes, partTimePct: 100 }
        : freiDay(),
    };
    setPattern(next);
    mutation.mutate(next); // autosave — no forgettable save button
  };

  return (
    <TableRow>
      <TableCell>
        {emp.displayName}
        {mutation.isPending && (
          <Typography component="span" variant="caption" color="text.secondary">
            {' '}· speichert…
          </Typography>
        )}
        {mutation.error && (
          <Typography component="span" variant="caption" color="error">
            {' '}· Fehler
          </Typography>
        )}
      </TableCell>
      {DAYS.map((d) => (
        <TableCell key={d.key} align="center" sx={{ px: 0.5 }}>
          <TextField
            select
            size="small"
            variant="standard"
            value={modelOfDay(pattern[d.key])}
            onChange={(ev) => setDay(d.key, ev.target.value)}
            sx={{ minWidth: 92 }}
          >
            {MODEL_NAMES.map((m) => (
              <MenuItem key={m} value={m}>
                {m}
              </MenuItem>
            ))}
          </TextField>
        </TableCell>
      ))}
      <TableCell align="right">{weeklyHours(pattern)} h</TableCell>
    </TableRow>
  );
}

function AbsencePanel({ employees }: { employees: EmployeeListItem[] }): JSX.Element {
  const queryClient = useQueryClient();
  const staff = useMemo(() => employees.filter((e) => e.roles.includes('employee')), [employees]);
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState(staff[0]?.id ?? '');
  const [kind, setKind] = useState<(typeof ABSENCE_KINDS)[number]>('krank');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => createAbsence(employeeId, { dateFrom: from, dateTo: to, kind, reason: reason || undefined }),
    onSuccess: () => {
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
    },
  });

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Abwesenheit melden
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
        <TextField select size="small" label="Mitarbeiter" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} sx={{ minWidth: 160 }}>
          {staff.map((e) => (
            <MenuItem key={e.id} value={e.id}>
              {e.displayName}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Art" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} sx={{ width: 130 }}>
          {ABSENCE_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label="Von" value={from} onChange={(e) => setFrom(e.target.value)} sx={{ width: 140 }} />
        <TextField size="small" label="Bis" value={to} onChange={(e) => setTo(e.target.value)} sx={{ width: 140 }} />
        <TextField size="small" label="Grund" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
        <Button variant="contained" color="warning" disabled={!employeeId || mutation.isPending} onClick={() => mutation.mutate()}>
          Melden
        </Button>
      </Stack>
      {mutation.isSuccess && (
        <Alert severity="success" sx={{ mt: 1, py: 0 }}>
          Abwesenheit gespeichert – Kapazität auf 0 gesetzt.
        </Alert>
      )}
      {mutation.error && (
        <Alert severity="error" sx={{ mt: 1, py: 0 }}>
          Fehlgeschlagen: {mutation.error.message}
        </Alert>
      )}
    </Paper>
  );
}
