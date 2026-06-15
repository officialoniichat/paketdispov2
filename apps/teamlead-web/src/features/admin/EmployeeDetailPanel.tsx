/**
 * Mitarbeiter-Detail (concept §d Screens 2/3/5). Profile + per-head capacity/effort
 * params, today's shift override, weekly pattern and absence — all wired to
 * `/api/admin/employees/*`. Netto-Minuten are derived server-side and echoed back,
 * so this panel only edits the human-readable inputs (concept Prinzip 3).
 */
import { useEffect, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  createAbsence,
  fetchEmployee,
  overrideShift,
  updateEmployeeProfile,
  type EmployeeDetail,
  type EmployeeProfileUpdate,
  type WeeklyPattern,
} from '../../data/employees.js';

const WEEKDAYS: { key: keyof WeeklyPattern; label: string }[] = [
  { key: 'mon', label: 'Mo' },
  { key: 'tue', label: 'Di' },
  { key: 'wed', label: 'Mi' },
  { key: 'thu', label: 'Do' },
  { key: 'fri', label: 'Fr' },
  { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'So' },
];

const SHIFT_MODELS: Record<string, { start: string; end: string; breakMinutes: number } | null> = {
  Frühschicht: { start: '06:00', end: '14:00', breakMinutes: 30 },
  Spätschicht: { start: '10:00', end: '18:00', breakMinutes: 30 },
  Frei: null,
};

const ABSENCE_KINDS = ['krank', 'urlaub', 'abwesend', 'teilabwesend'] as const;

type ProfilePatchArgs = [string, EmployeeProfileUpdate];

interface EmployeeDetailPanelProps {
  employeeId: string;
  date: string;
  onChanged: () => void;
}

export function EmployeeDetailPanel({
  employeeId,
  date,
  onChanged,
}: EmployeeDetailPanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const queryKey = ['admin', 'employee', employeeId, date] as const;
  const query = useQuery<EmployeeDetail, Error>({
    queryKey,
    queryFn: () => fetchEmployee(employeeId, date),
  });

  const onMutated = (saved: EmployeeDetail): void => {
    queryClient.setQueryData(queryKey, saved);
    onChanged();
  };

  if (query.isLoading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          Mitarbeiter wird geladen…
        </Typography>
      </Stack>
    );
  }
  if (query.error || !query.data) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Mitarbeiter konnte nicht geladen werden: {query.error?.message}
      </Alert>
    );
  }

  const emp = query.data;
  return (
    <Stack spacing={3} sx={{ p: 2 }}>
      <div>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          {emp.displayName} · #{emp.employeeNo}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {emp.roles.join(', ')} {emp.isPilot ? '· Pilot-Login ✓' : ''}
        </Typography>
      </div>

      <ProfileSection emp={emp} onSaved={onMutated} />
      <Divider />
      <ParamsSection emp={emp} onSaved={onMutated} />
      <Divider />
      <ShiftSection emp={emp} date={date} onSaved={onMutated} />
      <Divider />
      <WeeklyPatternSection emp={emp} onSaved={onMutated} />
      <Divider />
      <AbsenceSection emp={emp} date={date} onSaved={onMutated} />
      <Divider />
      <AuditSection emp={emp} />
    </Stack>
  );
}

// --- Profile (active / pilot / area tags) -----------------------------------

function ProfileSection({
  emp,
  onSaved,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const [areaInput, setAreaInput] = useState('');
  const mutation = useMutation({
    mutationFn: ([id, patch]: ProfilePatchArgs) => updateEmployeeProfile(id, patch),
    onSuccess: onSaved,
  });
  const save = (patch: EmployeeProfileUpdate): void => {
    mutation.mutate([emp.id, patch]);
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Profil</Typography>
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
        <FormControlLabel
          control={<Switch checked={emp.active} onChange={(e) => save({ active: e.target.checked })} />}
          label="Aktiv"
        />
        <FormControlLabel
          control={<Switch checked={emp.isPilot} onChange={(e) => save({ isPilot: e.target.checked })} />}
          label="Pilot-Login"
        />
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          Bereich/Skill:
        </Typography>
        {emp.areaTags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            onDelete={() => save({ areaTags: emp.areaTags.filter((t) => t !== tag) })}
          />
        ))}
        <TextField
          size="small"
          placeholder="+ Bereich"
          value={areaInput}
          onChange={(e) => setAreaInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && areaInput.trim()) {
              save({ areaTags: [...emp.areaTags, areaInput.trim()] });
              setAreaInput('');
            }
          }}
          sx={{ width: 140 }}
        />
      </Stack>
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

