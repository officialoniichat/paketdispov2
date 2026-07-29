/**
 * Kanban-Rasteransicht des Mitarbeiterboards (§10.3): 4 Mitarbeiter-Karten pro
 * Zeile (Desktop, darunter responsiv weniger), je Karte vertikal unterteilt in
 * „Laufend" (Bearbeitungsstand des Mitarbeiters) und „Geplant" (Abholreihenfolge
 * danach); Fertige kompakt als Chip-Zeile.
 *
 * Belege werden am 2×2-Punkte-Griff gezogen: Drop auf einen ANDEREN Mitarbeiter
 * löst den bestehenden „Beleg verschieben"-Eingriff aus (B2, moveCase — legt beim
 * Ziel bei Bedarf ein Bündel an), Drop innerhalb desselben Mitarbeiters die
 * auditierte Reihenfolge-Änderung (reorder; nur GEPLANTE Belege, siehe
 * kanbanOrder). Beides läuft wie in der Listenansicht über den ReasonDialog
 * (§8.4) — hier entsteht keine neue Fachlogik, nur eine andere Bedienoberfläche
 * für dieselben Endpoints.
 */
import { useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import { assignmentStatusLabels, CaseStatusChip, ProblemChip } from '@paket/ui';
import { LieferungChip, buildGroupColorMap } from '../../components/LieferungChip.js';
import { TierChip, isManualOnlyTier, tierLabel } from '../../components/TierChip.js';
import { AssignDialog } from '../../components/AssignDialog.js';
import { useCockpitData } from '../../data/store.js';
import { fetchBelegDetail } from '../../data/belege.js';
import { formatMinutes, formatPct } from '../../lib/format.js';
import type { SkillTier } from '@paket/domain-types';
import type { BoardCase, BoardRow } from '../../data/types.js';
import {
  SKILL_TIER_ORDER,
  filterBoardRows,
  partitionBoardCases,
  reorderForDrop,
  sortBoardRows,
  type BoardSort,
  type KanbanPhase,
  type SameEmployeeDropTarget,
} from './kanbanOrder.js';
import type { PendingAction } from './MitarbeiterBoard.js';

/** Der aktuell gezogene Beleg (Quelle) — Komponentenzustand statt dataTransfer,
 * damit Drop-Ziele schon während dragover wissen, ob sie gültig sind. */
export interface KanbanDragPayload {
  caseId: string;
  weBelegNo: string;
  bundleId: string;
  employeeId: string;
  /** Anzeigename des Quell-Mitarbeiters (für den Entziehen-Dialogtitel). */
  employeeName: string;
  phase: KanbanPhase;
}

export interface KanbanBoardProps {
  board: BoardRow[];
  /** Anzeige-Sortierung der Karten (persistiert im Parent). */
  sort: BoardSort;
  /** Erfahrungs-Filter; leer = alle Mitarbeiter. */
  tiers: readonly SkillTier[];
  onSortChange: (sort: BoardSort) => void;
  onTiersChange: (tiers: SkillTier[]) => void;
  /** Öffnet den §8.4-ReasonDialog des Parents (gleicher Fluss wie Listenansicht). */
  requestReason: (a: PendingAction) => void;
}

/** Kurze Labels — das Sortier-Feld bleibt ein kompaktes Rechteck (Teile-first, B3). */
const SORT_LABELS: Record<BoardSort, string> = {
  standard: 'Standard',
  frei: 'Frei → verplant',
  voll: 'Verplant → frei',
  erfahrung: 'Profi zuerst',
  erfahrung_auf: 'Starter zuerst',
};

export function KanbanBoard({
  board,
  sort,
  tiers,
  onSortChange,
  onTiersChange,
  requestReason,
}: KanbanBoardProps): JSX.Element {
  const { withdraw } = useCockpitData();
  const [dragging, setDragging] = useState<KanbanDragPayload | null>(null);

  // Reine Anzeige-Ordnung (Toolbar): erst Erfahrungs-Filter, dann Sortierung.
  const visible = useMemo(
    () => sortBoardRows(filterBoardRows(board, tiers), sort),
    [board, tiers, sort],
  );

  // Gleiche Kennfarbe je Lieferung über ALLE Karten hinweg (Frage 8) — so ist
  // sofort sichtbar, wenn Mitglieder einer Lieferung bei mehreren Mitarbeitern liegen.
  const groupColorById = useMemo(
    () =>
      buildGroupColorMap(
        board.flatMap((r) =>
          r.cases.map((c) =>
            c.deliveryGroup && c.deliveryGroup.presentSize >= 2 ? c.deliveryGroup.id : null,
          ),
        ),
      ),
    [board],
  );

  return (
    <Stack spacing={1}>
      {/* Toolbar: kompaktes Sortier-Feld | Erfahrungs-Filter (getrennt durch „|"). */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="Sortierung"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as BoardSort)}
          sx={{ width: 170, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.6 } }}
        >
          {(Object.keys(SORT_LABELS) as BoardSort[]).map((s) => (
            <MenuItem key={s} value={s} sx={{ fontSize: '0.8rem' }}>
              {SORT_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
        <Typography variant="caption" color="text.secondary">
          Erfahrung:
        </Typography>
        {SKILL_TIER_ORDER.map((tier) => {
          const active = tiers.includes(tier);
          return (
            <Chip
              key={tier}
              size="small"
              label={tierLabel(tier)}
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              onClick={() =>
                onTiersChange(active ? tiers.filter((t) => t !== tier) : [...tiers, tier])
              }
            />
          );
        })}
        {tiers.length > 0 && (
          <>
            <Chip size="small" variant="outlined" label="Filter aufheben" onClick={() => onTiersChange([])} />
            <Typography variant="caption" color="text.secondary">
              {visible.length} von {board.length} Mitarbeitern
            </Typography>
          </>
        )}
      </Stack>
    <Box
      sx={{
        display: 'grid',
        gap: 1.25,
        alignItems: 'start',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          md: 'repeat(3, minmax(0, 1fr))',
          lg: 'repeat(5, minmax(0, 1fr))',
        },
        // Kompaktmodus: alle Chips (Status/Tier/Lieferung/Fertig) im Raster verkleinern.
        '& .MuiChip-sizeSmall': { height: 18 },
        '& .MuiChip-sizeSmall .MuiChip-label': { fontSize: '0.66rem', px: 0.75 },
        '& .MuiChip-sizeSmall .MuiChip-icon': { fontSize: '0.85rem' },
      }}
    >
      {visible.map((row) => (
        <EmployeeCard
          key={row.employeeId}
          row={row}
          dragging={dragging}
          groupColorById={groupColorById}
          onDragStart={setDragging}
          onDragEnd={() => setDragging(null)}
          requestReason={requestReason}
        />
      ))}
      {/* Entziehen per Drop: erscheint nur, solange ein Beleg gezogen wird, und
          mündet im selben §8.4-Dialog wie „Entziehen" in der Listenansicht. */}
      {dragging && (
        <TrashDropZone
          onDrop={() => {
            const src = dragging;
            if (!src) return;
            requestReason({
              title: `${src.weBelegNo} von ${src.employeeName} entziehen`,
              description: 'Beleg geht zurück in den Pool.',
              suggestions: ['Überlastet', 'Falsch zugeteilt', 'Pause/Abwesenheit'],
              run: (reason) =>
                withdraw.mutate({ caseId: src.caseId, bundleId: src.bundleId, reason }),
            });
          }}
        />
      )}
    </Box>
    </Stack>
  );
}

/** Rote Entziehen-Zone (Mülltonne + Label), fixiert am unteren Bildschirmrand. */
function TrashDropZone({ onDrop }: { onDrop: () => void }): JSX.Element {
  const [over, setOver] = useState(false);
  return (
    <Paper
      elevation={6}
      data-testid="kanban-entziehen"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
      sx={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: (t) => t.zIndex.modal,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 3,
        py: 1.5,
        borderRadius: 2,
        border: '2px dashed',
        borderColor: 'error.main',
        color: 'error.main',
        bgcolor: (t) => (over ? alpha(t.palette.error.main, 0.12) : t.palette.background.paper),
        transition: 'background-color 120ms',
      }}
    >
      <DeleteOutlineIcon />
      <Typography sx={{ fontWeight: 700 }}>Entziehen</Typography>
    </Paper>
  );
}

interface EmployeeCardProps {
  row: BoardRow;
  dragging: KanbanDragPayload | null;
  /** Kennfarbe je Lieferung, konsistent über das gesamte Board (Frage 8). */
  groupColorById: ReadonlyMap<string, string>;
  onDragStart: (p: KanbanDragPayload) => void;
  onDragEnd: () => void;
  requestReason: (a: PendingAction) => void;
}

function EmployeeCard({
  row,
  dragging,
  groupColorById,
  onDragStart,
  onDragEnd,
  requestReason,
}: EmployeeCardProps): JSX.Element {
  const { moveCase, reorder, assignBundle, pauseResume } = useCockpitData();
  const navigate = useNavigate();
  const [assignOpen, setAssignOpen] = useState(false);
  const { laufend, geplant, fertig } = partitionBoardCases(row.cases);
  const positionByCaseId = new Map(row.cases.map((c, i) => [c.caseId, i + 1]));

  const crossEmployee = dragging !== null && dragging.employeeId !== row.employeeId;
  // Innerhalb desselben Mitarbeiters sind nur GEPLANTE Belege umsortierbar.
  const sameReorder = dragging !== null && !crossEmployee && dragging.phase === 'geplant';

  function handleDrop(target: SameEmployeeDropTarget): void {
    const src = dragging;
    if (!src) return;
    if (src.employeeId !== row.employeeId) {
      requestReason({
        title: `${src.weBelegNo} zu ${row.displayName} verschieben`,
        description: `Der Beleg wird aus dem aktuellen Bündel entfernt und ${row.displayName} zugeteilt.`,
        suggestions: ['Auslastung ausgleichen', 'Bereich passt besser', 'Auf Wunsch des Mitarbeiters'],
        run: (reason) =>
          moveCase.mutate({
            bundleId: src.bundleId,
            caseId: src.caseId,
            targetEmployeeNo: row.employeeId,
            reason,
          }),
      });
      return;
    }
    const bundleId = row.bundleId;
    if (!bundleId) return;
    const next = reorderForDrop(row.cases, src.caseId, target);
    if (!next) return;
    requestReason({
      title:
        target.kind === 'zone' && target.phase === 'laufend'
          ? `${src.weBelegNo} bei ${row.displayName} als Nächstes vorziehen`
          : `Reihenfolge für ${row.displayName} ändern`,
      description: 'Neue Abholreihenfolge des Bündels.',
      suggestions: ['Laufweg optimiert', 'Prio vorgezogen'],
      run: (reason) => reorder.mutate({ bundleId, caseIds: next, reason }),
    });
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}
    >
      <Stack spacing={0.25}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {row.displayName}
          </Typography>
          <TierChip tier={row.skillTier} />
          {row.paused && (
            <Chip
              size="small"
              color="warning"
              icon={<PauseCircleIcon fontSize="small" />}
              label="Pausiert"
            />
          )}
          {row.cases.length === 0 && !row.paused && (
            <Chip size="small" color="success" variant="outlined" label="frei" />
          )}
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          {row.bundleStatus != null && !row.paused && (
            <Chip size="small" variant="outlined" label={assignmentStatusLabels[row.bundleStatus]} />
          )}
          {/* Teile-first (B3): Stückzahl primär, Auslastung als Kontext. */}
          {row.cases.length > 0 && (
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {row.plannedTeile} Teile
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {formatPct(row.utilisationPct)} verplant
          </Typography>
          {row.openIssues > 0 && <ProblemChip status="open" count={row.openIssues} size="small" />}
          {isManualOnlyTier(row.skillTier) && (
            <Chip size="small" variant="outlined" color="warning" label="nur manuell" />
          )}
        </Stack>
      </Stack>

      {row.cases.length === 0 ? (
        <DropZone
          testId={`kanban-frei-${row.employeeId}`}
          valid={crossEmployee}
          onDrop={() => handleDrop({ kind: 'zone', phase: 'geplant' })}
        >
          <Typography variant="caption" color="text.secondary" sx={{ py: 0.75, textAlign: 'center' }}>
            {crossEmployee ? 'Beleg hierher ziehen' : 'Frei — keine Belege zugewiesen.'}
          </Typography>
        </DropZone>
      ) : (
        // Vertikale Ausdehnung deckeln: lange Bündel scrollen IN der Karte,
        // statt die ganze Seite zu strecken.
        <Box
          sx={{
            overflowY: 'auto',
            maxHeight: 380,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            pr: 0.25,
          }}
        >
          <DropZone
            title={`Laufend (${laufend.length})`}
            testId={`kanban-laufend-${row.employeeId}`}
            valid={crossEmployee || sameReorder}
            onDrop={() => handleDrop({ kind: 'zone', phase: 'laufend' })}
          >
            {laufend.length === 0 && <ZoneHint text="Nichts in Arbeit." />}
            {laufend.map((c) => (
              <CaseCard
                key={c.caseId}
                c={c}
                position={positionByCaseId.get(c.caseId) ?? 0}
                phase="laufend"
                row={row}
                groupColor={c.deliveryGroup ? groupColorById.get(c.deliveryGroup.id) : undefined}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))}
          </DropZone>
          <DropZone
            title={`Geplant (${geplant.length})`}
            testId={`kanban-geplant-${row.employeeId}`}
            valid={crossEmployee || sameReorder}
            onDrop={() => handleDrop({ kind: 'zone', phase: 'geplant' })}
          >
            {geplant.length === 0 && <ZoneHint text="Nichts geplant." />}
            {geplant.map((c) => (
              <CaseCard
                key={c.caseId}
                c={c}
                position={positionByCaseId.get(c.caseId) ?? 0}
                phase="geplant"
                row={row}
                groupColor={c.deliveryGroup ? groupColorById.get(c.deliveryGroup.id) : undefined}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropBefore={
                  sameReorder && dragging?.caseId !== c.caseId
                    ? () => handleDrop({ kind: 'before', caseId: c.caseId })
                    : undefined
                }
              />
            ))}
          </DropZone>
          {fertig.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center" useFlexGap>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                Fertig ({fertig.length}):
              </Typography>
              {fertig.map((c) => (
                <Chip
                  key={c.caseId}
                  size="small"
                  variant="outlined"
                  label={c.weBelegNo}
                  onClick={() => navigate(`/belege/${c.caseId}`)}
                />
              ))}
            </Stack>
          )}
        </Box>
      )}

      <Stack direction="row" spacing={0.75} sx={{ '& .MuiButton-root': { fontSize: '0.7rem', py: 0.125, px: 1 } }}>
        <Button size="small" variant="outlined" onClick={() => setAssignOpen(true)}>
          {row.bundleId ? 'Beleg(e) zuweisen' : 'Bündel anlegen'}
        </Button>
        <Button
          size="small"
          color="warning"
          disabled={!row.bundleId}
          onClick={() =>
            requestReason({
              title: `${row.displayName}: ${row.paused ? 'Pause beenden' : 'Pause/Abwesenheit'}`,
              description: row.paused ? 'Bearbeitung fortsetzen.' : 'Pausiert die Bearbeitung.',
              suggestions: ['Pause', 'Krank', 'Andere Aufgabe', 'Zurück aus Pause'],
              run: (reason) => {
                if (row.bundleId) {
                  pauseResume.mutate({ bundleId: row.bundleId, reason, paused: row.paused });
                }
              },
            })
          }
        >
          {row.paused ? 'Pause beenden' : 'Pause'}
        </Button>
      </Stack>

      <AssignDialog
        open={assignOpen}
        row={row}
        onClose={() => setAssignOpen(false)}
        onConfirm={(caseIds, reason) => {
          assignBundle.mutate({ employeeNo: row.employeeId, caseIds, reason });
        }}
      />
    </Paper>
  );
}

interface DropZoneProps {
  title?: string;
  testId: string;
  /** Nimmt der Bereich den aktuell gezogenen Beleg an? Steuert dragover/drop + Optik. */
  valid: boolean;
  onDrop: () => void;
  children: ReactNode;
}

function DropZone({ title, testId, valid, onDrop, children }: DropZoneProps): JSX.Element {
  const [over, setOver] = useState(false);
  return (
    <Box
      data-testid={testId}
      onDragOver={(e) => {
        if (!valid) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        // Kind-Elemente lösen ebenfalls dragleave aus — nur echtes Verlassen zählt.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!valid) return;
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
      sx={{
        borderRadius: 1.5,
        border: '1px dashed',
        borderColor: over ? 'primary.main' : valid ? 'primary.light' : 'divider',
        bgcolor: over ? 'action.hover' : 'transparent',
        p: 0.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        transition: 'border-color 120ms, background-color 120ms',
      }}
    >
      {title && (
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: '0.62rem',
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {title}
        </Typography>
      )}
      {children}
    </Box>
  );
}

function ZoneHint({ text }: { text: string }): JSX.Element {
  return (
    <Typography variant="caption" color="text.disabled" sx={{ py: 0.5, textAlign: 'center' }}>
      {text}
    </Typography>
  );
}

interface CaseCardProps {
  c: BoardCase;
  /** 1-basierte Position in der Abholreihenfolge des gesamten Bündels. */
  position: number;
  phase: KanbanPhase;
  row: BoardRow;
  /** Kennfarbe der Lieferung dieses Belegs (Frage 8); undefined für Einzelbelege. */
  groupColor?: string;
  onDragStart: (p: KanbanDragPayload) => void;
  onDragEnd: () => void;
  /** Nur gesetzt, wenn „vor diesen Beleg einsortieren" gerade ein gültiges Ziel ist. */
  onDropBefore?: () => void;
}

function CaseCard({
  c,
  position,
  phase,
  row,
  groupColor,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: CaseCardProps): JSX.Element {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [insertBefore, setInsertBefore] = useState(false);
  const draggable = phase !== 'fertig' && row.bundleId != null;

  return (
    <Paper
      ref={rootRef}
      variant="outlined"
      onClick={() => navigate(`/belege/${c.caseId}`)}
      onDragOver={
        onDropBefore
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              setInsertBefore(true);
            }
          : undefined
      }
      onDragLeave={
        onDropBefore
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setInsertBefore(false);
              }
            }
          : undefined
      }
      onDrop={
        onDropBefore
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setInsertBefore(false);
              onDropBefore();
            }
          : undefined
      }
      sx={{
        p: 0.5,
        display: 'flex',
        gap: 0.25,
        alignItems: 'flex-start',
        cursor: 'pointer',
        // Frage 8: Mitglieder derselben Lieferung tragen überall dieselbe Kennfarbe.
        ...(groupColor
          ? { borderLeft: `3px solid ${groupColor}`, bgcolor: alpha(groupColor, 0.05) }
          : {}),
        // Einfüge-Marke „vor diesem Beleg" während eines gültigen dragover.
        boxShadow: insertBefore ? (t) => `0 -2px 0 0 ${t.palette.primary.main}` : 'none',
        '&:hover': { borderColor: 'primary.main' },
      }}
    >
      {draggable && (
        <Box
          role="button"
          aria-label={`${c.weBelegNo} ziehen`}
          draggable
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', c.weBelegNo);
            // Ganze Mini-Karte als Drag-Bild (in jsdom-Tests nicht vorhanden).
            if (rootRef.current && typeof e.dataTransfer.setDragImage === 'function') {
              e.dataTransfer.setDragImage(rootRef.current, 16, 16);
            }
            onDragStart({
              caseId: c.caseId,
              weBelegNo: c.weBelegNo,
              // draggable garantiert bundleId — Belege existieren nur im Bündel.
              bundleId: row.bundleId ?? '',
              employeeId: row.employeeId,
              employeeName: row.displayName,
              phase,
            });
          }}
          onDragEnd={onDragEnd}
          sx={{
            cursor: 'grab',
            p: 0.375,
            mt: '2px',
            borderRadius: 0.75,
            '&:hover': { bgcolor: 'action.hover' },
            '&:active': { cursor: 'grabbing' },
          }}
        >
          <DragDots />
        </Box>
      )}
      <Stack spacing={0.125} sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {position}. {c.weBelegNo}
          </Typography>
          <CaseStatusChip status={c.status} size="small" />
          <CaseQuickInfo c={c} />
        </Stack>
        {c.deliveryGroup && (
          <Box>
            <LieferungChip group={c.deliveryGroup} identityColor={groupColor} />
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.66rem' }}>
          {c.totalQuantity} Teile · {formatMinutes(c.estimatedMinutes)}
          {c.storageCode ? ` · ${c.storageCode}` : ''}
        </Typography>
      </Stack>
    </Paper>
  );
}

