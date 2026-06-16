/**
 * Mitarbeiter-Stammdaten (concept §d Screen 2). WHO + per-head capacity params only:
 * Rolle (read-only), aktiv, Bereich/Skill, Produktivität, Überstunden-Toleranz.
 * Arbeitszeit/Schichten live in the separate Schichtplan tab — not here.
 */
import { useEffect, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import {
  fetchEmployee,
  updateEmployeeProfile,
  type EmployeeDetail,
  type EmployeeProfileUpdate,
} from '../../data/employees.js';
import { useBereichCatalog } from '../../data/bereichCatalog.js';

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
          Skaliert die geplante Netto-Kapazität dieser Person.
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
          Aufwand pro Beleg (§8.2) bleibt im Tab „Aufwand“.
        </Typography>
      </div>
      <SaveFeedback mutation={mutation} />
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
          {new Date(a.at).toLocaleString('de-DE')} · {a.eventType}
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
