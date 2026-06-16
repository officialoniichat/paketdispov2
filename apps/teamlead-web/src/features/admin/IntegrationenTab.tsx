/**
 * Admin „Integrationen" — ProHandel-Anbindung (UI mock).
 *
 * ProHandel (ERP) ist System of Record. Ein settings-konfigurierter Delta-Pull
 * erzeugt Belege direkt im Status `ready` (kein Parser, kein Upload, keine
 * Einlagerungs-Station). Konzept: `docs/concept/prohandel-integration-concept.md`.
 *
 * Datenquelle ist bewusst ein Mock ({@link ../../data/integrations}), bis der
 * echte ProHandel-Endpoint steht. Zugangsdaten kommen ausschließlich aus einer
 * ENV-Variable und werden hier nie eingegeben.
 */
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  fetchProhandelIntegration,
  retryQuarantineItem,
  saveProhandelConfig,
  testProhandelConnection,
  PROHANDEL_INTEGRATION_QUERY_KEY,
  type ConnectionTestResult,
  type ProhandelConfig,
  type ProhandelIntegration,
} from '../../data/integrations.js';

const INTERVAL_OPTIONS = [60, 120, 180, 300, 600];

export function IntegrationenTab(): JSX.Element {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ProhandelConfig | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  const query = useQuery<ProhandelIntegration, Error>({
    queryKey: PROHANDEL_INTEGRATION_QUERY_KEY,
    queryFn: fetchProhandelIntegration,
  });

  useEffect(() => {
    if (query.data) setDraft(query.data.config);
  }, [query.data]);

  const onSaved = (data: ProhandelIntegration): void => {
    queryClient.setQueryData(PROHANDEL_INTEGRATION_QUERY_KEY, data);
    setDraft(data.config);
  };

  const save = useMutation({ mutationFn: saveProhandelConfig, onSuccess: onSaved });
  const retry = useMutation({ mutationFn: retryQuarantineItem, onSuccess: onSaved });
  const test = useMutation({
    mutationFn: testProhandelConnection,
    onSuccess: (r) => setTestResult(r),
  });

  function patch<K extends keyof ProhandelConfig>(key: K, value: ProhandelConfig[K]): void {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setTestResult(null);
  }

  function toggleBranch(no: string): void {
    setDraft((d) => {
      if (!d) return d;
      const has = d.branchScope.includes(no);
      return {
        ...d,
        branchScope: has ? d.branchScope.filter((b) => b !== no) : [...d.branchScope, no],
      };
    });
    setTestResult(null);
  }

  if (query.isLoading || !draft || !query.data) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          ProHandel-Anbindung wird geladen…
        </Typography>
      </Stack>
    );
  }

  const { status, quarantine, branches } = query.data;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' },
        gap: 2,
        alignItems: 'start',
      }}
    >
      {/* ── Connection form ───────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>
            ProHandel-Anbindung
          </Typography>
          <FormControlLabel
            sx={{ mr: 0 }}
            control={
              <Switch
                checked={draft.enabled}
                onChange={(e) => patch('enabled', e.target.checked)}
                color="success"
              />
            }
            label={draft.enabled ? 'aktiv' : 'inaktiv'}
          />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          Quelle für Aufträge, Positionen, Größenverteilung, Arbeitsanweisung und Lagerplatz.
          Belege entstehen direkt im Status „ready".
        </Typography>

        <Stack spacing={2}>
          <TextField
            label="Basis-URL"
            size="small"
            fullWidth
            value={draft.baseUrl}
            onChange={(e) => patch('baseUrl', e.target.value)}
          />

          <TextField
            label="Pull-Intervall"
            size="small"
            select
            value={draft.pollIntervalSeconds}
            onChange={(e) => patch('pollIntervalSeconds', Number(e.target.value))}
            sx={{ maxWidth: 220 }}
          >
            {INTERVAL_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s} Sek. {s >= 60 ? `(≈ ${Math.round(s / 60)} min)` : ''}
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              MANDANT / FILIALE
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1 }}>
              {branches.map((b) => {
                const on = draft.branchScope.includes(b.no);
                return (
                  <Chip
                    key={b.no}
                    label={`${b.no} ${b.name}`}
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => toggleBranch(b.no)}
                  />
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              Gezogen werden nur Buchungen der gewählten Filialen.
            </Typography>
          </Box>

          {/* ENV-only secret — never entered in the UI */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              p: 1.5,
              borderRadius: 1.5,
              bgcolor: 'action.hover',
            }}
          >
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                bgcolor: draft.secretConfigured ? 'success.main' : 'error.main',
                flexShrink: 0,
              }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Zugangsdaten {draft.secretConfigured ? 'per ENV gesetzt' : 'fehlen'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Secrets werden nicht in der UI gepflegt.
              </Typography>
            </Box>
            <Chip
              size="small"
              label={draft.secretEnvVar}
              sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
          </Box>

          <Divider />

          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
            <Button variant="outlined" onClick={() => test.mutate()} disabled={test.isPending}>
              Verbindung testen
            </Button>
            <Button variant="contained" color="inherit" disabled>
              Jetzt pullen
            </Button>
            <Button
              variant="contained"
              onClick={() => draft && save.mutate(draft)}
              disabled={save.isPending}
            >
              Speichern
            </Button>
          </Stack>

          {save.isSuccess && (
            <Alert severity="success" onClose={() => save.reset()}>
              Einstellungen gespeichert.
            </Alert>
          )}
          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'error'} onClose={() => setTestResult(null)}>
              {testResult.ok ? 'Verbindung erfolgreich · ' : 'Verbindung fehlgeschlagen · '}
              {testResult.message}
            </Alert>
          )}
        </Stack>
      </Paper>

      {/* ── Status + quarantine ───────────────────────────────────── */}
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            STATUS
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <StatusRow label="Verbindung">
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: status.connected ? 'success.main' : 'error.main',
                  display: 'inline-block',
                  mr: 0.75,
                }}
              />
              <Box component="span" sx={{ color: 'success.main', fontWeight: 800 }}>
                {status.connected ? 'aktiv' : 'getrennt'}
              </Box>
            </StatusRow>
            <StatusRow label="Letzter Pull">
              {status.lastPullAt} {status.lastPullOk ? '· ✓ erfolgreich' : '· ✗ Fehler'}
            </StatusRow>
            <StatusRow label="Cursor">
              <Box component="span" sx={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {status.cursorLabel}
              </Box>
            </StatusRow>
            <StatusRow label="Neue Belege">{status.newCases}</StatusRow>
            <StatusRow label="Nächster Pull">
              in {Math.floor(status.nextPullInSeconds / 60)}:
              {String(status.nextPullInSeconds % 60).padStart(2, '0')} min
            </StatusRow>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Chip
              size="small"
              color="warning"
              label={`Quarantäne · ${quarantine.length}`}
              sx={{ fontWeight: 700 }}
            />
            <Box sx={{ flex: 1 }} />
          </Stack>
          {quarantine.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Keine quarantänierten Buchungen.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {quarantine.map((q) => (
                <Box
                  key={q.weBelegNo}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.25,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderLeft: '4px solid',
                    borderLeftColor: 'warning.main',
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace' }}
                    >
                      {q.weBelegNo}
                    </Typography>
                    <Typography variant="caption" color="warning.main">
                      {q.reason}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => retry.mutate(q.weBelegNo)}
                    disabled={retry.isPending}
                  >
                    Retry
                  </Button>
                </Box>
              ))}
            </Stack>
          )}
          <Alert severity="info" sx={{ mt: 1.5 }} icon={false}>
            Quarantänierte Buchungen werden nie verworfen. Read-only v1 — es wird nichts nach
            ProHandel zurückgeschrieben.
          </Alert>
        </Paper>
      </Stack>
    </Box>
  );
}

function StatusRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="body2" color="text.secondary" sx={{ width: 120, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
    </Stack>
  );
}
