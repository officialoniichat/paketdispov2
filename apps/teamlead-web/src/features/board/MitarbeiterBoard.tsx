/**
 * Mitarbeitenden-Board (§10.3 / Anhang E.4 "Workforce dispatch board").
 *
 * Per person: current Bündel, Skill-Stufe (B5), geplante Teile (B3, Teile-first),
 * Restkapazität, Aufwandspunkte, schwer/leicht mix and Problem-Status. Teamlead
 * actions – Beleg entziehen/zuweisen (per WE-Nr-Eingabe, B1), Reihenfolge neu
 * setzen, Pause/Abwesenheit – are audited (§8.4; der Grund der Zuweisung ist
 * optional, B2) and POSTed to the real backend with optimistic update + rollback.
 *
 * Zwei umschaltbare Ansichten (persistiert als Saved View, C2): die klassische
 * vertikale Liste (Accordions) und das Kanban-Raster ({@link KanbanBoard}) mit
 * Drag-&-Drop-Umhängen zwischen Mitarbeitern.
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { LieferungChip, splitLieferungWarnung } from '../../components/LieferungChip';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import ViewListIcon from '@mui/icons-material/ViewList';
import { assignmentStatusLabels, CaseStatusChip, ltColors, ProblemChip } from '@paket/ui';
import {
  GETEILT_KARTE_SX,
  GeteiltEntfernenMenu,
  GeteiltHinweis,
  geteiltEntfernenAction,
  type GeteiltMenuPosition,
} from '../../components/GeteiltChip.js';
import { useCockpitData } from '../../data/store.js';
import { formatMinutes, formatNumber, formatPct } from '../../lib/format.js';
import { ReasonDialog } from '../../components/ReasonDialog.js';
import { AssignDialog } from '../../components/AssignDialog.js';
import { MoveCaseDialog, type MoveCaseTarget } from '../../components/MoveCaseDialog.js';
import { TierChip, isManualOnlyTier } from '../../components/TierChip.js';
import { BOARD_VIEW_KEY, loadViewState, saveViewState } from '../../lib/viewState.js';
import type { SkillTier } from '@paket/domain-types';
import type { BoardRow } from '../../data/types.js';
import { KanbanBoard } from './KanbanBoard.js';
import { BOARD_SORTS, SKILL_TIER_ORDER, type BoardSort } from './kanbanOrder.js';

/** Persistierte Board-Ansicht: klassische Liste oder Kanban-Raster. */
type BoardView = 'liste' | 'raster';

/** Gesamter persistierter View-State des Boards (Saved View, C2). */
interface BoardViewState {
  view: BoardView;
  /** Anzeige-Sortierung der Raster-Karten. */
  sort: BoardSort;
  /** Erfahrungs-Filter der Raster-Karten; leer = alle. */
  tiers: SkillTier[];
}

const DEFAULT_BOARD_VIEW: BoardViewState = { view: 'liste', sort: 'standard', tiers: [] };

/** Korrupte/alte localStorage-Blobs defensiv auf gültige Werte zurückführen. */
function sanitizeBoardView(raw: Partial<BoardViewState> | null | undefined): BoardViewState {
  return {
    view: raw?.view === 'raster' ? 'raster' : 'liste',
    sort: BOARD_SORTS.includes(raw?.sort as BoardSort) ? (raw?.sort as BoardSort) : 'standard',
    tiers: Array.isArray(raw?.tiers)
      ? raw.tiers.filter((t): t is SkillTier => SKILL_TIER_ORDER.includes(t as SkillTier))
      : [],
  };
}

export interface PendingAction {
  title: string;
  description: string;
  suggestions: string[];
  /**
   * true = der Grund ist kein Pflichtfeld (Kundenfeedback 07.08.2026). Gesetzt von
   * den Zuordnungs-Gesten der DA.M.B-Matrix; `run` bekommt dann ggf. einen leeren
   * String und lässt den Grund weg.
   */
  optional?: boolean;
  run: (reason: string) => void;
}

/** B2 „Beleg verschieben": the Beleg + its current Bündel, picked from a case row. */
interface MovingCase {
  bundleId: string;
  caseId: string;
  weBelegNo: string;
  employeeId: string;
}