/**
 * Schnellinfo („!" im Kreis, oben rechts am Beleg-Container): Mini-Tooltip, der
 * aus der Karte herausklappt und die wichtigsten Detail-Infos zeigt — bewusst
 * KEIN Dialog. Die Kopf-Daten werden erst beim Öffnen nachgeladen (react-query,
 * gecacht); Klick auf die Karte selbst führt weiterhin zur Detailseite.
 */
function CaseQuickInfo({ c }: { c: BoardCase }): JSX.Element {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['board-case-quickinfo', c.caseId],
    queryFn: () => fetchBelegDetail(c.caseId),
    enabled: open,
    staleTime: 30_000,
  });
  const d = detail.data;

  const row = (label: string, value: string): JSX.Element => (
    <>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 600 }}>{value}</Typography>
    </>
  );

  return (
    <Tooltip
      arrow
      placement="right-start"
      open={open}
      onClose={() => setOpen(false)}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 4,
            maxWidth: 320,
            p: 1.25,
          },
        },
        arrow: { sx: { color: 'background.paper' } },
      }}
      title={
        <Stack spacing={0.75} sx={{ minWidth: 210 }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {c.weBelegNo}
            </Typography>
            <CaseStatusChip status={c.status} size="small" />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {c.totalQuantity} Teile · {formatMinutes(c.estimatedMinutes)}
            {c.storageCode ? ` · ${c.storageCode}` : ''}
          </Typography>
          {detail.isPending && open && (
            <Typography variant="caption" color="text.secondary">
              Details laden…
            </Typography>
          )}
          {detail.isError && (
            <Typography variant="caption" color="error">
              Details konnten nicht geladen werden.
            </Typography>
          )}
          {d && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: 1,
                rowGap: 0.25,
                '& .MuiTypography-root': { fontSize: '0.7rem' },
              }}
            >
              {row('Filiale', d.branchNo)}
              {row('Lieferschein', d.deliveryNoteNo ?? '—')}
              {row('Warenart', d.goodsType ?? '—')}
              {row('Buchung', d.bookingDate.slice(0, 10))}
              {row('Positionen', String(d.positions.length))}
              {row('Zugewiesen', d.assignedEmployeeName ?? '—')}
              {d.hasOpenIssue && (
                <>
                  <Typography sx={{ color: 'error.main' }}>Problem</Typography>
                  <Typography sx={{ color: 'error.main', fontWeight: 700 }}>offen</Typography>
                </>
              )}
              {d.attentionFlag && (
                <>
                  <Typography sx={{ color: 'warning.main' }}>Aufmerksamkeit</Typography>
                  <Typography sx={{ color: 'warning.main', fontWeight: 700 }}>
                    {d.attentionNote ?? 'markiert'}
                  </Typography>
                </>
              )}
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
            Klick auf die Karte öffnet die vollständigen Details.
          </Typography>
        </Stack>
      }
    >
      <IconButton
        size="small"
        aria-label={`${c.weBelegNo} Schnellinfo`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Nur öffnen (Hover hat ggf. schon geöffnet) — nie togglen, sonst
          // schließt der Klick den frisch aufgeklappten Tooltip sofort wieder.
          e.stopPropagation();
          setOpen(true);
        }}
        sx={{ p: 0.125, ml: 'auto', color: 'text.secondary' }}
      >
        <ErrorOutlineIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Tooltip>
  );
}

/** 2×2-Punkte-Quadrat (2 Punkte oben, 2 darunter) als Drag-Griff eines Belegs. */
function DragDots(): JSX.Element {
  return (
    <Box
      aria-hidden
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 4px)',
        gap: '3px',
        '& > span': { width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.secondary' },
      }}
    >
      <span />
      <span />
      <span />
      <span />
    </Box>
  );
}
