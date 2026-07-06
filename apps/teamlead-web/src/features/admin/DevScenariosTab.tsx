/**
 * Admin-Tab "Dev / Szenarien" (A1–A4) — dev-gated demo/test cockpit:
 *
 *  - A2 Szenario-Katalog: served by the backend (`GET /api/dev/scenarios`,
 *    single source — no scenario names/descriptions live in the frontend),
 *    one-click "Szenario laden" (= Reset + deterministischer Seed) with result
 *    toast, active-scenario highlight and "Zurücksetzen auf Standard".
 *  - A3 Zeit-Steuerung: persisted server-side now-override (POST/DELETE
 *    /api/dev/time-override) with a clearly visible badge; the global app-bar
 *    indicator lives in {@link ../../components/DevTimeBadge}.
 *  - A4 Quick-Knobs: Mock-ProHandel-Pull, Automatik neu berechnen,
 *    Schichten materialisieren.
 *
 * This module is only reachable through the tree-shaken lazy import in
 * AdminPage (see ../../config/devPanel.ts) — it never ships in a production
 * build; the backend additionally answers 404 when its DEV_PANEL gate is off.
 */
import { useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  DEV_STATE_QUERY_KEY,
  clearTimeOverride,
  fetchDevState,
  loadScenario,
  materializeShifts,
  pullProhandel,
  recalculateAssignments,
  resetScenario,
  setTimeOverride,
  type DevScenariosDto,
  type ScenarioLoadResultDto,
} from '../../data/dev.js';

interface Feedback {
  severity: 'success' | 'error';
  message: string;
}

