/**
 * Schichtplan (concept §d Screen 3) — the simple, intuitive shift planner. One grid:
 * employees × Mo–So, each cell a named shift model (Früh / Spät / Frei). A legend
 * spells out what each model means. Saving a row writes the weekly pattern; the
 * backend materializes it into the capacity the assignment engine reads. Absence is
 * a small separate action. No per-day hand-editing — the pattern is the plan.
 */
import { useEffect, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { alpha } from '@mui/material/styles';
import { SHIFT_MODEL_COLORS, type ShiftModelName } from '../../lib/schichtFarben.js';
import { SchichtplanKalender } from './SchichtplanKalender.js';
import {
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

/** Modell-Name eines Wochentags — auch vom Schichtplan-Kalender genutzt. */
export function modelOfDay(day: WeeklyPattern['mon']): string {
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
  // Umschalter rechts: das Wochenmuster minimiert sich, der Kalender öffnet sich.
  const [ansicht, setAnsicht] = useState<'muster' | 'kalender'>('muster');

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
              Schichtplan – {ansicht === 'muster' ? 'Wochenmuster' : 'Kalender'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Lege je Mitarbeiter und Wochentag eine Schicht fest. Daraus berechnet das System die
              Kapazität für die Zuteilung.
            </Typography>
          </Box>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={ansicht}
            onChange={(_e, v: 'muster' | 'kalender' | null) => {
              if (v !== null) setAnsicht(v);
            }}
            aria-label="Schichtplan-Ansicht"
          >
            <ToggleButton value="muster">Wochenmuster</ToggleButton>
            <ToggleButton value="kalender">
              <CalendarMonthIcon fontSize="small" sx={{ mr: 0.5 }} />
              Kalender
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap">
          <LegendPill model="Frühschicht" text="06:00–14:00 · 30 min Pause" />
          <LegendPill model="Spätschicht" text="10:00–18:00 · 30 min Pause" />
          <LegendPill model="Frei" text="kein Einsatz" />
        </Stack>
      </Paper>

      {query.data && ansicht === 'kalender' && (
        <SchichtplanKalender employees={query.data.employees} />
      )}

      {query.error && (
        <Alert severity="error">Konnte nicht geladen werden: {query.error.message}</Alert>
      )}
      {query.data && ansicht === 'muster' && (
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
            sx={{
              minWidth: 92,
              px: 0.5,
              borderRadius: 0.5,
              // Schichtfarbe direkt in der Zelle: Früh hellblau · Spät helllila · Frei orange.
              bgcolor: alpha(
                SHIFT_MODEL_COLORS[modelOfDay(pattern[d.key]) as ShiftModelName] ??
                  SHIFT_MODEL_COLORS.Frei,
                0.45,
              ),
            }}
          >
            {MODEL_NAMES.map((m) => (
              <MenuItem key={m} value={m}>
                <Box
                  component="span"
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: SHIFT_MODEL_COLORS[m as ShiftModelName],
                    mr: 0.75,
                    display: 'inline-block',
                  }}
                />
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

/** Legende mit Farbkachel — dieselben Farben wie Kalender-Blöcke und Matrix-Pill. */
function LegendPill({ model, text }: { model: ShiftModelName; text: string }): JSX.Element {
  return (
    <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        component="span"
        sx={{
          width: 12,
          height: 12,
          borderRadius: 0.5,
          bgcolor: SHIFT_MODEL_COLORS[model],
          display: 'inline-block',
        }}
      />
      <b>{model}</b> {text}
    </Typography>
  );
}
