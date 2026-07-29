/**
 * Experiment DA.M.B — Digitale Ablagen (oberes rechtes Fenster).
 *
 * Gleiche Lane-Aufteilung wie die Basis-Ansicht (ein Streifen, horizontal
 * scrollbar, jede Lane scrollt vertikal in sich) — aber höhen-flexibel für den
 * Split-Screen und mit Drag-&-Drop: Karten lassen sich auf andere Lanes ziehen
 * (parken/entparken/priorisieren/… — nur wo ein echter Endpoint existiert) und
 * auf Mitarbeiter-Zeilen der Matrix (zuweisen). Während ein Matrix-Beleg
 * gezogen wird, erscheint unten die Entziehen-Zone (withdraw). Jede Geste
 * mündet im §8.4-ReasonDialog bzw. ForwardDialog des Parents.
 */
import { useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { alpha } from '@mui/material/styles';
import { useCockpitData } from '../../data/store.js';
import type { Lane, LaneCard } from '../../data/types.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { DragDots } from '../board/KanbanBoard.js';
import { forwardRecipientLabel } from '../../components/ForwardDialog.js';
import {
  ablagenDropAction,
  canWithdraw,
  type ExperimentDragPayload,
} from './experimentDnd.js';

export interface AblagenPaneProps {
  groupColorById: Map<string, string>;
  dragging: ExperimentDragPayload | null;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
  requestReason: (action: PendingAction) => void;
  /** Weiterleiten braucht eine Empfängerwahl → ForwardDialog des Parents. */
  onForward: (card: LaneCard) => void;
}

export function AblagenPane({
  groupColorById,
  dragging,
  onDragStart,
  onDragEnd,
  requestReason,
  onForward,
}: AblagenPaneProps): JSX.Element {
  const { lanes, parkCase, releaseCase, prioritiseCase, deprioritiseCase, unforwardCase, withdraw } =
    useCockpitData();
  const allCards = useMemo(() => lanes.flatMap((l) => l.cards), [lanes]);

  const runDrop = (lane: Lane): void => {
    if (dragging === null || dragging.source !== 'ablage') return;
    const action = ablagenDropAction(dragging, lane.id);
    if (action === null) return;
    const src = dragging;
    switch (action.kind) {
      case 'park':
        requestReason({
          title: `${src.weBelegNo} parken`,
          description: 'Der Beleg wird aus der Automatik genommen (Ablage „Geparkt").',
          suggestions: ['Wartet auf Klärung', 'Unvollständige Ware', 'Rücksprache nötig'],
          run: (reason) => parkCase(src.caseId, reason),
        });
        break;
      case 'unpark':
        requestReason({
          title: `${src.weBelegNo} entparken`,
          description: 'Der Beleg geht zurück in seine automatische Ablage.',
          suggestions: ['Klärung erfolgt', 'Ware vollständig'],
          run: (reason) => releaseCase(src.caseId, reason),
        });
        break;
      case 'prioritise':
        requestReason({
          title: `${src.weBelegNo} priorisieren`,
          description: 'Der Beleg wandert in die Prio-Ablage und wird bevorzugt verplant.',
          suggestions: ['Eilig für Verladung', 'Filiale wartet'],
          run: (reason) => prioritiseCase(src.caseId, reason),
        });
        break;
      case 'deprioritise':
        requestReason({
          title: `Priorität entfernen · ${src.weBelegNo}`,
          description:
            'Die manuelle Priorität wird entfernt; der Beleg fällt in seine automatische Ablage zurück.',
          suggestions: ['Nicht mehr eilig', 'Versehentlich priorisiert'],
          run: (reason) => deprioritiseCase(src.caseId, reason),
        });
        break;
      case 'forward': {
        const card = allCards.find((c) => c.caseId === src.caseId);
        if (card) onForward(card);
        break;
      }
      case 'unforward':
        // „Zurückholen" ist auch in der Basis-Ansicht dialogfrei (instant).
        unforwardCase(src.caseId);
        break;
    }
  };

  return (
    <Box sx={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          alignItems: 'stretch',
          flex: 1,
          minHeight: 0,
          p: 0.75,
        }}
      >
        {lanes.map((lane) => (
          <PaneLane
            key={lane.id}
            lane={lane}
            groupColorById={groupColorById}
            dragging={dragging}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropCard={() => runDrop(lane)}
          />
        ))}
      </Box>

      {canWithdraw(dragging) && (
        <WithdrawZone
          dragging={dragging}
          onWithdraw={(src) =>
            requestReason(buildWithdrawAction(src, (vars) => withdraw.mutate(vars)))
          }
        />
      )}
    </Box>
  );
}

interface PaneLaneProps {
  lane: Lane;
  groupColorById: Map<string, string>;
  dragging: ExperimentDragPayload | null;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
  onDropCard: () => void;
}