export function MitarbeiterBoard(): JSX.Element {
  const {
    board,
    withdraw,
    addToBundle,
    assignToEmployee,
    assignBundle,
    moveCase,
    reorder,
    pauseResume,
    removeParticipant,
  } = useCockpitData();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [movingCase, setMovingCase] = useState<MovingCase | null>(null);
  // Ansicht (Liste ↔ Kanban-Raster) + Raster-Sortierung/-Filter, als Saved View
  // persistiert (C2); korrupte localStorage-Werte fallen defensiv auf Defaults zurück.
  const [viewState, setViewState] = useState<BoardViewState>(() =>
    sanitizeBoardView(loadViewState<Partial<BoardViewState>>(BOARD_VIEW_KEY, DEFAULT_BOARD_VIEW)),
  );
  function updateView(patch: Partial<BoardViewState>): void {
    setViewState((prev) => {
      const next = { ...prev, ...patch };
      saveViewState(BOARD_VIEW_KEY, next);
      return next;
    });
  }

  // First failing intervention drives the error snackbar.
  const failed = [
    withdraw,
    addToBundle,
    assignToEmployee,
    assignBundle,
    moveCase,
    reorder,
    pauseResume,
    removeParticipant,
  ].find((m) => m.isError);

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
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Mitarbeiterboard
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewState.view}
          onChange={(_e, v: BoardView | null) => {
            if (v) updateView({ view: v });
          }}
          aria-label="Board-Ansicht"
        >
          <ToggleButton value="liste" aria-label="Listenansicht">
            <ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />
            Liste
          </ToggleButton>
          <ToggleButton value="raster" aria-label="Kanban-Raster">
            <ViewKanbanIcon fontSize="small" sx={{ mr: 0.5 }} />
            Board
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {splitGroupCount > 0 && (
        <Alert severity="warning" variant="outlined">
          {splitLieferungWarnung(splitGroupCount)}
        </Alert>
      )}
      {viewState.view === 'raster' ? (
        <KanbanBoard
          board={board}
          sort={viewState.sort}
          tiers={viewState.tiers}
          onSortChange={(sort) => updateView({ sort })}
          onTiersChange={(tiers) => updateView({ tiers })}
          requestReason={setPending}
        />
      ) : (
        <Stack spacing={1}>
          {board.map((row) => (
            <EmployeeRow
              key={row.employeeId}
              row={row}
              requestReason={setPending}
              requestMove={setMovingCase}
            />
          ))}
        </Stack>
      )}

      <ReasonDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description}
        suggestions={pending?.suggestions}
        onConfirm={(reason) => pending?.run(reason)}
        onClose={() => setPending(null)}
      />

      <MoveCaseDialog
        open={movingCase !== null}
        weBelegNo={movingCase?.weBelegNo ?? null}
        sourceEmployeeId={movingCase?.employeeId ?? null}
        board={board}
        onClose={() => setMovingCase(null)}
        onSelect={(target: MoveCaseTarget) => {
          const mc = movingCase;
          if (!mc) return;
          setPending({
            title: `${mc.weBelegNo} zu ${target.displayName} verschieben`,
            description: `Der Beleg wird aus dem aktuellen Bündel entfernt und ${target.displayName} zugeteilt.`,
            suggestions: [
              'Auslastung ausgleichen',
              'Bereich passt besser',
              'Auf Wunsch des Mitarbeiters',
            ],
            run: (reason) =>
              moveCase.mutate({
                bundleId: mc.bundleId,
                caseId: mc.caseId,
                targetEmployeeNo: target.employeeId,
                reason,
              }),
          });
        }}
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

/** German label for a Bündel's AssignmentStatus (B1 — status at a glance). */
interface EmployeeRowProps {
  row: BoardRow;
  requestReason: (a: PendingAction) => void;
  requestMove: (m: MovingCase) => void;
}

