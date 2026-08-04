/**
 * Digitale Ablagen (§10.2 / Anhang E.4, C1–C5). One column per lane (Problemfälle,
 * Weitergeleitet, Geparkt, Prio, Verladeplan heute/morgen, Jeden-Tag, Sonstige).
 *
 * C1: every lane scrolls VERTICALLY inside itself; the lane strip scrolls
 * horizontally at viewport height. C2: lanes are movable (links/rechts) and
 * collapsible, persisted in localStorage. C3: Geparkt cards show who/when/why via
 * the `case.parked` audit events. C4: cards with an open problem preview its kind
 * + note. C5: „Weiterleiten an …" + Weitergeleitet lane grouped by recipient.
 *
 * Ohne eigene Überschrift (Platz für die Lanes); die Filterleiste sitzt hinter
 * einem Ausklapp-Button. Die Komponente ist einbettbar (Experiment DA.M.B):
 * `embedded` + eigener `viewStateKey` + generische `dnd`-Hooks — Karten werden
 * als GANZES gezogen (voller Geist, nicht nur die Griff-Punkte).
 *
 * Each card's teamlead actions come from the single-source {@link CaseActionMenu}
 * registry (derived from the §7.1 status) — no per-lane button logic here.
 */
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type JSX,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import type { components } from '@paket/api-client';
import { CaseStatusChip, problemKindLabels, PriorityChip, ProblemChip } from '@paket/ui';
import { api } from '../../data/api.js';
import { unwrap } from '../../data/http.js';
import { useCockpitData } from '../../data/store.js';
import { formatDateTime, formatMinutes } from '../../lib/format.js';
import { ABLAGEN_VIEW_KEY, loadViewState, saveViewState } from '../../lib/viewState.js';
import { CaseActionMenu } from '../../components/CaseActionMenu.js';
import { InstructionsDialog, issueLabel } from '../../components/InstructionsDialog.js';
import { ForwardDialog, forwardRecipientLabel } from '../../components/ForwardDialog.js';
import { AttentionDialog } from '../../components/AttentionDialog.js';
import { AssignFromListDialog } from '../belege/AssignFromListDialog.js';
import { fetchEmployees } from '../../data/employees.js';
import { useSplits } from '../split/SplitProvider.js';
import { SplitDialog, type SplitDialogEmployee } from '../split/SplitDialog.js';
import type { CaseActionCtx } from '../../actions/caseActions.js';
import type { Lane, LaneCard, LaneId } from '../../data/types.js';
import { AblagenFilterBar } from './AblagenFilterBar.js';
import {
  activeFilterChips,
  filterLaneCardsForLane,
  groupCards,
  sanitizeAblagenFilterState,
  type AblagenFilterState,
  type AblagenGroupBy,
} from './ablagenFilters.js';
import { FOKUS_MARKIERUNG_SX } from '../experiment/fokus.js';

type AuditEventDto = components['schemas']['AuditEventDto'];

/** Karte + Herkunfts-Lane eines beginnenden Drags. */
export interface AblagenCardDragInfo {
  card: LaneCard;
  laneId: LaneId;
}

/**
 * Generische DnD-Hooks des Einbetters (Experiment DA.M.B): Karten ziehen,
 * Lanes als Ziele markieren/bedienen, optionales Overlay (Entziehen-Zone).
 * Ohne `dnd` (Original-Reiter) sind die Karten nicht ziehbar.
 */
export interface AblagenDnd {
  cardDraggable: (card: LaneCard) => boolean;
  onCardDragStart: (info: AblagenCardDragInfo, e: ReactDragEvent) => void;
  onCardDragEnd: () => void;
  laneDroppable: (laneId: LaneId) => boolean;
  onLaneDrop: (laneId: LaneId) => void;
  overlay?: ReactNode;
}

export interface AblagenBoardProps {
  /** Experiment DA.M.B: füllt den Pane (100 %). */
  embedded?: boolean;
  /** Saved-View-Key; eingebettete Instanzen isolieren sich vom Basis-Tab. */
  viewStateKey?: string;
  dnd?: AblagenDnd;
  /** Schnellaktion-Fokus (Experiment): diese Belege 3 s markieren + Lane aufklappen. */
  fokusCaseIds?: ReadonlySet<string> | null;
}

