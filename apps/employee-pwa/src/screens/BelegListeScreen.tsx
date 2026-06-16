/** Home hub: priority-sorted, freely selectable Beleg list (§E.3 task-first).
 *  Assignment is system-only — the worker chooses the order, not the workload. */
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { db } from '../db/db.js';
import { getBelege, getDay } from '../db/repository.js';
import { deriveBelegStatus, nextRecommended, sortBelege } from '../workflow/belegList.js';
import type { BelegStatus } from '../db/types.js';
import { loadAssignedWork } from '../db/sync.js';
import { isBackendEnabled } from '../data/api.js';
import { useBootstrap } from '../data/bootstrapContext.js';
import { caseStepPath } from '../routes/paths.js';

const STATUS_CHIP: Record<
  BelegStatus,
  { label: string; color: 'default' | 'primary' | 'success' | 'error' }
> = {
  open: { label: 'Offen', color: 'default' },
  in_progress: { label: 'In Arbeit', color: 'primary' },
  done: { label: 'Fertig', color: 'success' },
  issue: { label: 'Problem', color: 'error' },
};

const ICON: Record<string, string> = {
  regal: '📦',
  palette: '🟧',
  haengeware: '👕',
  mixed: '📦',
};

export function BelegListeScreen(): JSX.Element {
  const navigate = useNavigate();
  const { loading } = useBootstrap();
  const day = useLiveQuery(() => getDay(), []);
  const belege = useLiveQuery(() => getBelege(), []);
  const progressRows = useLiveQuery(() => db.progress.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);

  if (loading || day === undefined || belege === undefined || progressRows === undefined) {
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
      openIssuesByCase.set(e.entityId, (openIssuesByCase.get(e.entityId) ?? 0) + 1);
    }
  }
  const statuses = new Map<string, BelegStatus>(
    belege.map((b) => [
      b.caseId,
      deriveBelegStatus(progressByCase.get(b.caseId), openIssuesByCase.get(b.caseId) ?? 0),
    ]),
  );
  const sorted = sortBelege(belege);
  const recommended = nextRecommended(belege, statuses);
  const doneCount = [...statuses.values()].filter((s) => s === 'done').length;
  const allDone = belege.length > 0 && doneCount === belege.length;
  const urgentCount = belege.filter((b) => b.urgent).length;

  const start = (caseId: string): void => {
    const step = progressByCase.get(caseId)?.step ?? 'pickup';
    navigate(caseStepPath(caseId, step === 'done' ? 'complete' : step));
  };

  return (
    <Box sx={{ p: 2, pb: 16 }}>
      <Typography variant="overline" color="text.secondary">
        {belege.length} Belege · nach Prio · du wählst
      </Typography>
      <Typography variant="h1" gutterBottom>
        Guten Morgen{day ? `, ${day.employeeName}` : ''}
      </Typography>
      {day ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack spacing={0.5}>
            <Typography>Arbeitsplatz: {day.workstation}</Typography>
            <Typography>
              {doneCount} von {belege.length} fertig · {urgentCount}× eilig
            </Typography>
          </Stack>
        </Paper>
      ) : null}

      {belege.length === 0 ? (
        <Alert severity="info">
          Aktuell keine Zuteilung. Sobald die Teamleitung zuteilt, erscheinen deine Belege hier.
        </Alert>
      ) : null}

      <Stack spacing={1}>
        {sorted.map((b) => {
          const st = statuses.get(b.caseId) ?? 'open';
          const isRec = recommended?.caseId === b.caseId;
          return (
            <Paper
              key={b.caseId}
              variant="outlined"
              onClick={() => start(b.caseId)}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                cursor: 'pointer',
                ...(isRec ? { borderColor: 'secondary.main', boxShadow: 2 } : {}),
              }}
            >
              <Box sx={{ fontSize: 22 }}>{ICON[b.goodsType] ?? '📦'}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>
                  WE {b.weBelegNo}{' '}
                  {b.urgent ? <Chip size="small" color="secondary" label="Eilig" /> : null}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {b.storageLocationCode} · {b.totalQuantity} Teile{isRec ? ' · empfohlen' : ''}
                </Typography>
              </Box>
              <Chip size="small" color={STATUS_CHIP[st].color} label={STATUS_CHIP[st].label} />
            </Paper>
          );
        })}
      </Stack>

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
          <Stack spacing={1}>
            <Alert severity="success">Alle Belege erledigt 🎉</Alert>
            {isBackendEnabled ? (
              <TouchButton emphasis="primary" onClick={() => void loadAssignedWork()}>
                Aktualisieren
              </TouchButton>
            ) : null}
          </Stack>
        ) : (
          <TouchButton
            emphasis="primary"
            disabled={!recommended}
            onClick={() => recommended && start(recommended.caseId)}
          >
            {recommended ? `Empfohlenen starten · WE ${recommended.weBelegNo}` : 'Starten'}
          </TouchButton>
        )}
      </Box>
    </Box>
  );
}
