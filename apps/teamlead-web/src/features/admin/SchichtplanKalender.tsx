/**
 * Schichtplan-Kalender (Admin & Regeln → Schichtplan, Umschalter rechts):
 * Monatsansicht mit Mini-Rechteckblöcken je Mitarbeiter und Tag, gefärbt nach
 * Schichtmodell (Früh hellblau · Spät helllila · Frei orange, aggregiert).
 * Klick (links) auf einen Mitarbeiter-Block: Krankschreibung/Urlaub ab diesem Tag
 * „bis wann mindestens" (EmployeeAbsence im Backend); abwesende Diensttage sind
 * durchgestrichen. Die Mitarbeiter-Matrix (Experiment DA.M.B) zeigt dieselben
 * Abwesenheiten ganz unten, ebenfalls durchgestrichen.
 */
import { useMemo, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  createAbsence,
  deleteAbsence,
  fetchAbsences,
  type Absence,
  type EmployeeListItem,
} from '../../data/employees.js';
import {
  ABSENCE_LABEL,
  SHIFT_MODEL_COLORS,
  type ShiftModelName,
} from '../../lib/schichtFarben.js';
import { modelOfDay } from './SchichtplanTab.js';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Lokales Datum → YYYY-MM-DD (ohne UTC-Verschiebung). */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Volle Wochen des Monats (Mo–So), inkl. Rand-Tagen der Nachbarmonate. */
function buildGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const days: Date[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

/** „Anna B." — kompakter Block-Text. */
function kurzName(name: string): string {
  const [vor, ...rest] = name.split(' ');
  const nach = rest[rest.length - 1];
  return nach !== undefined ? `${vor} ${nach[0]}.` : (vor ?? name);
}

interface MenuState {
  mouseX: number;
  mouseY: number;
  employee: EmployeeListItem;
  dayIso: string;
  absence: Absence | undefined;
}

interface DialogState {
  employee: EmployeeListItem;
  kind: 'krank' | 'urlaub';
  startIso: string;
}

export function SchichtplanKalender({
  employees,
}: {
  employees: EmployeeListItem[];
}): JSX.Element {
  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const workers = useMemo(
    () => employees.filter((e) => e.roles.includes('employee')),
    [employees],
  );
  const days = useMemo(() => buildGrid(cursor), [cursor]);
  const from = iso(days[0] ?? cursor);
  const to = iso(days[days.length - 1] ?? cursor);

  const absencesQuery = useQuery<Absence[], Error>({
    queryKey: ['admin', 'absences', from, to],
    queryFn: () => fetchAbsences(from, to),
  });
  const absences = absencesQuery.data ?? [];
  // Matrix (['cockpit'] → Board) zeigt dieselben Abwesenheiten — mit invalidieren.
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'absences'] });
    void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
  };
  const createMut = useMutation({ mutationFn: createAbsence, onSettled: invalidate });
  const deleteMut = useMutation({ mutationFn: deleteAbsence, onSettled: invalidate });

  // ISO-Strings vergleichen sich lexikografisch korrekt (YYYY-MM-DD).
  const absenceFor = (employeeId: string, dayIso: string): Absence | undefined =>
    absences.find(
      (a) => a.employeeId === employeeId && a.startDate <= dayIso && dayIso <= a.endDate,
    );

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [endIso, setEndIso] = useState('');

  const monthLabel = cursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} flexWrap="wrap">
        <IconButton
          size="small"
          aria-label="Voriger Monat"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, minWidth: 130, textAlign: 'center' }}>
          {monthLabel}
        </Typography>
        <IconButton
          size="small"
          aria-label="Nächster Monat"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        <Typography variant="caption" color="text.secondary">
          Klick auf einen Mitarbeiter-Block: Krankschreibung/Urlaub ab diesem Tag.
        </Typography>
        {absencesQuery.isError && (
          <Typography variant="caption" color="error">
            Abwesenheiten konnten nicht geladen werden.
          </Typography>
        )}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {WEEKDAYS.map((w) => (
          <Typography key={w} variant="caption" sx={{ fontWeight: 700, textAlign: 'center' }}>
            {w}
          </Typography>
        ))}
        {days.map((day) => {
          const dayIso = iso(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const dayKey = DAY_KEYS[(day.getDay() + 6) % 7] ?? 'mon';
          const frei: string[] = [];
          const blocks: {
            emp: EmployeeListItem;
            model: ShiftModelName;
            absence: Absence | undefined;
          }[] = [];
          for (const emp of workers) {
            const dayPlan = emp.weeklyPattern?.[dayKey];
            const model = (dayPlan ? modelOfDay(dayPlan) : 'Frei') as ShiftModelName;
            const absence = absenceFor(emp.id, dayIso);
            if (model === 'Frei' && absence === undefined) {
              frei.push(emp.displayName);
              continue;
            }
            blocks.push({ emp, model, absence });
          }
          return (
            <Box
              key={dayIso}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 0.5,
                minHeight: 92,
                p: 0.5,
                opacity: inMonth ? 1 : 0.45,
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {day.getDate()}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mt: 0.25 }}>
                {blocks.map(({ emp, model, absence }) => (
                  <Tooltip
                    key={emp.id}
                    title={`${emp.displayName} · ${model}${
                      absence ? ` · ${ABSENCE_LABEL[absence.kind]} bis ${absence.endDate}` : ''
                    } — Klick für Krank/Urlaub`}
                  >
                    <Box
                      onClick={(e) => {
                        setMenu({
                          mouseX: e.clientX,
                          mouseY: e.clientY,
                          employee: emp,
                          dayIso,
                          absence,
                        });
                      }}
                      sx={{
                        px: 0.5,
                        borderRadius: 0.25,
                        fontSize: '0.58rem',
                        lineHeight: 1.7,
                        bgcolor: SHIFT_MODEL_COLORS[model],
                        color: 'rgba(0,0,0,0.8)',
                        textDecoration: absence ? 'line-through' : 'none',
                        opacity: absence ? 0.75 : 1,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {kurzName(emp.displayName)}
                    </Box>
                  </Tooltip>
                ))}
                {frei.length > 0 && (
                  <Tooltip title={`Frei: ${frei.join(', ')}`}>
                    <Box
                      sx={{
                        px: 0.5,
                        borderRadius: 0.25,
                        fontSize: '0.58rem',
                        lineHeight: 1.7,
                        bgcolor: SHIFT_MODEL_COLORS.Frei,
                        color: 'rgba(0,0,0,0.8)',
                      }}
                    >
                      Frei ×{frei.length}
                    </Box>
                  </Tooltip>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu !== null ? { top: menu.mouseY, left: menu.mouseX } : undefined}
      >
        <MenuItem
          onClick={() => {
            if (menu !== null) {
              setDialog({ employee: menu.employee, kind: 'krank', startIso: menu.dayIso });
              setEndIso(menu.dayIso);
            }
            setMenu(null);
          }}
        >
          Krankschreibung ab {menu?.dayIso}…
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu !== null) {
              setDialog({ employee: menu.employee, kind: 'urlaub', startIso: menu.dayIso });
              setEndIso(menu.dayIso);
            }
            setMenu(null);
          }}
        >
          Urlaub ab {menu?.dayIso}…
        </MenuItem>
        {menu?.absence !== undefined && (
          <MenuItem
            onClick={() => {
              if (menu.absence !== undefined) deleteMut.mutate(menu.absence.id);
              setMenu(null);
            }}
          >
            Abwesenheit entfernen ({ABSENCE_LABEL[menu.absence.kind]} bis {menu.absence.endDate})
          </MenuItem>
        )}
      </Menu>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)}>
        <DialogTitle>
          {dialog?.kind === 'krank' ? 'Krankschreibung' : 'Urlaub'} — {dialog?.employee.displayName}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2">
              Von <b>{dialog?.startIso}</b> — bis wann mindestens?
            </Typography>
            <TextField
              type="date"
              size="small"
              label="Bis (einschließlich)"
              value={endIso}
              onChange={(e) => setEndIso(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dialog?.startIso } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Abbrechen</Button>
          <Button
            variant="contained"
            disabled={
              endIso === '' || (dialog !== null && endIso < dialog.startIso) || createMut.isPending
            }
            onClick={() => {
              if (dialog !== null) {
                createMut.mutate({
                  employeeId: dialog.employee.id,
                  kind: dialog.kind,
                  startDate: dialog.startIso,
                  endDate: endIso,
                });
                setDialog(null);
              }
            }}
          >
            Eintragen
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