function PaneLane({
  lane,
  groupColorById,
  dragging,
  onDragStart,
  onDragEnd,
  onDropCard,
}: PaneLaneProps): JSX.Element {
  const [over, setOver] = useState(false);
  const valid = dragging !== null && ablagenDropAction(dragging, lane.id) !== null;
  return (
    <Paper
      variant="outlined"
      data-testid={`experiment-lane-${lane.id}`}
      onDragOver={(e) => {
        if (!valid) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!valid) return;
        e.preventDefault();
        setOver(false);
        onDropCard();
      }}
      sx={{
        width: 210,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderStyle: valid ? 'dashed' : 'solid',
        borderColor: over && valid ? 'primary.main' : valid ? 'primary.light' : 'divider',
        bgcolor: over && valid ? 'action.hover' : undefined,
      }}
    >
      <Box
        sx={{
          px: 0.75,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }} noWrap>
          {lane.title}
        </Typography>
        <Chip size="small" label={lane.cards.length} sx={{ ml: 'auto', height: 16, fontSize: '0.6rem' }} />
      </Box>
      <Box
        sx={{
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          p: 0.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {lane.cards.map((card) => (
          <PaneCard
            key={card.caseId}
            card={card}
            lane={lane}
            groupColor={
              card.deliveryGroup && card.deliveryGroup.presentSize >= 2
                ? groupColorById.get(card.deliveryGroup.id)
                : undefined
            }
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {lane.cards.length === 0 && (
          <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', p: 0.5 }}>
            Leer{valid ? ' — hierher ziehen' : ''}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

interface PaneCardProps {
  card: LaneCard;
  lane: Lane;
  groupColor: string | undefined;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
}

function PaneCard({ card, lane, groupColor, onDragStart, onDragEnd }: PaneCardProps): JSX.Element {
  const navigate = useNavigate();
  // Ziehbar, wenn überhaupt ein legales Ziel existieren kann (ready/parked bzw.
  // weitergeleitet zum Zurückholen) — die Ziele validieren selbst nochmal.
  const draggable =
    card.forwardedTo !== null || card.status === 'ready' || card.status === 'parked';
  return (
    <Paper
      variant="outlined"
      onClick={() => navigate(`/belege/${card.caseId}`)}
      sx={{
        px: 0.75,
        py: 0.5,
        cursor: 'pointer',
        borderLeft: groupColor ? '3px solid' : undefined,
        borderLeftColor: groupColor,
        bgcolor: groupColor ? alpha(groupColor, 0.05) : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {draggable && (
          <Box
            role="button"
            aria-label={`${card.weBelegNo} aus Ablage ziehen`}
            draggable
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', card.weBelegNo);
              if (typeof e.dataTransfer.setDragImage === 'function') {
                e.dataTransfer.setDragImage(e.currentTarget, 12, 10);
              }
              onDragStart({
                source: 'ablage',
                caseId: card.caseId,
                weBelegNo: card.weBelegNo,
                status: card.status,
                lane: lane.id,
                priorityFlags: card.priorityFlags,
                forwardedTo: card.forwardedTo,
              });
            }}
            onDragEnd={onDragEnd}
            sx={{
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              '&:active': { cursor: 'grabbing' },
            }}
          >
            <DragDots />
          </Box>
        )}
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 700 }} noWrap>
          {card.weBelegNo}
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', ml: 'auto', flexShrink: 0 }}>
          {card.totalQuantity} Teile
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }} noWrap>
        {card.storageCode}
        {card.forwardedTo !== null && ` · → ${forwardRecipientLabel(card.forwardedTo)}`}
        {card.openIssue !== null && ' · Problem offen'}
      </Typography>
    </Paper>
  );
}

/**
 * Single-Source des Entziehen-Dialogs — von der Zone im Ablagen-Fenster UND von
 * der Seiten-Ebene (Matrix-Vollbild) genutzt, damit Titel/Gründe identisch sind.
 */
export function buildWithdrawAction(
  src: Extract<ExperimentDragPayload, { source: 'matrix' }>,
  runWithdraw: (vars: { caseId: string; bundleId: string; reason: string }) => void,
): PendingAction {
  return {
    title: `${src.weBelegNo} von ${src.employeeName} entziehen`,
    description: 'Der Beleg geht zurück in den Pool und erscheint wieder in den Ablagen.',
    suggestions: ['Überlastet', 'Falsch zugeteilt', 'Pause/Abwesenheit'],
    run: (reason) => runWithdraw({ caseId: src.caseId, bundleId: src.bundleId, reason }),
  };
}

interface WithdrawZoneProps {
  dragging: Extract<ExperimentDragPayload, { source: 'matrix' }>;
  onWithdraw: (src: Extract<ExperimentDragPayload, { source: 'matrix' }>) => void;
}

/** Nur während eines Matrix-Drags sichtbar: Entziehen — zurück in die Ablagen. */
export function WithdrawZone({ dragging, onWithdraw }: WithdrawZoneProps): JSX.Element {
  const [over, setOver] = useState(false);
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        p: 1.5,
        pointerEvents: 'none',
      }}
    >
      <Paper
        data-testid="experiment-entziehen"
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
          onWithdraw(dragging);
        }}
        elevation={4}
        sx={{
          pointerEvents: 'auto',
          px: 2,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          border: '2px dashed',
          borderColor: 'error.main',
          color: 'error.main',
          bgcolor: (t) => (over ? alpha(t.palette.error.main, 0.12) : t.palette.background.paper),
        }}
      >
        <DeleteOutlineIcon />
        <Typography sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
          Entziehen — zurück in die Ablagen
        </Typography>
      </Paper>
    </Box>
  );
}
