/**
 * Home hub for the two-phase bundle flow.
 *
 * Shows the assigned bundle (cart) header, the COLLECT summary (→ /collect) and
 * the PROCESS Beleg list. COLLECT is a hard gate: until every pick-list stop is
 * checked off, the Beleg rows are locked. Assignment is system-only — the worker
 * never self-assigns; he works the cart the engine gave him.
 */
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { DemoControls } from '../components/DemoControls.js';
import { isBackendEnabled } from '../data/api.js';
import { db } from '../db/db.js';
import { useBundle } from '../workflow/useBundle.js';
import { deriveBelegStatus, nextOpenBeleg, orderBelege } from '../workflow/belegList.js';
import type { BelegStatus, GoodsCategory } from '../db/types.js';
import { COLLECT, caseProcessPath } from '../routes/paths.js';

const STATUS_CHIP: Record<
  BelegStatus,
  { label: string; color: 'default' | 'primary' | 'success' | 'error' }
> = {
  open: { label: 'Offen', color: 'default' },
  in_progress: { label: 'In Arbeit', color: 'primary' },
  done: { label: 'Fertig', color: 'success' },
  issue: { label: 'Problem', color: 'error' },
};

const ICON: Record<GoodsCategory, string> = {
  regal: '📦',
  palette: '🟧',
  haengeware: '👕',
  mixed: '📦',
};

export function BundleHomeScreen(): JSX.Element {
  const navigate = useNavigate();
  const { loading, bundle, belege, counts, collectComplete } = useBundle();
  const progressRows = useLiveQuery(() => db.progress.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);

  if (loading || progressRows === undefined) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton count={3} />
      </Box>
    );
  }

  const progressByCase = new Map(progressRows.map((p) => [p.caseId, p]));
  const openIssuesByCase = new Map<string, number>();
  for (const e of events ?? []) {
    if (e.eventType === 'issue.created') {
      const id = e.entityId;
      openIssuesByCase.set(id, (openIssuesByCase.get(id) ?? 0) + 1);
    }
  }
  const statuses = new Map<string, BelegStatus>(
    belege.map((b) => [
      b.caseId,
      deriveBelegStatus(progressByCase.get(b.caseId), openIssuesByCase.get(b.caseId) ?? 0),
    ]),
  );
  const ordered = orderBelege(belege);
  const doneCount = [...statuses.values()].filter((s) => s === 'done').length;
  const allDone = belege.length > 0 && doneCount === belege.length;
  const recommended = collectComplete ? nextOpenBeleg(belege, statuses) : undefined;

  const openBeleg = (caseId: string): void => {
    if (!collectComplete) return;
    navigate(caseProcessPath(caseId));
  };

  return (
    <Box sx={{ p: 2, pb: 18 }}>
      {isBackendEnabled ? null : <DemoControls />}
      <Typography variant="overline" color="text.secondary">
        Dein Karren · {belege.length} Belege{bundle?.bereich ? ` · ${bundle.bereich}` : ''}
      </Typography>
      <Typography variant="h1" gutterBottom>
        Guten Morgen{bundle ? `, ${bundle.employeeName}` : ''}
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={0.5}>
          <Typography>Arbeitsplatz: {bundle?.workstation ?? '—'}</Typography>
          <Typography>
            {doneCount} von {belege.length} fertig · ca. {bundle?.plannedEffortMinutes ?? 0} Min
          </Typography>
        </Stack>
      </Paper>

      {/* Phase 1: COLLECT */}
      <Paper
        variant="outlined"
        onClick={() => navigate(COLLECT)}
        sx={{
          p: 2,
          mb: 2,
          cursor: 'pointer',
          borderColor: collectComplete ? 'success.main' : 'secondary.main',
          borderWidth: 2,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              1 · Sammeln
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {collectComplete
                ? 'Alle Plätze geholt ✓'
                : `${counts.collected}/${counts.total} Plätze geholt`}
            </Typography>
          </Box>
          <Chip
            size="small"
            color={collectComplete ? 'success' : 'secondary'}
            label={collectComplete ? 'Fertig' : 'Offen'}
          />
        </Stack>
      </Paper>

      {/* Phase 2: PROCESS */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        2 · Bearbeiten
      </Typography>
      {!collectComplete ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          Erst alle Plätze holen, dann bearbeiten.
        </Alert>
      ) : null}

      <Stack spacing={1}>
        {ordered.map((b) => {
          const st = statuses.get(b.caseId) ?? 'open';
          const isRec = recommended?.caseId === b.caseId;
          return (
            <Paper
              key={b.caseId}
              variant="outlined"
              onClick={() => openBeleg(b.caseId)}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                cursor: collectComplete ? 'pointer' : 'not-allowed',
                opacity: collectComplete ? 1 : 0.5,
                ...(isRec ? { borderColor: 'secondary.main', boxShadow: 2 } : {}),
              }}
            >
              <Box sx={{ fontSize: 22 }}>{ICON[b.goodsType]}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>WE {b.weBelegNo}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {b.storageLocationCode} · {b.totalQuantity} Teile{isRec ? ' · empfohlen' : ''}
                </Typography>
              </Box>
              <Chip size="small" color={STATUS_CHIP[st].color} label={STATUS_CHIP[st].label} />
            </Paper>
          );
        })}
      </Stack>

      {belege.length === 0 ? (
        <Alert severity="info">
          Aktuell keine Zuteilung. Sobald die Teamleitung zuteilt, erscheinen deine Belege hier.
        </Alert>
      ) : null}

      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          p: 2,
          bgcolor: 'background.paper',
          boxShadow: 8,
        }}
      >
        {allDone ? (
          <Alert severity="success">Alle Belege erledigt 🎉</Alert>
        ) : !collectComplete ? (
          <TouchButton emphasis="primary" onClick={() => navigate(COLLECT)}>
            Sammeln starten
          </TouchButton>
        ) : (
          <TouchButton
            emphasis="primary"
            disabled={!recommended}
            onClick={() => recommended && openBeleg(recommended.caseId)}
          >
            {recommended ? `Weiter · WE ${recommended.weBelegNo}` : 'Bearbeiten'}
          </TouchButton>
        )}
      </Box>
    </Box>
  );
}
