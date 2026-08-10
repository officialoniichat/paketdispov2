/**
 * Mitarbeiter-Stammdaten (concept §d Screen 2). WHO + per-head capacity params only:
 * Rolle (read-only), aktiv, Skill-Stufe/Arbeitsplatz, Produktivität, Mitarbeiter-App-PIN,
 * plus das read-only Skill-Radar. Arbeitszeit/Schichten leben im separaten Schichtplan-
 * Tab — nicht hier.
 *
 * Bereiche werden hier BEWUSST nicht mehr gepflegt (Kundenfeedback 07.08.2026): „Jeder
 * MA macht alles." Das Feld existiert weiter am Mitarbeiter (die Engine nutzt es), es
 * gibt hier nur keine Einstellmöglichkeit mehr.
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
  deleteEmployee,
  EmployeeDeleteBlockedError,
  fetchEmployee,
  fetchWorkstations,
  resetEmployeePin,
  updateEmployeeProfile,
  type EmployeeDeleteBlocker,
  type EmployeeDetail,
  type EmployeeProfileUpdate,
  type Workstation,
} from '../../data/employees.js';
import { formatAuditAction } from '../../data/audit.js';
import { SkillRadar } from './SkillRadar.js';
import { employeeRoleLabels, shiftSourceLabels } from '@paket/ui';
import { toEmployeeRole, toEventType, toShiftSource } from '../../data/narrow.js';

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
          Rolle: {emp.roles.map((r) => employeeRoleLabels[toEmployeeRole(r)]).join(', ')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Heute geplant: {emp.netCapacityToday} min{' '}
          {emp.todayShift
            ? `(${shiftSourceLabels[toShiftSource(emp.todayShift.source)]})`
            : '· keine Schicht'}
          {' '}· Arbeitszeit im Tab „Schichtplan“
        </Typography>
      </div>

      <ProfileSection emp={emp} onSaved={onSaved} />
      <Divider />
      <SkillRadarSection emp={emp} />
      <Divider />
      <ParamsSection emp={emp} onSaved={onSaved} />
      <Divider />
      <PinSection emp={emp} onSaved={onSaved} />
      <Divider />
      <AuditSection emp={emp} />
      <Divider />
      <DeleteSection emp={emp} onSaved={onSaved} onDeleted={onChanged} />
    </Stack>
  );
}

/**
 * Mitarbeiter löschen — mit dem Schutz, den das Backend setzt. Das Cockpit kennt die
 * Regel nicht, es zeigt nur die Gründe, die der Server im 409 mitschickt, und bietet
 * dann den vorgesehenen Ausweg an: deaktivieren statt löschen.
 */