// --- Capacity/effort params (productivity, overtime) ------------------------

function ParamsSection({
  emp,
  onSaved,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const [productivity, setProductivity] = useState(emp.productivityFactor);
  const [overtime, setOvertime] = useState(emp.overtimeTolerancePct);
  useEffect(() => {
    setProductivity(emp.productivityFactor);
    setOvertime(emp.overtimeTolerancePct);
  }, [emp.productivityFactor, emp.overtimeTolerancePct]);

  const mutation = useMutation({
    mutationFn: ([id, patch]: ProfilePatchArgs) => updateEmployeeProfile(id, patch),
    onSuccess: onSaved,
  });

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Einsatz-Parameter</Typography>
      <div>
        <Typography variant="body2">Produktivitätsfaktor: {productivity.toFixed(2)}</Typography>
        <Slider
          value={productivity}
          min={0.5}
          max={1.2}
          step={0.05}
          marks={[
            { value: 0.5, label: '0,5' },
            { value: 1, label: '1,0' },
            { value: 1.2, label: '1,2' },
          ]}
          onChange={(_, v) => setProductivity(v as number)}
          onChangeCommitted={(_, v) => mutation.mutate([emp.id, { productivityFactor: v as number }])}
        />
        <Typography variant="caption" color="text.secondary">
          Skaliert die Netto-Minuten dieser Person.
        </Typography>
      </div>
      <div>
        <Typography variant="body2">Überstunden-Toleranz: +{overtime}%</Typography>
        <Slider
          value={overtime}
          min={0}
          max={25}
          step={1}
          marks={[
            { value: 0, label: '0' },
            { value: 25, label: '+25%' },
          ]}
          onChange={(_, v) => setOvertime(v as number)}
          onChangeCommitted={(_, v) => mutation.mutate([emp.id, { overtimeTolerancePct: v as number }])}
        />
        <Typography variant="caption" color="text.secondary">
          Bis hierhin verteilt die Engine ohne ⚠. Aufwand pro Beleg (§8.2) bleibt im Tab „Aufwand“.
        </Typography>
      </div>
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

// --- Today's shift override -------------------------------------------------

function ShiftSection({
  emp,
  date,
  onSaved,
}: {
  emp: EmployeeDetail;
  date: string;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const shift = emp.todayShift;
  const [start, setStart] = useState(shift?.plannedStart ?? '06:00');
  const [end, setEnd] = useState(shift?.plannedEnd ?? '14:00');
  const [breakMin, setBreakMin] = useState(shift?.breakMinutes ?? 30);
  const [partTime, setPartTime] = useState(100);
  const [active, setActive] = useState(shift?.active ?? true);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      overrideShift(emp.id, {
        date,
        plannedStart: start,
        plannedEnd: end,
        breakMinutes: breakMin,
        partTimePct: partTime,
        active,
        reason: reason || undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Schicht heute ({date})</Typography>
      <Typography variant="caption" color="text.secondary">
        Quelle: {shift?.source ?? '—'} · Netto aktuell: {shift?.netCapacityMinutes ?? 0} min
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <TextField size="small" label="Start" value={start} onChange={(e) => setStart(e.target.value)} sx={{ width: 100 }} />
        <TextField size="small" label="Ende" value={end} onChange={(e) => setEnd(e.target.value)} sx={{ width: 100 }} />
        <TextField size="small" type="number" label="Pause (min)" value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} sx={{ width: 110 }} />
        <TextField size="small" type="number" label="Teilzeit %" value={partTime} onChange={(e) => setPartTime(Number(e.target.value))} sx={{ width: 110 }} />
        <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="aktiv" />
      </Stack>
      <TextField size="small" label="Grund (Audit §8.4)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Schicht überschreiben
      </Button>
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

// --- Weekly pattern ---------------------------------------------------------

function emptyDay(): WeeklyPattern['mon'] {
  return { working: false, breakMinutes: 0, partTimePct: 100 };
}

function blankPattern(): WeeklyPattern {
  return {
    mon: emptyDay(),
    tue: emptyDay(),
    wed: emptyDay(),
    thu: emptyDay(),
    fri: emptyDay(),
    sat: emptyDay(),
    sun: emptyDay(),
  };
}

function WeeklyPatternSection({
  emp,
  onSaved,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const [pattern, setPattern] = useState<WeeklyPattern>(emp.weeklyPattern ?? blankPattern());
  useEffect(() => setPattern(emp.weeklyPattern ?? blankPattern()), [emp.id, emp.weeklyPattern]);

  const mutation = useMutation({
    mutationFn: () => updateEmployeeProfile(emp.id, { weeklyPattern: pattern }),
    onSuccess: onSaved,
  });

  const applyModel = (key: keyof WeeklyPattern, model: string): void => {
    const m = SHIFT_MODELS[model];
    setPattern((p) => ({
      ...p,
      [key]: m
        ? { working: true, shiftModel: model, start: m.start, end: m.end, breakMinutes: m.breakMinutes, partTimePct: 100 }
        : emptyDay(),
    }));
  };

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Wochenmuster</Typography>
      {WEEKDAYS.map(({ key, label }) => {
        const day = pattern[key];
        return (
          <Stack key={key} direction="row" spacing={1} alignItems="center">
            <Typography sx={{ width: 28 }}>{label}</Typography>
            <TextField
              select
              size="small"
              value={day.working ? (day.shiftModel ?? 'Frühschicht') : 'Frei'}
              onChange={(e) => applyModel(key, e.target.value)}
              sx={{ width: 150 }}
            >
              {Object.keys(SHIFT_MODELS).map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="body2" color="text.secondary">
              {day.working ? `${day.start}–${day.end} · ${day.breakMinutes} min Pause` : 'frei'}
            </Typography>
          </Stack>
        );
      })}
      <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Muster speichern
      </Button>
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

// --- Absence ----------------------------------------------------------------

function AbsenceSection({
  emp,
  date,
  onSaved,
}: {
  emp: EmployeeDetail;
  date: string;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const [kind, setKind] = useState<(typeof ABSENCE_KINDS)[number]>('krank');
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [partialUntil, setPartialUntil] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createAbsence(emp.id, {
        dateFrom: from,
        dateTo: to,
        kind,
        partialUntil: kind === 'teilabwesend' && partialUntil ? partialUntil : undefined,
        reason: reason || undefined,
      }),
    onSuccess: onSaved,
  });

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Abwesenheit melden</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <TextField select size="small" label="Art" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} sx={{ width: 150 }}>
          {ABSENCE_KINDS.map((k) => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" label="Von" value={from} onChange={(e) => setFrom(e.target.value)} sx={{ width: 140 }} />
        <TextField size="small" label="Bis" value={to} onChange={(e) => setTo(e.target.value)} sx={{ width: 140 }} />
        {kind === 'teilabwesend' && (
          <TextField size="small" label="anwesend bis" value={partialUntil} onChange={(e) => setPartialUntil(e.target.value)} sx={{ width: 120 }} />
        )}
      </Stack>
      <TextField size="small" label="Grund (Audit §8.4)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button color="warning" variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Melden
      </Button>
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

// --- Audit ------------------------------------------------------------------

function AuditSection({ emp }: { emp: EmployeeDetail }): JSX.Element {
  if (emp.recentAudit.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        Noch keine Änderungen auditiert.
      </Typography>
    );
  }
  return (
    <Stack spacing={0.5}>
      <Typography variant="subtitle2">Audit (§8.4)</Typography>
      {emp.recentAudit.map((a, i) => (
        <Typography key={i} variant="caption" color="text.secondary">
          {new Date(a.at).toLocaleString('de-DE')} · {a.eventType}
        </Typography>
      ))}
    </Stack>
  );
}

// --- shared save feedback ---------------------------------------------------

function SaveFeedback({
  mutation,
}: {
  mutation: { isSuccess: boolean; error: Error | null };
}): JSX.Element | null {
  if (mutation.isSuccess) {
    return (
      <Alert severity="success" sx={{ py: 0 }}>
        Gespeichert.
      </Alert>
    );
  }
  if (mutation.error) {
    return (
      <Alert severity="error" sx={{ py: 0 }}>
        Speichern fehlgeschlagen: {mutation.error.message}
      </Alert>
    );
  }
  return null;
}
