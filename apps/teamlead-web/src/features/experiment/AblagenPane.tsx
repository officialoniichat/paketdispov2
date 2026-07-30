/**
 * Experiment DA.M.B — Digitale Ablagen (Fenster): bettet das ORIGINAL-Board
 * (AblagenBoard, §10.2 — gleiches Design, gleiche Aktionen inkl. Kebab-Menü,
 * Filter, Gruppierung) mit eigenem Saved-View-Key ein und verdrahtet nur die
 * Drag-&-Drop-Hooks des Experiments: Karten auf legale Lanes ziehen (parken/
 * entparken/priorisieren/weiterleiten/zurückholen — nur wo ein echter Endpoint
 * existiert) oder auf Matrix-Zeilen (zuweisen). Während ein Matrix-Beleg
 * gezogen wird, liegt die Pool-Rückgabe als BLAUER Schleier mit Recycling-Icon
 * über dem ganzen Fenster: Loslassen = Entziehen (zurück in den Pool); 3 s
 * darüber halten öffnet die manuelle Zielwahl (Geparkt/Prio/Weiterleiten —
 * jeweils Entziehen + bestehende auditierte Aktion). Jede Geste mündet im
 * §8.4-ReasonDialog bzw. ForwardDialog des Parents.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BoltIcon from '@mui/icons-material/Bolt';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import RecyclingIcon from '@mui/icons-material/Recycling';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { alpha } from '@mui/material/styles';
import { ltColors } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import type { LaneId } from '../../data/types.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { EXPERIMENT_ABLAGEN_VIEW_KEY } from '../../lib/viewState.js';
import { AblagenBoard, type AblagenDnd } from '../ablagen/AblagenBoard.js';
import {
  ablagenDropAction,
  canWithdraw,
  type ExperimentDragPayload,
} from './experimentDnd.js';

/** Minimaler Beleg-Verweis für die Empfängerwahl (ForwardDialog des Parents). */
export interface ForwardRef {
  caseId: string;
  weBelegNo: string;
}

export interface AblagenPaneProps {
  dragging: ExperimentDragPayload | null;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
  requestReason: (action: PendingAction) => void;
  /** Weiterleiten braucht eine Empfängerwahl → ForwardDialog des Parents. */
  onForward: (card: ForwardRef) => void;
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