function DeleteSection({
  emp,
  onSaved,
  onDeleted,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
  onDeleted: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<EmployeeDeleteBlocker[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const deletion = useMutation({
    mutationFn: () => deleteEmployee(emp.id),
    onSuccess: () => {
      setOpen(false);
      onDeleted();
    },
    onError: (error: Error) => {
      if (error instanceof EmployeeDeleteBlockedError) {
        setBlocked(error.blockers);
        setFailure(error.message);
      } else {
        setBlocked(null);
        setFailure(error.message);
      }
    },
  });

  const deactivation = useMutation({
    mutationFn: () => updateEmployeeProfile(emp.id, { active: false }),
    onSuccess: (saved) => {
      onSaved(saved);
      setOpen(false);
    },
  });

  const openDialog = (): void => {
    setBlocked(null);
    setFailure(null);
    setOpen(true);
  };

  return (
    <Stack spacing={1} alignItems="flex-start">
      <Typography variant="subtitle2">Mitarbeiter entfernen</Typography>
      <Typography variant="body2" color="text.secondary">
        Löschen geht nur, solange nichts Operatives an der Person hängt. Wer schon
        gearbeitet hat, wird deaktiviert — dann verschwindet er aus Planung und Auswahl,
        die Historie bleibt lesbar.
      </Typography>
      <Button size="small" color="error" variant="outlined" onClick={openDialog}>
        Mitarbeiter löschen …
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {emp.displayName} (#{emp.employeeNo}) löschen?
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {blocked === null && failure === null && (
              <Typography variant="body2">
                Der Datensatz wird endgültig entfernt, zusammen mit geplanten Schichten,
                Abwesenheiten und Nachrichten dieser Person. Das lässt sich nicht rückgängig
                machen.
              </Typography>
            )}
            {failure !== null && (
              <Alert severity={blocked ? 'warning' : 'error'}>
                {failure}
                {blocked && blocked.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingInlineStart: 20 }}>
                    {blocked.map((b) => (
                      <li key={b.code}>{b.message}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Abbrechen</Button>
          {blocked !== null && emp.active && (
            <Button
              variant="contained"
              onClick={() => deactivation.mutate()}
              disabled={deactivation.isPending}
            >
              Stattdessen deaktivieren
            </Button>
          )}
          {blocked === null && (
            <Button
              color="error"
              variant="contained"
              onClick={() => deletion.mutate()}
              disabled={deletion.isPending}
            >
              Endgültig löschen
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/**
 * Anzeigename bearbeiten. Gespeichert wird beim Verlassen des Feldes (und mit Enter),
 * nicht bei jedem Tastendruck — sonst liefe je Buchstabe ein PATCH. Ein leerer oder zu
 * kurzer Name fällt auf den gespeicherten Wert zurück; die Regel selbst prüft das Backend.
 */
function NameField({
  emp,
  onSave,
}: {
  emp: EmployeeDetail;
  onSave: (displayName: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(emp.displayName);
  useEffect(() => setDraft(emp.displayName), [emp.displayName]);

  const commit = (): void => {
    const next = draft.trim();
    if (next.length < 2) {
      setDraft(emp.displayName);
      return;
    }
    if (next !== emp.displayName) onSave(next);
  };

  return (
    <TextField
      size="small"
      label="Anzeigename"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(emp.displayName);
      }}
      helperText="So erscheint die Person in Board, Bündeln und Auswertungen."
      sx={{ maxWidth: 360 }}
    />
  );
}

function ProfileSection({
  emp,
  onSaved,
}: {
  emp: EmployeeDetail;
  onSaved: (e: EmployeeDetail) => void;
}): JSX.Element {
  const mutation = useMutation({
    mutationFn: ([id, patch]: ProfilePatchArgs) => updateEmployeeProfile(id, patch),
    onSuccess: onSaved,
  });
  const save = (patch: EmployeeProfileUpdate): void => {
    mutation.mutate([emp.id, patch]);
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Stammdaten</Typography>
      <NameField emp={emp} onSave={(displayName) => save({ displayName })} />
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
      <SaveFeedback mutation={mutation} />
    </Stack>
  );
}

/**
 * Können-Profil statt Bereichs-Auswahl (Kundenfeedback 07.08.2026). Die Kundin:
 * „Diese Bereiche werden grundsätzlich nicht benötigt … Es gibt keine Mitarbeiter,
 * die nur z. B. HW bearbeiten. Jeder MA macht alles." Deshalb gibt es hier nichts
 * mehr einzustellen — nur noch etwas zu sehen.
 */
function SkillRadarSection({ emp }: { emp: EmployeeDetail }): JSX.Element {
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Skill-Radar</Typography>
      <Alert severity="info" variant="outlined">
        Vorschau — die Werte sind Platzhalter und werden künftig algorithmisch aus echten
        Arbeitsdaten (ZST, Problemquote) berechnet.
      </Alert>
      <SkillRadar employeeNo={emp.employeeNo} />
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
        <Typography variant="body2">Produktivitätsfaktor: {productivity.toFixed(2).replace('.', ',')}</Typography>
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
 * Mitarbeiter-App-Login (Auth Task 4/5): admin setzt/setzt zurück die PIN, mit der
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
      <Typography variant="subtitle2">Mitarbeiter-App-Anmeldung</Typography>
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
