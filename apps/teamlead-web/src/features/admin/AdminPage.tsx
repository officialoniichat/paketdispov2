/**
 * Admin- und Konfigurations-UX (§11). Regelpflege für Priorität, Reserve,
 * Bündelgröße, Aufwand, Verladeplan und Parser, plus LocationMaster-Pflege
 * (§11.2 – simple Lagerplatzliste, no routing graph in the MVP).
 *
 * The structured RuleConfig is loaded from and saved to the real backend
 * (`/api/admin/rules`) via {@link ../../data/admin}; loadPlan + parserTemplates are
 * read-only lists. Lagerplätze are edited in {@link ./LocationMasterEditor}.
 */
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { RuleConfig } from '@paket/domain-types';
import { fetchRuleConfig, saveRuleConfig } from '../../data/admin.js';
import { LocationMasterEditor } from './LocationMasterEditor.js';
import { EmployeeSettings } from './EmployeeSettings.js';
import { SchichtplanTab } from './SchichtplanTab.js';

const TABS = [
  'Priorität',
  'Reserve',
  'Bündel',
  'Aufwand',
  'Verladeplan',
  'Parser',
  'Lagerplätze',
  'Mitarbeiter',
  'Schichtplan',
];

/** Tab indices that render a self-contained editor instead of the RuleConfig form. */
const LOCATIONS_TAB = 6;
const EMPLOYEES_TAB = 7;
const SCHICHTPLAN_TAB = 8;

const RULES_QUERY_KEY = ['admin', 'rules'] as const;

