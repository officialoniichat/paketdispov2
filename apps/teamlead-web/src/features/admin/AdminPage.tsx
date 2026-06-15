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
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { RuleConfig } from '@paket/domain-types';
import { fetchRuleConfig, saveRuleConfig } from '../../data/admin.js';
import { LocationMasterEditor } from './LocationMasterEditor.js';

const TABS = ['Priorität', 'Reserve', 'Bündel', 'Aufwand', 'Verladeplan', 'Parser', 'Lagerplätze'];

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

      {tab === 6 ? (
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
                    hint="Gewicht des Catman-Termins in der Priorisierung. Höher → CatMan-fällige Belege werden stärker vorgezogen."
                    value={draft.priority.catManWeight}
                    onChange={(v) => patch('priority', { ...draft.priority, catManWeight: v })}
                  />
                  <Num
                    label="Überfälligkeitsschwelle (h)"
                    hint="Ab so vielen Stunden seit Buchung gilt ein Beleg als überfällig und wird hochpriorisiert."
                    value={draft.priority.overdueThresholdHours}
                    onChange={(v) =>
                      patch('priority', { ...draft.priority, overdueThresholdHours: v })
                    }
                  />
                  <Toggle
                    label="FIFO aktiv"
                    hint="First-In-First-Out: bei gleicher Priorität zuerst den ältesten Beleg."
                    checked={draft.priority.fifoEnabled}
                    onChange={(v) => patch('priority', { ...draft.priority, fifoEnabled: v })}
                  />
                  <Toggle
                    label="Manuelle Prio gewinnt"
                    hint="Manuell vom Teamlead gesetzte Priorität schlägt die automatische Reihenfolge."
                    checked={draft.priority.manualPriorityWins}
                    onChange={(v) => patch('priority', { ...draft.priority, manualPriorityWins: v })}
                  />
                </Grid>
              )}

              {tab === 1 && (
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Eiserne Reserve (§5): hält morgens genug startbare Carryover-Belege zurück, damit
                    die Frühschicht um 09:00 nicht leerläuft. Ziel = Frühschicht-MA × Morgen-Lücke.
                  </Typography>
                  <Grid>
                    <Toggle
                      label="Eiserne Reserve aktiv"
                      checked={draft.reserve.enabled}
                      onChange={(v) => patch('reserve', { ...draft.reserve, enabled: v })}
                    />
                    <Num
                      label="Morgen-Lücke (Min.)"
                      hint="Zeitfenster, das die Frühschicht morgens überbrücken muss, bis frische Ware gebucht ist. Reserve-Ziel = Frühschicht-MA × diese Minuten."
                      value={draft.reserve.morningGapMinutes}
                      onChange={(v) =>
                        patch('reserve', {
                          ...draft.reserve,
                          morningGapMinutes: Math.max(1, Math.round(v)),
                        })
                      }
                    />
                    <TextField
                      select
                      size="small"
                      label={
                        <LabelWithHint
                          label="Frühschicht-Quelle"
                          hint="Woher die Anzahl Frühschicht-MA kommt: ‚Folgetag‘ (Schichtplan) oder ‚Heute‘ als Näherung (solange kein PEP-Feed)."
                        />
                      }
                      value={draft.reserve.earlyShiftSource}
                      onChange={(e) =>
                        patch('reserve', {
                          ...draft.reserve,
                          earlyShiftSource:
                            e.target.value === 'next_morning' ? 'next_morning' : 'today_proxy',
                        })
                      }
                    >
                      <MenuItem value="today_proxy">Heutige Schichten (Proxy)</MenuItem>
                      <MenuItem value="next_morning">Nächster Arbeitstag</MenuItem>
                    </TextField>
                    <Toggle
                      label="Fristen respektieren"
                      hint="Ein zurückgehaltener Beleg darf nie sein Catman-/Verladedatum überschreiten."
                      checked={draft.reserve.respectDeadlines}
                      onChange={(v) => patch('reserve', { ...draft.reserve, respectDeadlines: v })}
                    />
                  </Grid>
                  <Stack spacing={1}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      component="div"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Nie zurückhalten — Abteilungen (fix):
                      <InfoHint text="Abschnitte, die nie zurückgehalten werden – NOS (4), Extrabestellung (7), NOS-Nachorder (8) müssen am selben Tag raus." />
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {draft.reserve.neverReserveSections.map((s) => (
                        <Chip key={s} label={`Abt. ${s}`} size="small" variant="outlined" />
                      ))}
                    </Stack>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      component="div"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                      Nie zurückhalten — Prio-Flags (fix):
                      <InfoHint text="Dringlichkeits-Kennzeichen, die nie in die Reserve wandern (Prio, CatMan, überfällig, manuell)." />
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {draft.reserve.neverReserveFlags.map((f) => (
                        <Chip key={f} label={f} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  </Stack>
                </Stack>
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
                    hint="Max. Anzahl schwerer/aufwändiger Belege pro Bündel."
                    value={draft.bundle.maxHeavyCases}
                    onChange={(v) => patch('bundle', { ...draft.bundle, maxHeavyCases: v })}
                  />
                </Grid>
              )}

              {tab === 3 && (
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Aufwands-Faktoren multiplizieren den Basisaufwand (&gt;1 = mehr Aufwand).
                  </Typography>
                  <Grid>
                    <Num
                      label="Faktor Etikettendruck"
                      hint="… wenn Preisetiketten gedruckt werden"
                      value={draft.effort.priceLabelPrintFactor}
                      onChange={(v) =>
                        patch('effort', { ...draft.effort, priceLabelPrintFactor: v })
                      }
                    />
                    <Num
                      label="Faktor Sicherung"
                      hint="… wenn Ware gesichert werden muss"
                      value={draft.effort.securingFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, securingFactor: v })}
                    />
                    <Num
                      label="Faktor Online"
                      hint="… für online-relevante Artikel (Sonderhandling)"
                      value={draft.effort.onlineFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, onlineFactor: v })}
                    />
                    <Num
                      label="Faktor Rotpreis"
                      hint="… für rote Preise/Reduzierungen"
                      value={draft.effort.redPriceFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, redPriceFactor: v })}
                    />
                    <Num
                      label="Faktor Prüfanteil"
                      hint="… bei hohem Prüfanteil (WE-Prüfung)"
                      value={draft.effort.checkShareFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, checkShareFactor: v })}
                    />
                    <Num
                      label="Faktor Box-Splitting"
                      hint="… bei Verteilung auf mehrere Transportkisten"
                      value={draft.effort.boxSplittingFactor}
                      onChange={(v) => patch('effort', { ...draft.effort, boxSplittingFactor: v })}
                    />
                  </Grid>
                </Stack>
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
                    <Typography
                      key={pt.id}
                      variant="body2"
                      component="div"
                      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}
                    >
                      <span>
                        {pt.name} · Pflichtfelder: {pt.requiredFields.join(', ')} · Schwelle{' '}
                        {pt.detectionThreshold}
                      </span>
                      <InfoHint text="Ab welcher Trefferquote (0–1) das Dokument automatisch erkannt wird." />
                      {pt.fallbackToManual && (
                        <>
                          <span>· Fallback manuell</span>
                          <InfoHint text="Bei Unsicherheit manuelle Nachbearbeitung." />
                        </>
                      )}
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