/** Persisted board view state (C2): Reihenfolge + Einklappen + Filter (+ Filterleiste offen). */
interface AblagenViewState {
  laneOrder: LaneId[];
  collapsed: LaneId[];
  filter: AblagenFilterState;
  filtersOpen?: boolean;
}

/** C3: who parked a Beleg, when and why (latest `case.parked` event per case). */
interface ParkedContext {
  actorId: string;
  at: string;
  reason: string | null;
}

/**
 * Merge the persisted lane order with the lanes the data layer actually built:
 * unknown ids are dropped, missing lanes appended in their default position.
 */
function resolveLaneOrder(persisted: LaneId[], lanes: Lane[]): LaneId[] {
  const known = new Set(lanes.map((l) => l.id));
  const ordered = persisted.filter((id) => known.has(id));
  for (const lane of lanes) {
    if (!ordered.includes(lane.id)) ordered.push(lane.id);
  }
  return ordered;
}

/** Latest `case.parked` event per case — events arrive newest first (seq desc). */
function indexParkedEvents(events: AuditEventDto[]): Map<string, ParkedContext> {
  const byCase = new Map<string, ParkedContext>();
  for (const e of events) {
    if (!byCase.has(e.entityId)) {
      byCase.set(e.entityId, { actorId: e.actorId, at: e.at, reason: e.reason ?? null });
    }
  }
  return byCase;
}