/** "2026-07-06T09:30" (datetime-local) for an ISO timestamp / now, in local time. */
function toLocalInputValue(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local calendar day (YYYY-MM-DD) of the override, or of real today. */
function dayOf(iso?: string | null): string {
  return toLocalInputValue(iso).slice(0, 10);
}

function describeLoad(result: ScenarioLoadResultDto): string {
  return (
    `Szenario „${result.key}“ geladen · ${result.readyCases} Belege bereit · ` +
    `${result.blockedCases} geblockt · ${result.deliveryGroups} Lieferungen · ` +
    `${result.shifts} Schichten · Basisdatum ${result.baseDate}`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function DevScenariosTab(): JSX.Element {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const [shiftDate, setShiftDate] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const state = useQuery<DevScenariosDto, Error>({
    queryKey: DEV_STATE_QUERY_KEY,
    queryFn: fetchDevState,
  });

  const timeOverride = state.data?.timeOverride ?? null;
  const activeKey = state.data?.activeScenarioKey ?? null;

  /** Every action rewrites the world — reload ALL cockpit queries afterwards. */
  const afterMutation = (message: string): void => {
    setFeedback({ severity: 'success', message });
    void queryClient.invalidateQueries();
  };
  const onError = (error: unknown): void =>
    setFeedback({ severity: 'error', message: errorMessage(error) });

  const load = useMutation({
    mutationFn: loadScenario,
    onSuccess: (r) => afterMutation(describeLoad(r)),
    onError,
  });
  const reset = useMutation({
    mutationFn: resetScenario,
    onSuccess: (r) => afterMutation(describeLoad(r)),
    onError,
  });
  const setTime = useMutation({
    mutationFn: setTimeOverride,
    onSuccess: (r) => afterMutation(`Server-Zeit eingefroren auf ${r.timeOverride ?? '—'}`),
    onError,
  });
  const clearTime = useMutation({
    mutationFn: clearTimeOverride,
    onSuccess: () => afterMutation('Zeit-Override entfernt — Server läuft wieder in Echtzeit.'),
    onError,
  });
  const pull = useMutation({
    mutationFn: pullProhandel,
    onSuccess: (r) =>
      afterMutation(
        `ProHandel-Pull · ${r.pulledCases} Belege übernommen, davon ${r.blockedCases} geblockt (${r.date})`,
      ),
    onError,
  });
  const recalc = useMutation({
    mutationFn: recalculateAssignments,
    onSuccess: (r) =>
      afterMutation(
        `Automatik neu berechnet (${r.date}) · ${r.bundleCount} Bündel · ${r.assignedCaseCount} zugeteilt · ${r.unassignedCaseCount} offen`,
      ),
    onError,
  });
  const shifts = useMutation({
    mutationFn: materializeShifts,
    onSuccess: (r) =>
      afterMutation(`Schichten materialisiert · ${r.shiftCount} aktive Schichten am ${r.date}`),
    onError,
  });

  const anyPending =
    load.isPending ||
    reset.isPending ||
    setTime.isPending ||
    clearTime.isPending ||
    pull.isPending ||
    recalc.isPending ||
    shifts.isPending;

  if (state.isLoading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          Dev-Status wird geladen…
        </Typography>
      </Stack>
    );
  }

  if (state.error || !state.data) {
    return (
      <Alert severity="error">
        Dev-Endpunkte nicht erreichbar: {state.error?.message ?? 'keine Daten'} — läuft das
        Backend mit aktivem DEV_PANEL-Gate und ist ein Admin-Dev-Token gesetzt (
        <code>pnpm dev:setup</code>)?
      </Alert>
    );
  }

  const activeScenario = state.data.scenarios.find((s) => s.key === activeKey);

  return (
    <Stack spacing={2}>
      <Alert severity="warning" icon={false}>
        <strong>Nur für Entwicklung/Demo.</strong> „Szenario laden“ setzt den kompletten
        Beleg-Bestand zurück und seedet ihn deterministisch neu; das Zeit-Override friert die
        Server-Zeit für Verteilung, Boards und Pull ein.
      </Alert>

      {/* ── Aktueller Zustand ─────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
          AKTUELLER ZUSTAND
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
          <Chip
            color={activeKey ? 'primary' : 'default'}
            variant={activeKey ? 'filled' : 'outlined'}
            label={
              activeKey
                ? `Aktives Szenario: ${activeScenario?.name ?? activeKey}`
                : 'Kein Szenario geladen (Daten nicht szenario-verwaltet)'
            }
            sx={{ fontWeight: 700 }}
          />
          <Chip
            icon={<HistoryToggleOffIcon />}
            color={timeOverride ? 'warning' : 'default'}
            variant={timeOverride ? 'filled' : 'outlined'}
            label={
              timeOverride
                ? `Zeit eingefroren: ${new Date(timeOverride).toLocaleString('de-DE')}`
                : 'Echtzeit'
            }
            sx={{ fontWeight: 700 }}
          />
        </Stack>
      </Paper>

      {/* ── A3 Zeit-Steuerung ─────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Zeit-Steuerung
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Friert das Server-„Jetzt“ ein (persistiert): Verteilung, Schichtende-Cutoff,
          Verladeplan-Fälligkeit und Tages-Defaults rechnen mit dieser Zeit.
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <TextField
            type="datetime-local"
            size="small"
            label="Server-Zeit"
            value={timeDraft ?? toLocalInputValue(timeOverride)}
            onChange={(e) => setTimeDraft(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="contained"
            disabled={anyPending}
            onClick={() => {
              const value = timeDraft ?? toLocalInputValue(timeOverride);
              setTime.mutate(new Date(value).toISOString());
            }}
          >
            Setzen
          </Button>
          <Button
            variant="outlined"
            color="warning"
            disabled={anyPending || !timeOverride}
            onClick={() => clearTime.mutate()}
          >
            Zurück zu Echtzeit
          </Button>
        </Stack>
      </Paper>

      {/* ── A2 Szenario-Katalog ───────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>
            Szenario-Katalog
          </Typography>
          <Button
            variant="outlined"
            startIcon={<RestartAltIcon />}
            disabled={anyPending}
            onClick={() => reset.mutate()}
          >
            {reset.isPending ? 'Wird zurückgesetzt…' : 'Zurücksetzen auf Standard'}
          </Button>
        </Stack>
        <Stack spacing={1}>
          {state.data.scenarios.map((scenario) => {
            const isActive = scenario.key === activeKey;
            const isLoadingThis = load.isPending && load.variables === scenario.key;
            const expanded = expandedKey === scenario.key;
            return (
              <Box
                key={scenario.key}
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: isActive ? 'primary.main' : 'divider',
                  bgcolor: isActive ? 'action.selected' : 'transparent',
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {scenario.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={scenario.key}
                        sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                      />
                      {isActive && <Chip size="small" color="primary" label="aktiv" />}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      {scenario.description}
                    </Typography>
                    <Button
                      size="small"
                      color="inherit"
                      sx={{ mt: 0.5, color: 'text.secondary', textTransform: 'none' }}
                      startIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      onClick={() => setExpandedKey(expanded ? null : scenario.key)}
                    >
                      Was man danach sehen sollte
                    </Button>
                    <Collapse in={expanded}>
                      <Alert severity="info" icon={false} sx={{ mt: 0.5 }}>
                        {scenario.expectedOutcome}
                      </Alert>
                    </Collapse>
                  </Box>
                  <Button
                    variant="contained"
                    disabled={anyPending}
                    onClick={() => load.mutate(scenario.key)}
                    sx={{ flexShrink: 0, minWidth: 150 }}
                  >
                    {isLoadingThis ? 'Wird geladen…' : 'Szenario laden'}
                  </Button>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </Paper>

      {/* ── A4 Quick-Knobs ────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>
          Quick-Knobs
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="outlined" disabled={anyPending} onClick={() => pull.mutate()}>
            {pull.isPending ? 'Pull läuft…' : 'Mock-ProHandel Pull'}
          </Button>
          <Button
            variant="outlined"
            disabled={anyPending}
            onClick={() => recalc.mutate(dayOf(timeOverride))}
          >
            {recalc.isPending ? 'Berechnung läuft…' : 'Automatik neu berechnen'}
          </Button>
          <TextField
            type="date"
            size="small"
            label="Schicht-Datum"
            value={shiftDate ?? dayOf(timeOverride)}
            onChange={(e) => setShiftDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="outlined"
            disabled={anyPending}
            onClick={() => shifts.mutate(shiftDate ?? dayOf(timeOverride))}
          >
            {shifts.isPending ? 'Materialisiert…' : 'Schichten materialisieren'}
          </Button>
        </Stack>
      </Paper>

      <Snackbar
        open={feedback !== null}
        autoHideDuration={8000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={feedback?.severity ?? 'success'}
          variant="filled"
          onClose={() => setFeedback(null)}
          sx={{ maxWidth: 640 }}
        >
          {feedback?.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

export default DevScenariosTab;
