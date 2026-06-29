/**
 * Admin- und Konfigurations-UX (§11). Regelpflege für Priorität, Reserve,
 * Bündelgröße, Aufwand, Verladeplan und Parser, plus LocationMaster-Pflege
 * (§11.2 – simple Lagerplatzliste, no routing graph in the MVP).
 *
 * The structured RuleConfig is loaded from and saved to the real backend
 * (`/api/admin/rules`) via {@link ../../data/admin}; loadPlan is a read-only list.
 * Lagerplätze are edited in {@link ./LocationMasterEditor}.
 */
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { RuleConfig } from '@paket/domain-types';
import { fetchRuleConfig, saveRuleConfig } from '../../data/admin.js';
import { LocationMasterEditor } from './LocationMasterEditor.js';
import { EffortPreview } from './EffortPreview.js';
import { EmployeeSettings } from './EmployeeSettings.js';
import { SchichtplanTab } from './SchichtplanTab.js';
import { IntegrationenTab } from './IntegrationenTab.js';

const TABS = [
  'Priorität',
  'Reserve',
  'Bündel',
  'Aufwand',
  'Lieferungen',
  'Verladeplan',
  'Lagerplätze',
  'Mitarbeiter',
  'Schichtplan',
  'Integrationen',
  'Schichtende',
];

/** Delivery-Group detection tab (Teamlead-Anforderung Punkt 1). */
const GROUPING_TAB = 4;
/** Read-only Verladeplan tab (display only — no save button). */
const LOADPLAN_TAB = 5;
/** RuleConfig-form tab index for the Schichtende-Cutoff (Punkt 5). */
const SHIFT_END_TAB = 10;