export function AblagenBoard({
  embedded = false,
  viewStateKey = ABLAGEN_VIEW_KEY,
  dnd,
  fokusCaseIds = null,
}: AblagenBoardProps = {}): JSX.Element {
  const {
    lanes,
    parkCase,
    releaseCase,
    prioritiseCase,
    deprioritiseCase,
    approveCase,
    cancelCase,
    sendInstruction,
    forwardCase,
    unforwardCase,
    flagAttention,
    unflagAttention,
  } = useCockpitData();
  const navigate = useNavigate();

  // Zuweisen/Weiterleiten/Besondere Aufmerksamkeit/Aufteilen/Instruktionen:
  // shared CaseActionMenu custom actions.
  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [instructionsCaseId, setInstructionsCaseId] = useState<string | null>(null);
  const [forwardCaseId, setForwardCaseId] = useState<string | null>(null);
  const [attentionCaseId, setAttentionCaseId] = useState<string | null>(null);
  const [splitCaseId, setSplitCaseId] = useState<string | null>(null);
  const [splitDone, setSplitDone] = useState<string | null>(null);
  const { recordSplit } = useSplits();
  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', 'split'],
    queryFn: () => fetchEmployees(),
    staleTime: 5 * 60 * 1000,
  });
  const splitEmployees = useMemo<SplitDialogEmployee[]>(
    () =>
      (employeesQuery.data?.employees ?? [])
        .filter((e) => e.active && e.netCapacityToday > 0)
        .map((e) => ({ id: e.id, name: e.displayName, ceilingMinutes: e.netCapacityToday })),
    [employeesQuery.data],
  );

  // C2: display order + collapse, persisted. Bucketing precedence stays fixed in
  // the data layer; this only re-orders/collapses the *display*.
  const [view, setView] = useState<AblagenViewState>(() => {
    const loaded = loadViewState<Partial<AblagenViewState>>(viewStateKey, {});
    return {
      laneOrder: loaded.laneOrder ?? [],
      collapsed: loaded.collapsed ?? [],
      // Sanitized over the default so a stored blob from before the filter
      // feature never yields `undefined` or invalid fields.
      filter: sanitizeAblagenFilterState(loaded.filter),
      filtersOpen: loaded.filtersOpen === true,
    };
  });
  const updateView = (next: AblagenViewState): void => {
    setView(next);
    saveViewState(viewStateKey, next);
  };
  const updateFilter = (filter: AblagenFilterState): void => updateView({ ...view, filter });
  const activeCount = activeFilterChips(view.filter).length;

  // Schnellaktion-Fokus: eingeklappte Lanes mit markierten Karten aufklappen —
  // sonst bliebe die 3-s-Markierung unsichtbar.
  useEffect(() => {
    if (fokusCaseIds === null || fokusCaseIds.size === 0) return;
    const betroffen = lanes
      .filter(
        (l) => view.collapsed.includes(l.id) && l.cards.some((c) => fokusCaseIds.has(c.caseId)),
      )
      .map((l) => l.id);
    if (betroffen.length === 0) return;
    updateView({ ...view, collapsed: view.collapsed.filter((id) => !betroffen.includes(id)) });
    // view/updateView bewusst keine Deps — der Effekt reagiert nur auf den Fokus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fokusCaseIds, lanes]);

  const orderedLanes = useMemo(() => {
    const order = resolveLaneOrder(view.laneOrder, lanes);
    const byId = new Map(lanes.map((l) => [l.id, l]));
    return order.map((id) => byId.get(id)).filter((l): l is Lane => l !== undefined);
  }, [lanes, view.laneOrder]);

  const moveLane = (id: LaneId, direction: -1 | 1): void => {
    const order = orderedLanes.map((l) => l.id);
    const from = order.indexOf(id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, id);
    updateView({ ...view, laneOrder: next });
  };

  const toggleCollapsed = (id: LaneId): void => {
    const collapsed = view.collapsed.includes(id)
      ? view.collapsed.filter((c) => c !== id)
      : [...view.collapsed, id];
    updateView({ ...view, collapsed });
  };

  // C3: join the Geparkt context client-side from the audit feed.
  const parkedEventsQuery = useQuery<Map<string, ParkedContext>, Error>({
    queryKey: ['ablagen', 'parked-events'],
    queryFn: async () => {
      const result = await api.GET('/api/teamlead/events', {
        params: { query: { eventType: 'case.parked', limit: 200 } },
      });
      return indexParkedEvents(unwrap<AuditEventDto[]>(result, 'Laden der geparkten Belege'));
    },
  });
  const parkedContext = parkedEventsQuery.data ?? new Map<string, ParkedContext>();

  const store: CaseActionCtx['store'] = {
    prioritiseCase,
    deprioritiseCase,
    parkCase,
    releaseCase,
    approveCase,
    cancelCase,
    sendInstruction,
    forwardCase,
    unforwardCase,
    flagAttention,
    unflagAttention,
  };

  // Karten sind nur über die dnd-Hooks des Einbetters (Experiment) ziehbar.
  const cardDraggable = (card: LaneCard): boolean => (dnd ? dnd.cardDraggable(card) : false);
  const handleCardDragStart = (info: AblagenCardDragInfo, e: ReactDragEvent): void => {
    dnd?.onCardDragStart(info, e);
  };
  const handleCardDragEnd = (): void => {
    dnd?.onCardDragEnd();
  };

  const allCards = lanes.flatMap((l) => l.cards);
  const assignCard = allCards.find((c) => c.caseId === assignCaseId) ?? null;
  const forwardCard = allCards.find((c) => c.caseId === forwardCaseId) ?? null;
  const attentionCard = allCards.find((c) => c.caseId === attentionCaseId) ?? null;
  const splitCard = allCards.find((c) => c.caseId === splitCaseId) ?? null;
  const instructionsCard = allCards.find((c) => c.caseId === instructionsCaseId) ?? null;

  return (
    <Stack
      spacing={1}
      sx={
        embedded
          ? { height: '100%', minHeight: 0, p: 0.75, position: 'relative' }
          : { height: 'calc(100vh - 48px)', minHeight: 360, position: 'relative' }
      }
    >
      {/* Bewusst OHNE Überschrift — der Reiter heißt schon so; die Filterleiste
          sitzt hinter dem Ausklapp-Button (Platzmaximierung, Nutzer-Vorgabe). */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          size="small"
          color={activeCount > 0 ? 'primary' : 'inherit'}
          startIcon={<FilterListIcon />}
          endIcon={view.filtersOpen === true ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => updateView({ ...view, filtersOpen: view.filtersOpen !== true })}
        >
          Filter{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>
      </Stack>
      <Collapse in={view.filtersOpen === true} timeout={150}>
        <AblagenFilterBar filter={view.filter} onChange={updateFilter} />
      </Collapse>

      {splitDone && (
        <Alert
          severity="success"
          onClose={() => setSplitDone(null)}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/aufteilungen')}>
              Zur Leistung
            </Button>
          }
        >
          Beleg {splitDone} aufgeteilt — Leistung je Anteil unter „Aufteilungen".
        </Alert>
      )}
      {/* C1: the strip scrolls horizontally; each lane owns its vertical scroll. */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          alignItems: 'stretch',
          flex: 1,
          minHeight: 0,
          pb: 1,
        }}
      >
        {orderedLanes.map((lane, index) => (
          <LaneColumn
            key={lane.id}
            lane={lane}
            filteredCards={filterLaneCardsForLane(lane.cards, view.filter, lane.id)}
            groupBy={view.filter.groupBy}
            collapsed={view.collapsed.includes(lane.id)}
            canMoveLeft={index > 0}
            canMoveRight={index < orderedLanes.length - 1}
            onMove={(direction) => moveLane(lane.id, direction)}
            onToggleCollapsed={() => toggleCollapsed(lane.id)}
            parkedContext={parkedContext}
            store={store}
            onOpen={(caseId) => navigate(`/belege/${caseId}`)}
            onAssign={setAssignCaseId}
            onForward={setForwardCaseId}
            onAttention={setAttentionCaseId}
            onSplit={setSplitCaseId}
            onInstructions={setInstructionsCaseId}
            droppable={dnd ? dnd.laneDroppable(lane.id) : false}
            onLaneDrop={() => dnd?.onLaneDrop(lane.id)}
            cardDraggable={cardDraggable}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            fokusCaseIds={fokusCaseIds}
          />
        ))}
      </Box>

      {dnd?.overlay}

      <AssignFromListDialog
        open={assignCard !== null}
        beleg={
          assignCard && {
            id: assignCard.caseId,
            weBelegNo: assignCard.weBelegNo,
            bereich: assignCard.bereich,
            quantity: assignCard.totalQuantity,
            deliveryGroup: assignCard.deliveryGroup,
            attentionNote: assignCard.attentionNote,
          }
        }
        onClose={() => setAssignCaseId(null)}
      />

      <ForwardDialog
        open={forwardCard !== null}
        weBelegNo={forwardCard?.weBelegNo ?? ''}
        onConfirm={(recipient) => {
          if (forwardCard) forwardCase(forwardCard.caseId, recipient);
        }}
        onClose={() => setForwardCaseId(null)}
      />

      <AttentionDialog
        open={attentionCard !== null}
        weBelegNo={attentionCard?.weBelegNo ?? ''}
        onConfirm={(note) => {
          if (attentionCard) flagAttention(attentionCard.caseId, note);
        }}
        onClose={() => setAttentionCaseId(null)}
      />

      <SplitDialog
        open={splitCard !== null}
        beleg={
          splitCard && {
            caseId: splitCard.caseId,
            weBelegNo: splitCard.weBelegNo,
            totalQuantity: splitCard.totalQuantity,
            effortPoints: splitCard.effortPoints,
            estimatedMinutes: splitCard.estimatedMinutes,
          }
        }
        employees={splitEmployees}
        onConfirm={(input) => {
          recordSplit(input);
          setSplitDone(input.weBelegNo);
        }}
        onClose={() => setSplitCaseId(null)}
      />

      {/* Instruktions-Loop (04.08.2026): je Meldung ein Pflichttext, einzeln absendbar. */}
      <InstructionsDialog
        open={instructionsCard !== null}
        weBelegNo={instructionsCard?.weBelegNo ?? ''}
        issues={instructionsCard?.issues ?? []}
        onSend={(issueId, text) => {
          if (instructionsCard) sendInstruction(instructionsCard.caseId, issueId, text);
        }}
        onClose={() => setInstructionsCaseId(null)}
      />
    </Stack>
  );
}

interface LaneColumnProps {
  lane: Lane;
  /** Cards after the global Ablagen filter (README §5) — same order as `lane.cards`. */
  filteredCards: LaneCard[];
  /** "Gruppieren nach" (README §5); 'none' preserves the Weitergeleitet-recipient grouping. */
  groupBy: AblagenGroupBy;
  collapsed: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggleCollapsed: () => void;
  parkedContext: Map<string, ParkedContext>;
  store: CaseActionCtx['store'];
  onOpen: (caseId: string) => void;
  onAssign: (caseId: string) => void;
  onForward: (caseId: string) => void;
  onAttention: (caseId: string) => void;
  onSplit: (caseId: string) => void;
  onInstructions: (caseId: string) => void;
  /** true = legales Ziel für den AKTUELLEN Drag (gestrichelt markiert). */
  droppable: boolean;
  onLaneDrop: () => void;
  cardDraggable: (card: LaneCard) => boolean;
  onCardDragStart: (info: AblagenCardDragInfo, e: ReactDragEvent) => void;
  onCardDragEnd: () => void;
  /** Schnellaktion-Fokus: markierte Belege (3 s). */
  fokusCaseIds: ReadonlySet<string> | null;
}

function LaneColumn({
  lane,
  filteredCards,
  groupBy,
  collapsed,
  canMoveLeft,
  canMoveRight,
  onMove,
  onToggleCollapsed,
  parkedContext,
  store,
  onOpen,
  onAssign,
  onForward,
  onAttention,
  onSplit,
  onInstructions,
  droppable,
  onLaneDrop,
  cardDraggable,
  onCardDragStart,
  onCardDragEnd,
  fokusCaseIds,
}: LaneColumnProps): JSX.Element {
  const [over, setOver] = useState(false);
  const isFiltered = filteredCards.length !== lane.cards.length;

  if (collapsed) {
    return (
      <Paper
        variant="outlined"
        onClick={onToggleCollapsed}
        sx={{
          width: 44,
          flexShrink: 0,
          p: 1,
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
        }}
      >
        <UnfoldMoreIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
        <Chip size="small" label={filteredCards.length} />
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}
        >
          {lane.title}
        </Typography>
      </Paper>
    );
  }

  // C5: the Weitergeleitet lane IS the mocked recipient queue — group by recipient,
  // unless the TL explicitly chose a different "Gruppieren nach" (README §5).
  const groups: { key: string; label: string | null; cards: LaneCard[] }[] =
    groupBy === 'none' && lane.id === 'weitergeleitet'
      ? groupByRecipient(filteredCards)
      : groupCards(filteredCards, groupBy);

  return (
    <Paper
      variant="outlined"
      data-testid={`ablagen-lane-${lane.id}`}
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        // Kind-Elemente lösen ebenfalls dragleave aus — nur echtes Verlassen zählt.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!droppable) return;
        e.preventDefault();
        setOver(false);
        onLaneDrop();
      }}
      sx={{
        width: 290,
        flexShrink: 0,
        p: 1,
        bgcolor: over && droppable ? 'action.hover' : 'background.default',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
        borderStyle: droppable ? 'dashed' : 'solid',
        borderColor: over && droppable ? 'primary.main' : droppable ? 'primary.light' : 'divider',
      }}
    >
      <Stack direction="row" alignItems="center" gap={0.5}>
        <IconButton size="small" disabled={!canMoveLeft} onClick={() => onMove(-1)} aria-label="Spalte nach links">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography sx={{ fontWeight: 700, flex: 1 }} noWrap>
          {lane.title}
        </Typography>
        <Chip
          size="small"
          label={isFiltered ? `${filteredCards.length}/${lane.cards.length}` : lane.cards.length}
          color={isFiltered ? 'warning' : 'default'}
        />
        <IconButton size="small" onClick={onToggleCollapsed} aria-label="Spalte einklappen">
          <UnfoldLessIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
        </IconButton>
        <IconButton size="small" disabled={!canMoveRight} onClick={() => onMove(1)} aria-label="Spalte nach rechts">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography variant="caption" color="text.secondary" noWrap>
        {lane.description} · {formatMinutes(lane.totalEffortMinutes)}
      </Typography>
      {/* C1: the card list owns the vertical scroll — the page never grows. */}
      <Stack spacing={0.75} sx={{ mt: 0.75, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {lane.cards.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            Leer{droppable ? ' — hierher ziehen' : '.'}
          </Typography>
        )}
        {lane.cards.length > 0 && filteredCards.length === 0 && (
          <Typography variant="body2" color="warning.main" sx={{ py: 1, fontWeight: 600 }}>
            Kein Treffer für aktuelle Filter.
          </Typography>
        )}
        {groups.map((group) => (
          <Stack key={group.key} spacing={0.75}>
            {group.label !== null && (
              <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                {group.label} ({group.cards.length})
              </Typography>
            )}
            {group.cards.map((c) => (
              <LaneCardView
                key={c.caseId}
                card={c}
                laneId={lane.id}
                parked={parkedContext.get(c.caseId)}
                store={store}
                onOpen={onOpen}
                onAssign={onAssign}
                onForward={onForward}
                onAttention={onAttention}
                onSplit={onSplit}
                onInstructions={onInstructions}
                draggable={cardDraggable(c)}
                onCardDragStart={onCardDragStart}
                onCardDragEnd={onCardDragEnd}
                fokussiert={fokusCaseIds?.has(c.caseId) ?? false}
              />
            ))}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

/**
 * Meldungs-Zusammenfassung einer Karte (Kundenfeedback 04.08.2026): Anzahl +
 * Offen-Zähler immer sichtbar, ein Klick klappt ALLE Meldungen auf — je Meldung
 * Art, Position, Meldezeit und Einzel-Status (offen rot, instruiert grün).
 */
function CardIssuesSummary({ issues }: { issues: LaneCard['issues'] }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const offen = issues.filter((i) => i.status === 'open').length;
  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        gap={0.25}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        sx={{ cursor: 'pointer' }}
        aria-label={expanded ? 'Meldungen einklappen' : 'Alle Meldungen anzeigen'}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700 }}
          color={offen > 0 ? 'error.main' : 'success.main'}
        >
          {issues.length} {issues.length === 1 ? 'Meldung' : 'Meldungen'}
          {offen > 0 ? ` · ${offen} offen` : ' · alle instruiert'}
        </Typography>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 14 }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 14 }} />
        )}
      </Stack>
      <Collapse in={expanded} timeout={120}>
        <Stack spacing={0.5} sx={{ mt: 0.25, mb: 0.25 }}>
          {issues.map((issue) => (
            <Box
              key={issue.id}
              sx={{
                pl: 0.5,
                borderLeft: 2,
                borderColor: issue.status === 'open' ? 'error.main' : 'success.main',
              }}
            >
              <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap">
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {issueLabel(issue)}
                </Typography>
                <ProblemChip status={issue.status} size="small" />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {issue.positionNo !== null ? `Pos. ${issue.positionNo} · ` : ''}
                {issue.orderNo ? `Order ${issue.orderNo} · ` : ''}
                {new Date(issue.reportedAt).toLocaleTimeString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

/** Group the Weitergeleitet lane's cards by recipient (stable catalog order). */
function groupByRecipient(
  cards: LaneCard[],
): { key: string; label: string; cards: LaneCard[] }[] {
  const byRecipient = new Map<string, LaneCard[]>();
  for (const card of cards) {
    const key = card.forwardedTo ?? 'unbekannt';
    const bucket = byRecipient.get(key) ?? [];
    bucket.push(card);
    byRecipient.set(key, bucket);
  }
  return [...byRecipient.entries()].map(([key, groupCards]) => ({
    key,
    label: forwardRecipientLabel(key),
    cards: groupCards,
  }));
}

function LaneCardView({
  card,
  laneId,
  parked,
  store,
  onOpen,
  onAssign,
  onForward,
  onAttention,
  onSplit,
  onInstructions,
  draggable,
  onCardDragStart,
  onCardDragEnd,
  fokussiert,
}: {
  card: LaneCard;
  laneId: LaneId;
  parked: ParkedContext | undefined;
  store: CaseActionCtx['store'];
  onOpen: (caseId: string) => void;
  onAssign: (caseId: string) => void;
  onForward: (caseId: string) => void;
  onAttention: (caseId: string) => void;
  onSplit: (caseId: string) => void;
  onInstructions: (caseId: string) => void;
  draggable: boolean;
  onCardDragStart: (info: AblagenCardDragInfo, e: ReactDragEvent) => void;
  onCardDragEnd: () => void;
  /** 3-s-Fokus-Markierung (Schnellaktion-Sprung aus dem Cockpit). */
  fokussiert: boolean;
}): JSX.Element {
  // „Instruktionen senden" öffnet den per-Meldung-Dialog (custom action) —
  // derselbe ctx funktioniert von jeder Oberfläche aus, incl. Problemfälle-Lane.
  const ctx: CaseActionCtx = { caseId: card.caseId, store };
  // C3: parked context tooltip (who/when/why) on Geparkt cards.
  const parkedTooltip =
    card.status === 'parked'
      ? `Aus Automatik ausgeschlossen — von TL geparkt · ${parked ? `${parked.actorId} am ${formatDateTime(parked.at)}${parked.reason ? ` — „${parked.reason}"` : ''}` : 'Kontext unbekannt'}`
      : null;

  const statusChip = <CaseStatusChip status={card.status} size="small" />;

  return (
    <Card
      variant="outlined"
      data-fokus-id={card.caseId}
      // Die GANZE Karte ist der Drag-Griff — der Browser zieht sie komplett als
      // Geisterbild mit (Nutzer-Vorgabe: nicht nur vier Punkte).
      draggable={draggable}
      aria-label={draggable ? `${card.weBelegNo} aus Ablage ziehen` : undefined}
      onDragStart={(e) => {
        if (draggable) onCardDragStart({ card, laneId }, e);
      }}
      onDragEnd={onCardDragEnd}
      sx={[
        draggable && { cursor: 'grab', '&:active': { cursor: 'grabbing' } },
        // Schnellaktion-Fokus: 3-s-Markierung der betroffenen Karte.
        fokussiert && FOKUS_MARKIERUNG_SX,
      ]}
    >
      <CardContent sx={{ p: 1, pb: 0.25, '&:last-child': { pb: 0.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
            {card.weBelegNo}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {card.storageCode}
          </Typography>
        </Stack>
        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ my: 0.25 }}>
          {parkedTooltip ? <Tooltip title={parkedTooltip}>{statusChip}</Tooltip> : statusChip}
          {card.priorityFlags.map((f) => (
            <PriorityChip key={f} flag={f} size="small" />
          ))}
          {card.section !== null && <Chip size="small" label={`Abschnitt ${card.section}`} />}
          {card.issueStatus && <ProblemChip status={card.issueStatus} size="small" />}
          {card.attentionFlag && (
            <Tooltip title={card.attentionNote ?? ''}>
              <Chip size="small" color="warning" variant="outlined" label="Aufmerksamkeit" />
            </Tooltip>
          )}
          {card.forwardedTo !== null && (
            <Chip
              size="small"
              color="secondary"
              variant="outlined"
              label={`→ ${forwardRecipientLabel(card.forwardedTo)}`}
            />
          )}
        </Stack>
        {/* Instruktions-Loop (04.08.2026): Anzahl sichtbar + Aufklappen mit ALLEN
            Meldungen (Art, Position, Zeit, Einzel-Status). */}
        {card.issues.length > 0 && <CardIssuesSummary issues={card.issues} />}
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {card.totalQuantity} Teile · {formatMinutes(card.estimatedMinutes)}
          {card.assignedTo ? ` · ${card.assignedTo}` : ''}
        </Typography>
      </CardContent>
      {/* Eine Zeile, drei Slots (Nutzer-Vorgabe 04.08.2026): links „Details",
          in der Mitte die Primäraktion (z. B. „Instruktionen senden"), rechts
          daneben das Kebab-Menü. space-between schiebt Aktion+Kebab nach
          rechts; wrap bleibt nur als Notfall-Fallback (Browser-Zoom). */}
      <CardActions
        sx={{ flexWrap: 'wrap', gap: 0.25, px: 1, py: 0.5, justifyContent: 'space-between' }}
      >
        {/* Quiet by design: pure navigation, not an action — should read as
            lower-priority than the case's actual primary action next to it. */}
        <Button
          size="small"
          variant="text"
          sx={{ color: 'text.secondary', fontWeight: 400, flexShrink: 0 }}
          onClick={() => onOpen(card.caseId)}
        >
          Details
        </Button>
        <CaseActionMenu
          density="compact"
          case={{
            status: card.status,
            priorityFlags: card.priorityFlags,
            assignedTo: card.assignedTo ?? null,
            forwardedTo: card.forwardedTo,
            attentionFlag: card.attentionFlag,
          }}
          weBelegNo={card.weBelegNo}
          ctx={ctx}
          onAssign={onAssign}
          onForward={onForward}
          onAttention={onAttention}
          onSplit={onSplit}
          onInstructions={onInstructions}
        />
      </CardActions>
    </Card>
  );
}