/**
 * A small InfoOutlined icon carrying a plain-language explainer in a tooltip. Used
 * next to the labels of the non-self-evident rule settings only (e.g. FIFO, CatMan
 * weight, Morgen-Lücke) — obvious fields (an/aus toggles, min/max Minuten) stay bare
 * so the form doesn't get cluttered. This is the ONE consistent explainer pattern.
 */
function InfoHint({ text }: { text: string }): JSX.Element {
  return (
    <Tooltip title={text} arrow enterTouchDelay={0}>
      <InfoOutlinedIcon
        fontSize="inherit"
        color="action"
        sx={{ cursor: 'help', fontSize: '1rem', verticalAlign: 'middle', opacity: 0.7 }}
      />
    </Tooltip>
  );
}

/** A field label with an optional trailing {@link InfoHint} explainer icon. */
function LabelWithHint({ label, hint }: { label: string; hint?: string }): JSX.Element {
  if (!hint) return <>{label}</>;
  return (
    <Stack component="span" direction="row" spacing={0.5} alignItems="center" useFlexGap>
      <span>{label}</span>
      <InfoHint text={hint} />
    </Stack>
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
  /** Plain-language explainer rendered as an info icon next to the label (optional). */
  hint?: string;
}): JSX.Element {
  return (
    <TextField
      type="number"
      size="small"
      label={<LabelWithHint label={label} hint={hint} />}
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
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Plain-language explainer rendered as an info icon next to the label (optional). */
  hint?: string;
}): JSX.Element {
  return (
    <FormControlLabel
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={<LabelWithHint label={label} hint={hint} />}
    />
  );
}