/** Tab indices that render a self-contained editor instead of the RuleConfig form. */
const LOCATIONS_TAB = 6;
const EMPLOYEES_TAB = 7;
const SCHICHTPLAN_TAB = 8;
const INTEGRATIONS_TAB = 9;

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

      {tab === INTEGRATIONS_TAB ? (
        <IntegrationenTab />
      ) : tab === SCHICHTPLAN_TAB ? (
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
                    label="Überfälligkeits-Vorlauf (Tage)"
                    value={draft.priority.overdueLeadDays}
                    onChange={(v) =>
                      patch('priority', { ...draft.priority, overdueLeadDays: v })
                    }
                    hint="So viele Tage vor dem Verladetag gilt ein Verladeplan-Beleg als überfällig und wird vorgezogen. Greift auch bei seltenen (z. B. wöchentlichen) Verladetagen. Shop-spezifische Ausnahmen siehe Verladeplan-Tab."
                  />
                  <Toggle
                    label="FIFO aktiv"
                    checked={draft.priority.fifoEnabled}
                    onChange={(v) => patch('priority', { ...draft.priority, fifoEnabled: v })}
                    hint="First-In-First-Out: bei gleicher Priorität wird der älteste Beleg zuerst zugeteilt."
                  />
                  <Toggle
                    label="Manuelle Prio gewinnt"
                    checked={draft.priority.manualPriorityWins}
                    onChange={(v) => patch('priority', { ...draft.priority, manualPriorityWins: v })}
                    hint="Ein vom Teamlead manuell gesetzter Prio-Beleg schlägt alle Automatikregeln."
                  />
                </Grid>
              )}

              {tab === 1 && (
                <Grid>
                  <Num
                    label="% nächste Frühschicht"
                    value={draft.reserve.nextShiftCapacityPct}
                    onChange={(v) => patch('reserve', { ...draft.reserve, nextShiftCapacityPct: v })}
                    hint="Anteil der morgigen Frühschicht-Kapazität, der heute als eiserne Reserve freigehalten wird."
                  />
                  <Num
                    label="Min. Minuten / MA"
                    value={draft.reserve.minMinutesPerEmployee}
                    onChange={(v) =>
                      patch('reserve', { ...draft.reserve, minMinutesPerEmployee: v })
                    }
                    hint="Mindest-Reserve in Minuten je geplantem Mitarbeiter (greift, falls der %-Wert zu klein wäre)."
                  />
                </Grid>
              )}

              {tab === 2 && (
                <Grid>
                  <Num
                    label="Min. Minuten"
                    value={draft.bundle.minMinutes}
                    onChange={(v) => patch('bundle', { ...draft.bundle, minMinutes: v })}
                    hint="Mindestaufwand je Paket; kleinere Reste werden zu einem Paket zusammengelegt."
                  />
                  <Num
                    label="Max. Minuten"
                    value={draft.bundle.maxMinutes}
                    onChange={(v) => patch('bundle', { ...draft.bundle, maxMinutes: v })}
                    hint="Maximaler Aufwand je Paket; danach wird ein neues Paket begonnen."
                  />
                  <Num
                    label="Max. Belege / Paket"
                    value={draft.bundle.maxCases}
                    onChange={(v) => patch('bundle', { ...draft.bundle, maxCases: v })}
                    hint="Höchstzahl Belege je Paket (Rollwagen-/Kapazitätsgrenze)."
                  />
                  <Num
                    label="Max. schwere Belege"
                    value={draft.bundle.maxHeavyCases}
                    onChange={(v) => patch('bundle', { ...draft.bundle, maxHeavyCases: v })}
                    hint="Höchstzahl aufwändiger Belege je Paket, damit schwer/leicht gemischt bleibt."
                  />
                </Grid>
              )}

              {tab === 3 && (
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    Faktoren sind <strong>Multiplikatoren</strong> (1,0 = neutral). Sie skalieren
                    den jeweiligen Aufwandsanteil und damit die geschätzte Bearbeitungszeit &amp;
                    Aufwandspunkte eines Belegs — die Vorschau unten rechnet live mit.
                  </Typography>
                  <Grid>
                    <Num
                      label="Faktor Etikettendruck"
                      value={draft.effort.priceLabelPrintFactor}
                      onChange={(v) =>
                        patch('effort', { ...draft.effort, priceLabelPrintFactor: v })
                      }
                      hint="Multiplikator für Drucken + Anbringen von Preisetiketten. 1,2 → 2,0 verdoppelt nahezu den Etikettier-Anteil (siehe Live-Vorschau)."
                    />
                    <Num
                      label="Faktor Sicherung"
                      value={draft.effort.securingFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, securingFactor: v })}
                      hint="Multiplikator für Warensicherung (Sicherungsetiketten/-tags) je Position."
                    />
                    <Num
                      label="Faktor Online"
                      value={draft.effort.onlineFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, onlineFactor: v })}
                      hint="Multiplikator für die zusätzliche Behandlung online-relevanter Positionen."
                    />
                    <Num
                      label="Faktor Rotpreis"
                      value={draft.effort.redPriceFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, redPriceFactor: v })}
                      hint="Multiplikator für die Auszeichnung von Rotpreis-/reduzierten Artikeln."
                    />
                    <Num
                      label="Faktor Prüfanteil"
                      value={draft.effort.checkShareFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, checkShareFactor: v })}
                      hint="Multiplikator auf den Prüf-Mehraufwand (Mengen-/Stichproben-/Vollkontrolle). Wirkt auf den Anteil über der reinen Mengenerfassung."
                    />
                    <Num
                      label="Faktor Box-Splitting"
                      value={draft.effort.boxSplittingFactor}
                      onChange={(v) =>
                        patch('effort', { ...draft.effort, boxSplittingFactor: v })
                      }
                      hint="Multiplikator je zusätzlicher Transportbox. Greift erst beim Aufteilen eines Belegs in mehrere Boxen — daher ohne Wirkung auf den Einzelbeleg in der Vorschau."
                    />
                  </Grid>
                  <EffortPreview factors={draft.effort} />
                </Stack>
              )}

              {tab === GROUPING_TAB && (
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Zusammengehörige Lieferscheine erkennen: Belege einer physischen
                    Lieferung (gleicher Lieferschein ODER fortlaufende Beleg-Nummern)
                    werden erkannt und möglichst einem Mitarbeiter zugeteilt.
                  </Typography>
                  <Grid>
                    <Toggle
                      label="Erkennung aktiv"
                      checked={draft.grouping.enabled}
                      onChange={(v) => patch('grouping', { ...draft.grouping, enabled: v })}
                      hint="Erkennt zusammengehörige Lieferscheine und hält sie bei einem Mitarbeiter zusammen."
                    />
                    <Num
                      label="Max. Beleg-Abstand"
                      value={draft.grouping.maxWeBelegGap}
                      onChange={(v) => patch('grouping', { ...draft.grouping, maxWeBelegGap: v })}
                      hint="Größter Abstand zwischen fortlaufenden Beleg-Nummern, der noch als eine Lieferung zählt (1 = streng aufeinanderfolgend)."
                    />
                  </Grid>
                </Stack>
              )}

              {tab === SHIFT_END_TAB && (
                <Grid>
                  <Num
                    label="Auto-Stopp vor Schichtende (Min.)"
                    value={draft.shiftEnd.autoCutoffMinutes}
                    onChange={(v) => patch('shiftEnd', { ...draft.shiftEnd, autoCutoffMinutes: v })}
                    hint="So viele Minuten vor Schichtende stoppt die automatische Verteilung; den Rest holen Mitarbeitende selbst aus dem Pool (0 = bis Schichtende durchverteilen)."
                  />
                </Grid>
              )}

              {tab === LOADPLAN_TAB && (
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

              {tab !== LOADPLAN_TAB && (
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

/** Hover-tooltip info marker (ⓘ) explaining a non-obvious setting. */
function InfoHint({ text }: { text: string }): JSX.Element {
  return (
    <Tooltip title={text} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Box
        component="span"
        aria-label="Erklärung"
        sx={{ cursor: 'help', color: 'text.secondary', fontSize: 16, lineHeight: 1, userSelect: 'none' }}
      >
        ⓘ
      </Box>
    </Tooltip>
  );
}

function Num({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Hover-tooltip explanation shown via an ⓘ marker in the field. */
  hint?: string;
}): JSX.Element {
  return (
    <TextField
      type="number"
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      inputProps={{ step: 'any' }}
      InputProps={
        hint
          ? {
              endAdornment: (
                <InputAdornment position="end">
                  <InfoHint text={hint} />
                </InputAdornment>
              ),
            }
          : undefined
      }
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Hover-tooltip explanation shown via an ⓘ marker next to the label. */
  hint?: string;
}): JSX.Element {
  return (
    <FormControlLabel
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          {label}
          {hint && <InfoHint text={hint} />}
        </Box>
      }
    />
  );
}