export function AdminPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [draft, setDraft] = useState<RuleConfig | null>(null);

  const query = useQuery<RuleConfig, Error>({
    queryKey: RULES_QUERY_KEY,
    queryFn: fetchRuleConfig,
  });

  // Seed the editable draft from the loaded config once it arrives (and on refetch).
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const mutation = useMutation<RuleConfig, Error, RuleConfig>({
    mutationFn: saveRuleConfig,
    onSuccess: (saved) => {
      queryClient.setQueryData(RULES_QUERY_KEY, saved);
      setDraft(saved);
    },
  });

  function patch<K extends keyof RuleConfig>(key: K, value: RuleConfig[K]): void {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    mutation.reset();
  }

  function save(): void {
    if (draft) mutation.mutate(draft);
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        Admin &amp; Regelpflege
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {TABS.map((t) => (
          <Tab key={t} label={t} />
        ))}
      </Tabs>

      {tab === SCHICHTPLAN_TAB ? (
        <SchichtplanTab />
      ) : tab === EMPLOYEES_TAB ? (
        <EmployeeSettings />
      ) : tab === LOCATIONS_TAB ? (
        <LocationMasterEditor />
      ) : (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {query.isLoading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Regeln werden geladen…
              </Typography>
            </Stack>
          )}
          {query.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Regeln konnten nicht geladen werden: {query.error.message}
            </Alert>
          )}
          {mutation.isSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => mutation.reset()}>
              Regeln gespeichert.
            </Alert>
          )}
          {mutation.error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => mutation.reset()}>
              Speichern fehlgeschlagen: {mutation.error.message}
            </Alert>
          )}

          {draft && (
            <>
              {tab === 0 && (
                <Grid>
                  <Num
                    label="Gewichtung CatMan"
                    value={draft.priority.catManWeight}
                    onChange={(v) => patch('priority', { ...draft.priority, catManWeight: v })}
                  />
                  <Num
                    label="Überfälligkeitsschwelle (h)"
                    value={draft.priority.overdueThresholdHours}
                    onChange={(v) =>
                      patch('priority', { ...draft.priority, overdueThresholdHours: v })
                    }
                  />
                  <Toggle
                    label="FIFO aktiv"
                    checked={draft.priority.fifoEnabled}
                    onChange={(v) => patch('priority', { ...draft.priority, fifoEnabled: v })}
                  />
                  <Toggle
                    label="Manuelle Prio gewinnt"
                    checked={draft.priority.manualPriorityWins}
                    onChange={(v) => patch('priority', { ...draft.priority, manualPriorityWins: v })}
                  />
                </Grid>
              )}

              {tab === 1 && (
                <Grid>
                  <Num
                    label="% nächste Frühschicht"
                    value={draft.reserve.nextShiftCapacityPct}
                    onChange={(v) => patch('reserve', { ...draft.reserve, nextShiftCapacityPct: v })}
                  />
                  <Num
                    label="Min. Minuten / MA"
                    value={draft.reserve.minMinutesPerEmployee}
                    onChange={(v) =>
                      patch('reserve', { ...draft.reserve, minMinutesPerEmployee: v })
                    }
                  />
                </Grid>
              )}

              {tab === 2 && (
                <Grid>
                  <Num
                    label="Min. Minuten"
                    value={draft.bundle.minMinutes}
                    onChange={(v) => patch('bundle', { ...draft.bundle, minMinutes: v })}
                  />
                  <Num
                    label="Max. Minuten"
                    value={draft.bundle.maxMinutes}
                    onChange={(v) => patch('bundle', { ...draft.bundle, maxMinutes: v })}
                  />
                  <Num
                    label="Max. Belege / Paket"
                    value={draft.bundle.maxCases}
                    onChange={(v) => patch('bundle', { ...draft.bundle, maxCases: v })}
                  />
                  <Num
                    label="Max. schwere Belege"
                    value={draft.bundle.maxHeavyCases}
                    onChange={(v) => patch('bundle', { ...draft.bundle, maxHeavyCases: v })}
                  />
                </Grid>
              )}

              {tab === 3 && (
                <Grid>
                  <Num
                    label="Faktor Etikettendruck"
                    value={draft.effort.priceLabelPrintFactor}
                    onChange={(v) => patch('effort', { ...draft.effort, priceLabelPrintFactor: v })}
                  />
                  <Num
                    label="Faktor Sicherung"
                    value={draft.effort.securingFactor}
                    onChange={(v) => patch('effort', { ...draft.effort, securingFactor: v })}
                  />
                  <Num
                    label="Faktor Online"
                    value={draft.effort.onlineFactor}
                    onChange={(v) => patch('effort', { ...draft.effort, onlineFactor: v })}
                  />
                  <Num
                    label="Faktor Rotpreis"
                    value={draft.effort.redPriceFactor}
                    onChange={(v) => patch('effort', { ...draft.effort, redPriceFactor: v })}
                  />
                  <Num
                    label="Faktor Prüfanteil"
                    value={draft.effort.checkShareFactor}
                    onChange={(v) => patch('effort', { ...draft.effort, checkShareFactor: v })}
                  />
                  <Num
                    label="Faktor Box-Splitting"
                    value={draft.effort.boxSplittingFactor}
                    onChange={(v) => patch('effort', { ...draft.effort, boxSplittingFactor: v })}
                  />
                </Grid>
              )}

              {tab === 4 && (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Verladeplan: Shopbereich, Etage, Wochentag, gültig ab/bis, Sondertage.
                  </Typography>
                  {draft.loadPlan.map((lp) => (
                    <Typography key={lp.id} variant="body2">
                      Shopbereich {lp.shopAreaNo} · Etage {lp.floor} · {lp.weekday} · ab{' '}
                      {lp.validFrom}
                      {lp.specialDay ? ' · Sondertag' : ''}
                    </Typography>
                  ))}
                </Stack>
              )}

              {tab === 5 && (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Parser: Dokumentmuster, Pflichtfelder, Erkennungsschwellen, Fallback auf manuelle
                    Prüfung.
                  </Typography>
                  {draft.parserTemplates.map((pt) => (
                    <Typography key={pt.id} variant="body2">
                      {pt.name} · Pflichtfelder: {pt.requiredFields.join(', ')} · Schwelle{' '}
                      {pt.detectionThreshold}
                      {pt.fallbackToManual ? ' · Fallback manuell' : ''}
                    </Typography>
                  ))}
                </Stack>
              )}

              {tab !== 4 && tab !== 5 && (
                <Button
                  variant="contained"
                  sx={{ mt: 2 }}
                  onClick={save}
                  disabled={mutation.isPending}
                >
                  Regeln speichern
                </Button>
              )}
            </>
          )}
        </Paper>
      )}
    </Stack>
  );
}

function Grid({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
      }}
    >
      {children}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <TextField
      type="number"
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      inputProps={{ step: 'any' }}
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <FormControlLabel
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={label}
    />
  );
}
