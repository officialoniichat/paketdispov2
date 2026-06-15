/**
 * Mitarbeitenden-Board (§10.3 / Anhang E.4 "Workforce dispatch board").
 *
 * Per person: current Paket, Restkapazität, Aufwandspunkte, schwer/leicht mix
 * and Issue-Status. Teamlead actions – Paket entziehen/hinzufügen, Reihenfolge
 * neu setzen, Pause/Abwesenheit – all require a reason and are audited (§8.4).
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import type { GoodsReceiptCase } from '@paket/domain-types';
import { CaseStatusChip } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import { formatMinutes, formatPct } from '../../lib/format.js';
import { ReasonDialog } from '../../components/ReasonDialog.js';
import type { BoardRow } from '../../data/types.js';

interface PendingAction {
  title: string;
  description: string;
  suggestions: string[];
  run: (reason: string) => void;
}

export function MitarbeiterBoard(): JSX.Element {
  const { board } = useCockpitData();
  const [pending, setPending] = useState<PendingAction | null>(null);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        Mitarbeiterboard
      </Typography>
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
    </Stack>
  );
}

interface EmployeeRowProps {
  row: BoardRow;
  requestReason: (a: PendingAction) => void;
}

function EmployeeRow({ row, requestReason }: EmployeeRowProps): JSX.Element {
  const { dataset, withdrawCase, addCaseToBundle, reorderBundle, pauseBundle } = useCockpitData();
  const navigate = useNavigate();
  const bundle = dataset.bundles.find((b) => b.id === row.bundleId);
  const bundleKey = bundle?.caseIds.join() ?? '';
  const [draft, setDraft] = useState<string[]>(bundle?.caseIds ?? []);
  const [addId, setAddId] = useState('');

  // Keep the reorder draft in sync once a mutation changes the bundle.
  useEffect(() => {
    setDraft(bundle?.caseIds ?? []);
  }, [bundleKey, bundle?.caseIds]);

  const pool = dataset.cases.filter((c) => c.status === 'ready' && !c.assignedBundleId);
  const draftCases = draft
    .map((id) => dataset.cases.find((c) => c.id === id))
    .filter((c): c is GoodsReceiptCase => Boolean(c));
  const dirty = bundle ? draft.join() !== bundle.caseIds.join() : false;

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
          <Typography variant="body2">{row.plannedHours} h geplant</Typography>
          <Chip
            size="small"
            label={`${formatPct(row.utilisationPct)} verplant`}
            color={row.utilisationPct > 95 ? 'warning' : 'default'}
          />
          <Typography variant="body2" color="text.secondary">
            {row.effortPoints} Pkt · schwer {row.heavyCaseCount}/leicht {row.lightCaseCount}
          </Typography>
          <Chip
            size="small"
            color={row.openIssues > 0 ? 'error' : 'success'}
            label={`${row.openIssues} Issues`}
          />
          {row.bundleSize != null && (
            <Typography variant="body2">
              Paket {(row.currentCaseIndex ?? 0) + 1}/{row.bundleSize}
            </Typography>
          )}
          {row.paused && <Chip size="small" color="warning" label="Pause" />}
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1}>
          {draftCases.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Kein Paket zugewiesen.
            </Typography>
          )}
          {draftCases.map((c, i) => (
            <Stack key={c.id} direction="row" spacing={1} alignItems="center">
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
              <Typography variant="caption" color="text.secondary">
                {c.storageLocation.code} · {formatMinutes(c.estimatedMinutes)}
              </Typography>
              <Button size="small" onClick={() => navigate(`/belege/${c.id}`)}>
                Details
              </Button>
              <Button
                size="small"
                color="error"
                onClick={() =>
                  requestReason({
                    title: `${c.weBelegNo} von ${row.displayName} entziehen`,
                    description: 'Beleg geht zurück in den Pool.',
                    suggestions: ['Überlastet', 'Falsch zugeteilt', 'Pause/Abwesenheit'],
                    run: (reason) => row.bundleId && withdrawCase(c.id, row.bundleId, reason),
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
              label="Paket hinzufügen"
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              sx={{ minWidth: 220 }}
              disabled={pool.length === 0 || !row.bundleId}
            >
              {pool.length === 0 && <MenuItem value="">Kein freier Beleg</MenuItem>}
              {pool.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.weBelegNo} · {formatMinutes(c.estimatedMinutes)}
                </MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="outlined"
              disabled={!addId || !row.bundleId}
              onClick={() => {
                const c = pool.find((p) => p.id === addId);
                if (!c || !row.bundleId) return;
                requestReason({
                  title: `${c.weBelegNo} zu ${row.displayName} hinzufügen`,
                  description: 'Manuelle Zuweisung an dieses Paket.',
                  suggestions: ['Reserve nutzen', 'Kapazität frei', 'Prio-Beleg'],
                  run: (reason) => {
                    addCaseToBundle(c.id, row.bundleId!, reason);
                    setAddId('');
                  },
                });
              }}
            >
              Hinzufügen
            </Button>

            <Button
              size="small"
              variant="outlined"
              disabled={!dirty || !row.bundleId}
              onClick={() =>
                requestReason({
                  title: `Reihenfolge für ${row.displayName} speichern`,
                  description: 'Neue Abholreihenfolge des Pakets.',
                  suggestions: ['Laufweg optimiert', 'Prio vorgezogen'],
                  run: (reason) => row.bundleId && reorderBundle(row.bundleId, draft, reason),
                })
              }
            >
              Reihenfolge speichern
            </Button>

            <Button
              size="small"
              color="warning"
              variant="outlined"
              disabled={!row.bundleId}
              onClick={() =>
                requestReason({
                  title: `${row.displayName}: ${row.paused ? 'Pause beenden' : 'Pause/Abwesenheit'}`,
                  description: row.paused ? 'Bearbeitung fortsetzen.' : 'Pausiert die Bearbeitung.',
                  suggestions: ['Pause', 'Krank', 'Andere Aufgabe', 'Zurück aus Pause'],
                  run: (reason) => row.bundleId && pauseBundle(row.bundleId, reason),
                })
              }
            >
              {row.paused ? 'Pause beenden' : 'Pause/Abwesenheit'}
            </Button>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
