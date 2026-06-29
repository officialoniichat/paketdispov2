/**
 * Mitarbeitenden-Board (§10.3 / Anhang E.4 "Workforce dispatch board").
 *
 * Per person: current Bündel, Restkapazität, Aufwandspunkte, schwer/leicht mix
 * and Problem-Status. Teamlead actions – Beleg entziehen/zuweisen, Reihenfolge
 * neu setzen, Pause/Abwesenheit – all require a reason and are audited (§8.4),
 * and are POSTed to the real backend with an optimistic board update + rollback.
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { LieferungChip } from '../../components/LieferungChip';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import { CaseStatusChip, ProblemChip } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import { formatMinutes, formatPct } from '../../lib/format.js';
import { ReasonDialog } from '../../components/ReasonDialog.js';
import { AssignDialog } from '../../components/AssignDialog.js';
import type { BoardRow } from '../../data/types.js';

interface PendingAction {
  title: string;
  description: string;
  suggestions: string[];
  run: (reason: string) => void;
}

export function MitarbeiterBoard(): JSX.Element {
  const { board, withdraw, addToBundle, assignToEmployee, reorder, pauseResume } = useCockpitData();
  const [pending, setPending] = useState<PendingAction | null>(null);

  // First failing intervention drives the error snackbar.
  const failed = [withdraw, addToBundle, assignToEmployee, reorder, pauseResume].find(
    (m) => m.isError,
  );

  // Delivery groups (Teamlead-Anforderung Punkt 1) that ended up split across more than
  // one employee — surfaced so the teamlead can pull them back onto one person.
  const groupEmployees = new Map<string, Set<string>>();
  for (const row of board) {
    for (const c of row.cases) {
      const groupId = c.deliveryGroup?.id;
      if (!groupId) continue;
      const set = groupEmployees.get(groupId) ?? new Set<string>();
      set.add(row.employeeId);
      groupEmployees.set(groupId, set);
    }
  }
  const splitGroupCount = [...groupEmployees.values()].filter((s) => s.size > 1).length;

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        Mitarbeiterboard
      </Typography>
      {splitGroupCount > 0 && (
        <Alert severity="warning" variant="outlined">
          {splitGroupCount === 1
            ? '1 zusammengehörige Lieferung ist auf mehrere Mitarbeiter verteilt — bitte zusammen einem Mitarbeiter zuweisen.'
            : `${splitGroupCount} zusammengehörige Lieferungen sind auf mehrere Mitarbeiter verteilt — bitte jeweils einem Mitarbeiter zuweisen.`}
        </Alert>
      )}
      <Stack spacing={1}>
        {board.map((row) => (
          <EmployeeRow key={row.employeeId} row={row} requestReason={setPending} />
        ))}
      </Stack>

      <ReasonDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description}
        suggestions={pending?.suggestions}
        onConfirm={(reason) => pending?.run(reason)}
        onClose={() => setPending(null)}
      />

      <Snackbar
        open={Boolean(failed)}
        autoHideDuration={8000}
        onClose={() => failed?.reset()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => failed?.reset()}>
          {failed?.error?.message ?? 'Eingriff fehlgeschlagen.'}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

interface EmployeeRowProps {
  row: BoardRow;
  requestReason: (a: PendingAction) => void;
}

function EmployeeRow({ row, requestReason }: EmployeeRowProps): JSX.Element {
  const { pool, withdraw, addToBundle, assignToEmployee, reorder, pauseResume } = useCockpitData();
  const navigate = useNavigate();
  const bundleId = row.bundleId;
  const caseKey = row.cases.map((c) => c.caseId).join();
  const [draft, setDraft] = useState<string[]>(() => row.cases.map((c) => c.caseId));
  const [addId, setAddId] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const selectedPoolCase = pool.find((p) => p.caseId === addId) ?? null;

  // Keep the reorder draft in sync once a mutation changes the bundle.
  useEffect(() => {
    setDraft(row.cases.map((c) => c.caseId));
  }, [caseKey, row.cases]);

  const draftCases = draft
    .map((id) => row.cases.find((c) => c.caseId === id))
    .filter((c): c is BoardRow['cases'][number] => c !== undefined);
  const dirty = draft.join() !== row.cases.map((c) => c.caseId).join();

  function move(index: number, dir: -1 | 1): void {
    const next = [...draft];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const a = next[index];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[index] = b;
    next[target] = a;
    setDraft(next);
  }

  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          flexWrap="wrap"
          sx={{ width: '100%' }}
        >
          <Typography sx={{ fontWeight: 700, minWidth: 90 }}>{row.displayName}</Typography>
          {row.cases.length === 0 && (
            <Chip size="small" color="success" variant="outlined" label="frei" />
          )}
          <Typography variant="body2">{row.plannedHours} h geplant</Typography>
          <Chip
            size="small"
            label={`${formatPct(row.utilisationPct)} verplant`}
            color={row.utilisationPct > 95 ? 'warning' : 'default'}
          />
          {row.bereiche.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {row.bereiche.join(', ')}
            </Typography>
          )}
          {row.cases.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {row.effortPoints} Pkt · schwer {row.heavyCaseCount}/leicht {row.lightCaseCount}
            </Typography>
          )}
          {row.openIssues > 0 && (
            <ProblemChip status="open" count={row.openIssues} size="small" />
          )}
          {row.bundleSize != null && (
            <Typography variant="body2">
              Beleg {(row.currentCaseIndex ?? 0) + 1}/{row.bundleSize}
            </Typography>
          )}
          {row.paused && (
            <Chip
              size="small"
              color="warning"
              icon={<PauseCircleIcon fontSize="small" />}
              label="Pausiert"
            />
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          {draftCases.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Frei — keine Belege zugewiesen.
            </Typography>
          )}
          {draftCases.map((c, i) => (
            <Stack key={c.caseId} direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 18 }}>
                {i + 1}.
              </Typography>
              <IconButton
                size="small"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="Nach oben"
              >
                <ArrowUpwardIcon fontSize="inherit" />
              </IconButton>
              <IconButton
                size="small"
                disabled={i === draftCases.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Nach unten"
              >
                <ArrowDownwardIcon fontSize="inherit" />
              </IconButton>
              <Typography sx={{ fontWeight: 600 }}>{c.weBelegNo}</Typography>
              <CaseStatusChip status={c.status} size="small" />
              <LieferungChip group={c.deliveryGroup} />
              <Typography variant="caption" color="text.secondary">
                {c.storageCode ? `${c.storageCode} · ` : ''}
                {formatMinutes(c.estimatedMinutes)}
              </Typography>
              <Button size="small" onClick={() => navigate(`/belege/${c.caseId}`)}>
                Details
              </Button>
              <Button
                size="small"
                color="error"
                disabled={!bundleId}
                onClick={() =>
                  requestReason({
                    title: `${c.weBelegNo} von ${row.displayName} entziehen`,
                    description: 'Beleg geht zurück in den Pool.',
                    suggestions: ['Überlastet', 'Falsch zugeteilt', 'Pause/Abwesenheit'],
                    run: (reason) => {
                      if (bundleId) withdraw.mutate({ caseId: c.caseId, bundleId, reason });
                    },
                  })
                }
              >
                Entziehen
              </Button>
            </Stack>
          ))}

          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" sx={{ pt: 1 }}>
            <TextField
              select
              size="small"
              label="Beleg zuweisen"
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              sx={{ minWidth: 260 }}
              disabled={pool.length === 0}
            >
              {pool.length === 0 && <MenuItem value="">Kein freier Beleg</MenuItem>}
              {pool.map((c) => (
                <MenuItem key={c.caseId} value={c.caseId}>
                  {c.weBelegNo}
                  {c.bereich ? ` · ${c.bereich}` : ''} · {formatMinutes(c.estimatedMinutes)}
                </MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="outlined"
              disabled={!addId}
              onClick={() => setAssignOpen(true)}
            >
              {bundleId ? 'Beleg zuweisen' : 'Beleg zuweisen & Bündel anlegen'}
            </Button>

            <Button
              size="small"
              variant="outlined"
              disabled={!dirty || !bundleId}
              onClick={() =>
                requestReason({
                  title: `Reihenfolge für ${row.displayName} speichern`,
                  description: 'Neue Abholreihenfolge des Pakets.',
                  suggestions: ['Laufweg optimiert', 'Prio vorgezogen'],
                  run: (reason) => {
                    if (bundleId) reorder.mutate({ bundleId, caseIds: draft, reason });
                  },
                })
              }
            >
              Reihenfolge speichern
            </Button>

            <Button
              size="small"
              color="warning"
              variant="outlined"
              disabled={!bundleId}
              onClick={() =>
                requestReason({
                  title: `${row.displayName}: ${row.paused ? 'Pause beenden' : 'Pause/Abwesenheit'}`,
                  description: row.paused ? 'Bearbeitung fortsetzen.' : 'Pausiert die Bearbeitung.',
                  suggestions: ['Pause', 'Krank', 'Andere Aufgabe', 'Zurück aus Pause'],
                  run: (reason) => {
                    if (bundleId) pauseResume.mutate({ bundleId, reason, paused: row.paused });
                  },
                })
              }
            >
              {row.paused ? 'Pause beenden' : 'Pause/Abwesenheit'}
            </Button>
          </Stack>

          <AssignDialog
            open={assignOpen}
            row={row}
            poolCase={selectedPoolCase}
            onClose={() => setAssignOpen(false)}
            onConfirm={(reason) => {
              if (!selectedPoolCase) return;
              // Belegt → append to the existing Bündel; free → create it via assignToEmployee.
              if (bundleId) {
                addToBundle.mutate({ caseId: selectedPoolCase.caseId, bundleId, reason });
              } else {
                assignToEmployee.mutate({
                  employeeNo: row.employeeId,
                  caseId: selectedPoolCase.caseId,
                  reason,
                });
              }
              setAddId('');
            }}
          />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
