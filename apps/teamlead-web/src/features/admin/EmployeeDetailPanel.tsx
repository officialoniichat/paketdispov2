/**
 * Mitarbeiter-Stammdaten (concept §d Screen 2). WHO + per-head capacity params only:
 * Rolle (read-only), aktiv, Bereich/Skill, Produktivität, Employee-App-PIN.
 * Arbeitszeit/Schichten live in the separate Schichtplan tab — not here.
 */
import { useEffect, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { SkillTier } from '@paket/domain-types';
import {
  fetchEmployee,
  fetchWorkstations,
  resetEmployeePin,
  updateEmployeeProfile,
  type EmployeeDetail,
  type EmployeeProfileUpdate,
  type Workstation,
} from '../../data/employees.js';
import { useBereichCatalog } from '../../data/bereichCatalog.js';
import { formatAuditAction } from '../../data/audit.js';
import { toEventType } from '../../data/narrow.js';

/** PIN-Login: 4–8 Ziffern (matches the backend's Length(4,8) validation). */
const PIN_PATTERN = /^\d{4,8}$/;

type ProfilePatchArgs = [string, EmployeeProfileUpdate];

/** Die 5-stufige Skill-Leiter (Auswahl-Reihenfolge = Können absteigend). */
const SKILL_TIERS: { value: SkillTier; label: string }[] = [
  { value: 'profi', label: 'Profi' },
  { value: 'fortgeschritten', label: 'Fortgeschritten' },
  { value: 'basis', label: 'Basis' },
  { value: 'starter', label: 'Starter' },
  { value: 'dummy', label: 'Dummy' },
];

/** Sentinel value for the clearable Arbeitsplatz select ('' = kein Tisch). */
const NO_WORKSTATION = '';

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

  const onSaved = (saved: EmployeeDetail): void => {
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
          Rolle: {emp.roles.join(', ')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Heute geplant: {emp.netCapacityToday} min{' '}
          {emp.todayShift ? `(${emp.todayShift.source})` : '· keine Schicht'}
          {' '}· Arbeitszeit im Tab „Schichtplan“
        </Typography>
      </div>

      <ProfileSection emp={emp} onSaved={onSaved} />
      <Divider />
      <ParamsSection emp={emp} onSaved={onSaved} />
      <Divider />
      <PinSection emp={emp} onSaved={onSaved} />
      <Divider />
      <AuditSection emp={emp} />
    </Stack>
  );
}

function ProfileSection({
  emp,
  onSaved,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const catalog = useBereichCatalog();
  const mutation = useMutation({
    mutationFn: ([id, patch]: ProfilePatchArgs) => updateEmployeeProfile(id, patch),
    onSuccess: onSaved,
  });
  const save = (patch: EmployeeProfileUpdate): void => {
    mutation.mutate([emp.id, patch]);
  };
  const toggle = (bereich: string): void => {
    const next = emp.bereiche.includes(bereich)
      ? emp.bereiche.filter((b) => b !== bereich)
      : [...emp.bereiche, bereich];
    save({ bereiche: next });
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Stammdaten</Typography>
      <FormControlLabel
        control={<Switch checked={emp.active} onChange={(e) => save({ active: e.target.checked })} />}
        label="Aktiv"
      />
      <FormControlLabel
        control={<Switch checked={!emp.measured} onChange={(e) => save({ measured: !e.target.checked })} />}
        label="Temporäre Kraft (Azubi/Aushilfe – ohne Leistungsmessung)"
      />
      <Typography variant="caption" color="text.secondary">
        Temp-Kräfte können wie alle Mitarbeiter (manuell/automatisch) Belege bekommen, zählen
        aber nicht in die Produktivitäts-/ZST-Leistung. Der Durchsatz bleibt sichtbar.
      </Typography>
      <SkillWorkstationFields emp={emp} save={save} />
      <div>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Bereich / Skill {emp.bereiche.length === 0 && '· Allrounder (übernimmt alles)'}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {catalog.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              Kein Katalog gepflegt – im Tab „Bereiche" anlegen.
            </Typography>
          )}
          {catalog.map((b) => (
            <Chip
              key={b}
              label={b}
              size="small"
              color={emp.bereiche.includes(b) ? 'primary' : 'default'}
              variant={emp.bereiche.includes(b) ? 'filled' : 'outlined'}
              onClick={() => toggle(b)}
            />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Belege dieses Bereichs werden bevorzugt zugeteilt; fehlt ein Spezialist, springt jeder ein.
        </Typography>
      </div>
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

/** Skill-Stufe (5er-Leiter) + Arbeitsplatz/Tisch — beide direkt per PATCH gespeichert. */
function SkillWorkstationFields({
  emp,
  save,
}: {
  emp: EmployeeDetail;
  save: (patch: EmployeeProfileUpdate) => void;
}): JSX.Element {
  const workstations = useQuery<Workstation[], Error>({
    queryKey: ['admin', 'workstations'],
    queryFn: fetchWorkstations,
  });

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <Stack spacing={0.5} sx={{ flex: 1 }}>
        <TextField
          select
          size="small"
          label="Skill-Stufe"
          value={emp.skillTier}
          onChange={(e) => save({ skillTier: e.target.value })}
        >
          {SKILL_TIERS.map((t) => (
            <MenuItem key={t.value} value={t.value}>
              {t.label}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary">
          Profi = alles automatisch; Starter/Dummy = nur manuelle Zuteilung.
        </Typography>
      </Stack>
      <Stack spacing={0.5} sx={{ flex: 1 }}>
        <TextField
          select
          size="small"
          label="Arbeitsplatz / Tisch"
          value={emp.workstationId ?? NO_WORKSTATION}
          onChange={(e) =>
            save({ workstationId: e.target.value === NO_WORKSTATION ? null : e.target.value })
          }
          disabled={workstations.isLoading}
        >
          <MenuItem value={NO_WORKSTATION}>— kein Tisch —</MenuItem>
          {(workstations.data ?? []).map((w) => (
            <MenuItem key={w.id} value={w.id}>
              {w.code} · {w.name}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary">
          Fester Tisch optional — ohne Zuweisung bleibt die Person (z. B. Dummy) flexibel.
        </Typography>
        {workstations.error && (
          <Typography variant="caption" color="error">
            Arbeitsplätze konnten nicht geladen werden: {workstations.error.message}
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}

function ParamsSection({
  emp,
  onSaved,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const [productivity, setProductivity] = useState(emp.productivityFactor);
  useEffect(() => {
    setProductivity(emp.productivityFactor);
  }, [emp.productivityFactor]);

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
          Skaliert die geplante Netto-Kapazität dieser Person.
        </Typography>
      </div>
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

/**
 * Employee-App-Login (Auth Task 4/5): admin setzt/setzt zurück die PIN, mit der
 * sich diese Person am Mitarbeiter-Tablet anmeldet (Mitarbeiternummer + PIN).
 * Die PIN selbst wird nie angezeigt oder vom Backend zurückgegeben — nur ob
 * eine gesetzt ist (`hasPinSet`).
 */
function PinSection({
  emp,
  onSaved,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [validationError, setValidationError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (newPin: string) => resetEmployeePin(emp.id, newPin),
    onSuccess: () => {
      onSaved({ ...emp, hasPinSet: true });
      setOpen(false);
      setPin('');
      setConfirmPin('');
    },
  });

  const openDialog = (): void => {
    setPin('');
    setConfirmPin('');
    setValidationError(undefined);
    mutation.reset();
    setOpen(true);
  };

  const submit = (): void => {
    if (!PIN_PATTERN.test(pin)) {
      setValidationError('PIN muss 4–8 Ziffern haben.');
      return;
    }
    if (pin !== confirmPin) {
      setValidationError('PINs stimmen nicht überein.');
      return;
    }
    setValidationError(undefined);
    mutation.mutate(pin);
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Employee-App-Anmeldung</Typography>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Chip
          size="small"
          color={emp.hasPinSet ? 'success' : 'default'}
          label={emp.hasPinSet ? 'PIN gesetzt' : 'Keine PIN gesetzt'}
        />
        <Button size="small" variant="outlined" onClick={openDialog}>
          {emp.hasPinSet ? 'PIN zurücksetzen' : 'PIN setzen'}
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Mit Mitarbeiternummer #{emp.employeeNo} + dieser PIN meldet sich die Person am
        Mitarbeiter-Tablet an. Die PIN ist nach dem Speichern nicht mehr einsehbar.
      </Typography>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{emp.hasPinSet ? 'PIN zurücksetzen' : 'PIN setzen'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Neue PIN für {emp.displayName} (#{emp.employeeNo}), 4–8 Ziffern.
            </Typography>
            <TextField
              autoFocus
              fullWidth
              label="Neue PIN"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <TextField
              fullWidth
              label="PIN wiederholen"
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
            />
            {validationError ? <Alert severity="error">{validationError}</Alert> : null}
            {mutation.error ? (
              <Alert severity="error">
                Speichern fehlgeschlagen: {mutation.error.message}
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Speichert…' : 'Speichern'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

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
          {new Date(a.at).toLocaleString('de-DE')} · {formatAuditAction(toEventType(a.eventType))}
        </Typography>
      ))}
    </Stack>
  );
}

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