  /** 3-s-Zielwahl: Entziehen + direkt weiter in Geparkt/Prio/Weiterleiten. */
  const runZiel = (
    kind: PoolZielKind,
    src: Extract<ExperimentDragPayload, { source: 'matrix' }>,
  ): void => {
    const nachher = { caseId: src.caseId, bundleId: src.bundleId };
    if (kind === 'geparkt') {
      requestReason({
        title: `${src.weBelegNo} entziehen und parken`,
        description:
          'Der Beleg wird dem Mitarbeiter entzogen und landet direkt in „Geparkt" (aus der Automatik genommen).',
        suggestions: ['Wartet auf Klärung', 'Falsch zugeteilt', 'Unvollständige Ware'],
        run: (reason) => {
          // Kette zweier auditierten Aktionen: erst Entziehen, dann Parken.
          void withdraw
            .mutateAsync({ ...nachher, reason })
            .then(() => parkCase(src.caseId, reason))
            .catch(() => undefined); // Fehler zeigt die Snackbar des Parents.
        },
      });
    } else if (kind === 'prio') {
      requestReason({
        title: `${src.weBelegNo} entziehen und priorisieren`,
        description:
          'Der Beleg wird dem Mitarbeiter entzogen und wandert in die Prio-Ablage (bevorzugt verplant).',
        suggestions: ['Eilig für Verladung', 'Filiale wartet'],
        run: (reason) => {
          void withdraw
            .mutateAsync({ ...nachher, reason })
            .then(() => prioritiseCase(src.caseId, reason))
            .catch(() => undefined);
        },
      });
    } else {
      requestReason({
        title: `${src.weBelegNo} entziehen und weiterleiten`,
        description: 'Erst zurück in den Pool — danach öffnet sich die Empfängerwahl.',
        suggestions: ['Retoure', 'Falsche Abteilung'],
        run: (reason) => {
          void withdraw
            .mutateAsync({ ...nachher, reason })
            .then(() => onForward({ caseId: src.caseId, weBelegNo: src.weBelegNo }))
            .catch(() => undefined);
        },
      });
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
      <PoolRueckgabeOverlay
        dragging={dragging}
        onPool={(src) =>
          requestReason(buildWithdrawAction(src, (vars) => withdraw.mutate(vars)))
        }
        onZiel={runZiel}
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

/** Manuelle Ziele der 3-s-Halte-Wahl (jeweils Entziehen + Folgeaktion). */
export type PoolZielKind = 'geparkt' | 'prio' | 'weiterleiten';

type MatrixDrag = Extract<ExperimentDragPayload, { source: 'matrix' }>;

interface PoolRueckgabeOverlayProps {
  dragging: MatrixDrag;
  /** Drop irgendwo auf der Fläche: Entziehen — zurück in den Pool (unassigned). */
  onPool: (src: MatrixDrag) => void;
  /** Drop auf einen Ziel-Chip der 3-s-Wahl; fehlt er (Leiste), gibt es keine Wahl. */
  onZiel?: (kind: PoolZielKind, src: MatrixDrag) => void;
  /** Kompakte Leiste (Matrix-Vollbild) statt Vollflächen-Schleier. */
  leiste?: boolean;
}

/**
 * Pool-Rückgabe während eines Matrix-Drags: blauer Schleier über dem GANZEN
 * Ablagen-Fenster mit Recycling-Icon in der Mitte — Loslassen entzieht den
 * Beleg (zurück in den Pool). Wer 3 Sekunden darüber hält, bekommt die
 * manuelle Zielwahl (Geparkt/Prio/Weiterleiten; Problemfälle entstehen nur
 * durch Mitarbeiter-Meldungen und sind daher kein Ziel).
 */
export function PoolRueckgabeOverlay({
  dragging,
  onPool,
  onZiel,
  leiste = false,
}: PoolRueckgabeOverlayProps): JSX.Element {
  const [over, setOver] = useState(false);
  const [ziele, setZiele] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const disarm = (): void => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const armHold = (): void => {
    if (onZiel === undefined || ziele || holdTimer.current !== null) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      setZiele(true);
    }, 3000);
  };
  useEffect(() => disarm, []);
  const reset = (): void => {
    disarm();
    setOver(false);
    setZiele(false);
  };

  const zielChip = (
    kind: PoolZielKind,
    icon: JSX.Element,
    label: string,
  ): JSX.Element => (
    <Paper
      key={kind}
      elevation={4}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        reset();
        onZiel?.(kind, dragging);
      }}
      sx={{
        px: 1.5,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        fontWeight: 700,
        fontSize: '0.78rem',
        border: '2px dashed',
        borderColor: ltColors.brand,
        color: ltColors.brand,
        bgcolor: '#fff',
      }}
    >
      {icon}
      {label}
    </Paper>
  );

  if (leiste) {
    // Matrix-Vollbild: kompakte Leiste unten (die Ablagen sind ausgeblendet).
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
          data-testid="pool-rueckgabe"
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
            reset();
            onPool(dragging);
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
            borderColor: ltColors.brand,
            color: ltColors.brand,
            bgcolor: over ? alpha(ltColors.brand, 0.12) : 'background.paper',
          }}
        >
          <RecyclingIcon />
          <Typography sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
            Zurück in den Pool (nicht zugewiesen)
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      data-testid="pool-rueckgabe"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setOver(true);
        armHold();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) reset();
      }}
      onDrop={(e) => {
        e.preventDefault();
        reset();
        onPool(dragging);
      }}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.25,
        // Blauer Schleier über dem ganzen Fenster (Nutzer-Vorgabe).
        bgcolor: alpha(ltColors.brand, over ? 0.3 : 0.22),
        border: '2px dashed',
        borderColor: ltColors.brand,
      }}
    >
      <RecyclingIcon
        sx={{
          fontSize: 72,
          color: ltColors.brand,
          bgcolor: '#fff',
          borderRadius: '50%',
          p: 1.25,
          boxShadow: 4,
        }}
      />
      <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
        Loslassen: {dragging.weBelegNo} zurück in den Pool (nicht zugewiesen)
      </Typography>
      {onZiel !== undefined && !ziele && (
        <Typography sx={{ fontSize: '0.78rem', color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
          … oder 3 Sekunden halten für die manuelle Zielwahl
        </Typography>
      )}
      {ziele && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', px: 2 }}>
          {zielChip('geparkt', <Inventory2OutlinedIcon fontSize="small" />, 'Geparkt')}
          {zielChip('prio', <BoltIcon fontSize="small" />, 'Prio')}
          {zielChip('weiterleiten', <SendOutlinedIcon fontSize="small" />, 'Weiterleiten')}
          <Tooltip title="Problemfälle entstehen nur durch Mitarbeiter-Meldungen — kein manuelles Ziel.">
            <Paper
              elevation={0}
              sx={{
                px: 1.5,
                py: 0.75,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                fontWeight: 700,
                fontSize: '0.78rem',
                border: '2px dashed',
                borderColor: 'divider',
                color: 'text.disabled',
                bgcolor: alpha('#ffffff', 0.7),
              }}
            >
              <ReportProblemOutlinedIcon fontSize="small" />
              Problemfälle
            </Paper>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
