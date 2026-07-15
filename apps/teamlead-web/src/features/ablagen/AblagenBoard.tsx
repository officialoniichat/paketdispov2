/**
 * Digitale Ablagen (§10.2 / Anhang E.4, C1–C5). One column per lane (Problemfälle,
 * Weitergeleitet, Geparkt, Prio, Verladeplan heute/morgen, Jeden-Tag, Sonstige).
 *
 * C1: every lane scrolls VERTICALLY inside itself; the lane strip scrolls
 * horizontally at viewport height, so the horizontal scrollbar is always visible
 * without scrolling the page. C2: lanes are movable (links/rechts) and
 * collapsible, persisted in localStorage (`paket.view.ablagen`). C3: Geparkt
 * cards show who/when/why via the `case.parked` audit events. C4: cards with an
 * open problem preview its kind + note and deep-link into the Problem tab.
 * C5: cards offer „Weiterleiten an …"; the Weitergeleitet lane groups by
 * recipient and offers „Zurückholen".
 *
 * Each card's teamlead actions come from the single-source {@link CaseActionMenu}
 * registry (derived from the §7.1 status) — no per-lane button logic here.
 */
import { useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
  filterLaneCardsForLane,
  groupCards,
  sanitizeAblagenFilterState,
  type AblagenFilterState,
  type AblagenGroupBy,
} from './ablagenFilters.js';

type AuditEventDto = components['schemas']['AuditEventDto'];

/** Persisted board view state (C2): display order + collapsed lanes + active filter/grouping. */
interface AblagenViewState {
  laneOrder: LaneId[];
  collapsed: LaneId[];
  filter: AblagenFilterState;
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

export function AblagenBoard(): JSX.Element {
  const {
    lanes,
    parkCase,
    releaseCase,
    prioritiseCase,
    deprioritiseCase,
    approveCase,
    cancelCase,
    resolveProblems,
    forwardCase,
    unforwardCase,
    flagAttention,
    unflagAttention,
  } = useCockpitData();
  const navigate = useNavigate();

  // Zuweisen/Weiterleiten/Besondere Aufmerksamkeit/Aufteilen: shared CaseActionMenu custom actions.
  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
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
    const loaded = loadViewState<Partial<AblagenViewState>>(ABLAGEN_VIEW_KEY, {});
    return {
      laneOrder: loaded.laneOrder ?? [],
      collapsed: loaded.collapsed ?? [],
      // Sanitized over the default so a stored blob from before the filter
      // feature — or referencing a since-removed option like the old
      // groupBy: 'assignedTo' — never yields `undefined` or invalid fields.
      filter: sanitizeAblagenFilterState(loaded.filter),
    };
  });
  const updateView = (next: AblagenViewState): void => {
    setView(next);
    saveViewState(ABLAGEN_VIEW_KEY, next);
  };
  const updateFilter = (filter: AblagenFilterState): void => updateView({ ...view, filter });

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
    resolveProblems,
    forwardCase,
    unforwardCase,
    flagAttention,
    unflagAttention,
  };

  const allCards = lanes.flatMap((l) => l.cards);
  const assignCard = allCards.find((c) => c.caseId === assignCaseId) ?? null;
  const forwardCard = allCards.find((c) => c.caseId === forwardCaseId) ?? null;
  const attentionCard = allCards.find((c) => c.caseId === attentionCaseId) ?? null;
  const splitCard = allCards.find((c) => c.caseId === splitCaseId) ?? null;

  return (
    <Stack spacing={1.5} sx={{ height: 'calc(100vh - 140px)', minHeight: 360 }}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        Digitale Ablagen
      </Typography>

      <AblagenFilterBar filter={view.filter} onChange={updateFilter} />

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
      {/* C1: the strip scrolls horizontally at viewport height; each lane owns its
          vertical scroll, so the horizontal scrollbar is always in view. */}
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
            onOpen={(caseId, tab) =>
              navigate(tab ? `/belege/${caseId}?tab=${tab}` : `/belege/${caseId}`)
            }
            onAssign={setAssignCaseId}
            onForward={setForwardCaseId}
            onAttention={setAttentionCaseId}
            onSplit={setSplitCaseId}
          />
        ))}
      </Box>

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
  onOpen: (caseId: string, tab?: string) => void;
  onAssign: (caseId: string) => void;
  onForward: (caseId: string) => void;
  onAttention: (caseId: string) => void;
  onSplit: (caseId: string) => void;
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
}: LaneColumnProps): JSX.Element {
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
      sx={{
        width: 290,
        flexShrink: 0,
        p: 1,
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '100%',
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
            Leer.
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
              />
            ))}
          </Stack>
        ))}
      </Stack>
    </Paper>
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
}: {
  card: LaneCard;
  laneId: LaneId;
  parked: ParkedContext | undefined;
  store: CaseActionCtx['store'];
  onOpen: (caseId: string, tab?: string) => void;
  onAssign: (caseId: string) => void;
  onForward: (caseId: string) => void;
  onAttention: (caseId: string) => void;
  onSplit: (caseId: string) => void;
}): JSX.Element {
  // „Probleme geklärt" is case-scoped (resolves ALL open problems by caseId),
  // so the same ctx works from every surface — incl. the Problemfälle lane card.
  const ctx: CaseActionCtx = { caseId: card.caseId, store };
  // C3: parked context tooltip (who/when/why) on Geparkt cards.
  const parkedTooltip =
    card.status === 'parked'
      ? `Aus Automatik ausgeschlossen — von TL geparkt · ${parked ? `${parked.actorId} am ${formatDateTime(parked.at)}${parked.reason ? ` — „${parked.reason}"` : ''}` : 'Kontext unbekannt'}`
      : null;

  const statusChip = <CaseStatusChip status={card.status} size="small" />;

  return (
    <Card variant="outlined">
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
        {/* C4: open-problem preview (Grund/Art + note) directly on the card. */}
        {card.openIssue && (
          <Typography variant="caption" color="error.main" noWrap sx={{ display: 'block' }}>
            {card.openIssue.reasonLabel ?? problemKindLabels[card.openIssue.kind]}
            {card.openIssue.note ? ` — „${card.openIssue.note}"` : ''}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {card.totalQuantity} Teile · {formatMinutes(card.estimatedMinutes)}
          {card.assignedTo ? ` · ${card.assignedTo}` : ''}
        </Typography>
      </CardContent>
      <CardActions sx={{ flexWrap: 'wrap', gap: 0.25, px: 1, py: 0.5 }}>
        {/* Quiet by design: pure navigation, not an action — should read as
            lower-priority than the case's actual primary action next to it. */}
        <Button
          size="small"
          variant="text"
          sx={{ color: 'text.secondary', fontWeight: 400 }}
          onClick={() => onOpen(card.caseId, laneId === 'probleme' ? 'problem' : undefined)}
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
        />
      </CardActions>
    </Card>
  );
}