function EmployeeRow({ row, requestReason, requestMove }: EmployeeRowProps): JSX.Element {
  const { withdraw, assignBundle, reorder, pauseResume, removeParticipant } = useCockpitData();
  const navigate = useNavigate();
  const bundleId = row.bundleId;
  const caseKey = row.cases.map((c) => c.caseId).join();
  const [draft, setDraft] = useState<string[]>(() => row.cases.map((c) => c.caseId));
  const [assignOpen, setAssignOpen] = useState(false);
  // Geteilter Beleg (§4): „Aus geteiltem Beleg entfernen" — es ist immer nur EIN
  // Menü offen, deshalb genügt der Zeile ein Zustand mit der Beleg-Kennung.
  const [geteiltMenu, setGeteiltMenu] = useState<{
    caseId: string;
    pos: GeteiltMenuPosition;
  } | null>(null);

  // Keep the reorder draft in sync once a mutation changes the bundle.
  useEffect(() => {
    setDraft(row.cases.map((c) => c.caseId));
  }, [caseKey, row.cases]);

  const draftCases = draft
    .map((id) => row.cases.find((c) => c.caseId === id))
    .filter((c): c is BoardRow['cases'][number] => c !== undefined);
  const dirty = draft.join() !== row.cases.map((c) => c.caseId).join();
  // Mithilfe (§4): fremde Belege, an denen der MA mitarbeitet — bewusst NICHT im
  // Bündel-Entwurf, sonst würde die Reihenfolge fremder Arbeit mitgespeichert.
  const mithilfe = row.mithilfe ?? [];
  const geteiltBeleg = geteiltMenu
    ? (row.cases.find((c) => c.caseId === geteiltMenu.caseId) ?? null)
    : null;

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
          <TierChip tier={row.skillTier} />
          {isManualOnlyTier(row.skillTier) && (
            <Chip size="small" variant="outlined" color="warning" label="nur manuelle Zuteilung" />
          )}
          {row.cases.length === 0 && (
            <Chip size="small" color="success" variant="outlined" label="frei" />
          )}
          {/* B1: Bündel-Status auf einen Blick (Sammeln/Bearbeitung/Pausiert/…). */}
          {row.bundleStatus != null && !row.paused && (
            <Chip
              size="small"
              variant="outlined"
              label={assignmentStatusLabels[row.bundleStatus]}
            />
          )}
          {/* Teile-first (B3): die Stückzahl ist die primäre Last-Anzeige, Minuten treten zurück. */}
          {row.cases.length > 0 && (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {row.plannedTeile} Teile
            </Typography>
          )}
          <Chip
            size="small"
            label={`${formatPct(row.utilisationPct)} verplant`}
            color={row.utilisationPct > 95 ? 'warning' : 'default'}
          />
          <Typography variant="caption" color="text.secondary">
            {formatNumber(row.plannedHours)} h geplant
          </Typography>
          {row.bereiche.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {row.bereiche.join(', ')}
            </Typography>
          )}
          {row.cases.length > 0 && (
            <Typography variant="body2" color="text.secondary">
              {Math.round(row.effortPoints)} Pkt
            </Typography>
          )}
          {row.openIssues > 0 && <ProblemChip status="open" count={row.openIssues} size="small" />}
          {row.bundleSize != null && row.bundleSize > 0 && (
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
          {draftCases.map((c, i) => {
            const shared = c.sharedWith ?? [];
            const istGeteilt = shared.length > 0;
            return (
              <Stack
                key={c.caseId}
                direction="row"
                spacing={1}
                alignItems="center"
                // Geteilter Beleg (§4): goldene Einfassung — Farbe kommt nie allein,
                // der Hinweis unten nennt die Beteiligten im Klartext.
                sx={
                  istGeteilt
                    ? // Reihenfolge zählt: erst der 1px-Rahmen, dann Farbe und die
                      // 3px-Kante links (sonst überschreibt die Kurzschreibweise sie).
                      { border: '1px solid', ...GETEILT_KARTE_SX, borderRadius: 1, pl: 1, py: 0.25 }
                    : undefined
                }
              >
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
                {istGeteilt && (
                  // Zwischen Belegnummer/Status und „<n> Teile": mit wem gearbeitet wird
                  // (Konzept §4); das Personen-Symbol ist der Touch-Weg zum Menü.
                  <Stack direction="row" spacing={0.25} alignItems="center">
                    <GeteiltHinweis sharedWith={shared} />
                    <IconButton
                      size="small"
                      aria-label={`${c.weBelegNo}: Aus geteiltem Beleg entfernen`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setGeteiltMenu({ caseId: c.caseId, pos: { top: r.bottom, left: r.left } });
                      }}
                      sx={{ p: 0.25, color: ltColors.shared }}
                    >
                      <PersonRemoveIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Stack>
                )}
                {/* Teile-first (B3): Menge primär, Minuten nur noch als Neben-Caption. */}
                <Typography variant="body2">{c.totalQuantity} Teile</Typography>
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
                {/* B2: Beleg direkt in das Bündel eines anderen Mitarbeiters verschieben. */}
                <Button
                  size="small"
                  disabled={!bundleId}
                  onClick={() => {
                    if (bundleId) {
                      requestMove({
                        bundleId,
                        caseId: c.caseId,
                        weBelegNo: c.weBelegNo,
                        employeeId: row.employeeId,
                      });
                    }
                  }}
                >
                  Verschieben
                </Button>
              </Stack>
            );
          })}

          {/* Mithilfe (Zusammenarbeit §4): Belege aus FREMDEN Bündeln, an denen
              diese Person als Helfer beteiligt ist. Sie stehen unter dem eigenen
              Bündel und tragen keine Bündel-Aktionen (Reihenfolge, Entziehen,
              Verschieben) — die gehören zur Zeile des Inhabers. */}
          {mithilfe.length > 0 && (
            <>
              <Typography variant="caption" sx={{ fontWeight: 700, pt: 1 }}>
                Mithilfe ({mithilfe.length})
              </Typography>
              {mithilfe.map((c) => (
                <Stack
                  key={`mithilfe-${c.caseId}`}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{
                    border: '1px solid',
                    ...GETEILT_KARTE_SX,
                    borderRadius: 1,
                    pl: 1,
                    py: 0.25,
                  }}
                >
                  <Typography sx={{ fontWeight: 600 }}>{c.weBelegNo}</Typography>
                  <CaseStatusChip status={c.status} size="small" />
                  <LieferungChip group={c.deliveryGroup} />
                  <Typography variant="body2" sx={{ color: ltColors.shared, fontWeight: 600 }}>
                    Mithilfe bei {c.mithilfeFuer}
                  </Typography>
                  <Typography variant="body2">{c.totalQuantity} Teile</Typography>
                  <Button size="small" onClick={() => navigate(`/belege/${c.caseId}`)}>
                    Details
                  </Button>
                </Stack>
              ))}
            </>
          )}

          <GeteiltEntfernenMenu
            position={geteiltMenu?.pos ?? null}
            sharedWith={geteiltBeleg?.sharedWith ?? []}
            onClose={() => setGeteiltMenu(null)}
            onWahl={(helfer) => {
              setGeteiltMenu(null);
              if (!geteiltBeleg) return;
              requestReason(
                geteiltEntfernenAction(geteiltBeleg.weBelegNo, helfer, (reason) =>
                  removeParticipant.mutate({
                    caseId: geteiltBeleg.caseId,
                    employeeNo: helfer.employeeNo,
                    reason,
                  }),
                ),
              );
            }}
          />

          <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" sx={{ pt: 1 }}>
            {/* A1/A2: WE-Nr-Zuweisung — der Dialog prüft jede Belegnummer live und
                erlaubt, mehrere Belege vor dem Bestätigen zu sammeln (Bündel anlegen). */}
            <Button size="small" variant="outlined" onClick={() => setAssignOpen(true)}>
              {bundleId ? 'Beleg(e) zuweisen' : 'Bündel anlegen'}
            </Button>

            <Button
              size="small"
              variant="outlined"
              disabled={!dirty || !bundleId}
              onClick={() =>
                requestReason({
                  title: `Reihenfolge für ${row.displayName} speichern`,
                  description: 'Neue Abholreihenfolge des Bündels.',
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
            onClose={() => setAssignOpen(false)}
            onConfirm={(caseIds, reason) => {
              // A1/A2: one atomic call for N Belege — the backend finds-or-creates
              // the Bündel exactly as the single-case path used to.
              assignBundle.mutate({ employeeNo: row.employeeId, caseIds, reason });
            }}
          />
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
