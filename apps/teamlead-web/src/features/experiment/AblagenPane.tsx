/**
 * Experiment DA.M.B — Digitale Ablagen (Fenster): bettet das ORIGINAL-Board
 * (AblagenBoard, §10.2 — gleiches Design, gleiche Aktionen inkl. Kebab-Menü,
 * Filter, Gruppierung) mit eigenem Saved-View-Key ein und verdrahtet nur die
 * Drag-&-Drop-Hooks des Experiments: Karten auf legale Lanes ziehen (parken/
 * entparken/priorisieren/weiterleiten/zurückholen — nur wo ein echter Endpoint
 * existiert) oder auf Matrix-Zeilen (zuweisen). Während ein Matrix-Beleg
 * gezogen wird, liegt die Entziehen-Zone als Overlay über dem Fenster. Jede
 * Geste mündet im §8.4-ReasonDialog bzw. ForwardDialog des Parents.
 */
import { useMemo, useState, type JSX } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { alpha } from '@mui/material/styles';
import { useCockpitData } from '../../data/store.js';
import type { LaneCard, LaneId } from '../../data/types.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { EXPERIMENT_ABLAGEN_VIEW_KEY } from '../../lib/viewState.js';
import { AblagenBoard, type AblagenDnd } from '../ablagen/AblagenBoard.js';
import {
  ablagenDropAction,
  canWithdraw,
  type ExperimentDragPayload,
} from './experimentDnd.js';

export interface AblagenPaneProps {
  dragging: ExperimentDragPayload | null;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
  requestReason: (action: PendingAction) => void;
  /** Weiterleiten braucht eine Empfängerwahl → ForwardDialog des Parents. */
  onForward: (card: LaneCard) => void;
}

export function AblagenPane({
  dragging,
  onDragStart,
  onDragEnd,
  requestReason,
  onForward,
}: AblagenPaneProps): JSX.Element {
  const { lanes, parkCase, releaseCase, prioritiseCase, deprioritiseCase, unforwardCase, withdraw } =
    useCockpitData();
  const allCards = useMemo(() => lanes.flatMap((l) => l.cards), [lanes]);

  const runDrop = (laneId: LaneId): void => {
    if (dragging === null || dragging.source !== 'ablage') return;
    const action = ablagenDropAction(dragging, laneId);
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

  const dnd: AblagenDnd = {
    // Ziehbar, wenn überhaupt ein legales Ziel existieren kann (ready/parked bzw.
    // weitergeleitet zum Zurückholen) — die Ziele validieren selbst nochmal.
    cardDraggable: (card) =>
      card.forwardedTo !== null || card.status === 'ready' || card.status === 'parked',
    onCardDragStart: ({ card, laneId }, e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.weBelegNo);
      // Kein setDragImage: die GANZE Karte wird als Geisterbild mitgezogen
      // (Nutzer-Vorgabe — nicht nur die vier Griff-Punkte).
      onDragStart({
        source: 'ablage',
        caseId: card.caseId,
        weBelegNo: card.weBelegNo,
        status: card.status,
        lane: laneId,
        priorityFlags: card.priorityFlags,
        forwardedTo: card.forwardedTo,
      });
    },
    onCardDragEnd: onDragEnd,
    laneDroppable: (laneId) => dragging !== null && ablagenDropAction(dragging, laneId) !== null,
    onLaneDrop: runDrop,
    overlay: canWithdraw(dragging) ? (
      <WithdrawZone
        dragging={dragging}
        onWithdraw={(src) =>
          requestReason(buildWithdrawAction(src, (vars) => withdraw.mutate(vars)))
        }
      />
    ) : undefined,
  };

  return <AblagenBoard embedded viewStateKey={EXPERIMENT_ABLAGEN_VIEW_KEY} dnd={dnd} />;
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
