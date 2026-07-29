/**
 * Experiment DA.M.B — 3-Fenster-Workspace (Digitale Ablagen · Mitarbeiter-
 * Matrix · Belege) als EIGENER experimenteller Reiter. Die Basis-Tabs bleiben
 * unberührt: die Beleg-Liste wird unverändert eingebettet, Ablagen und Matrix
 * sind Experiment-eigene Ansichten über denselben Daten (useCockpitData).
 *
 * Layout: randlos bis an die Fenster-Kanten (AppShell rendert /experiment ohne
 * Container). Drei Anordnungen — Matrix unten/rechts/links, s.
 * experimentLayout.ts; ein Drag über den Anschlag hinaus baut die Anordnung um
 * (z. B. Belege-Unterkante ganz nach unten → Belege volle Höhe, Matrix rückt
 * nach rechts). Die drei Fenster sind IMMER dieselben Baum-Geschwister; Umbau
 * und Vollbild sind reines CSS — ein Remount würde Seitenzahl, Filter-Entwürfe
 * und Scroll-Positionen der eingebetteten Fenster verwerfen. Drag-&-Drop-Gesten
 * aller Fenster münden im hiesigen §8.4-ReasonDialog bzw. ForwardDialog; der
 * Drag-Zustand lebt screen-global (KanbanBoard-Muster).
 */
import {
  useMemo,
  useRef,
  useState,
  type JSX,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import LocalMallOutlinedIcon from '@mui/icons-material/LocalMallOutlined';
import type { SxProps, Theme } from '@mui/material/styles';
import { ltColors } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import type { LaneCard } from '../../data/types.js';
import { buildGroupColorMap } from '../../components/LieferungChip.js';
import { ReasonDialog } from '../../components/ReasonDialog.js';
import { ForwardDialog } from '../../components/ForwardDialog.js';
import {
  EXPERIMENT_BELEGE_VIEW_KEY,
  EXPERIMENT_VIEW_KEY,
  EXPERIMENT_ZOOM_VIEW_KEY,
  loadViewState,
  saveViewState,
} from '../../lib/viewState.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { BelegListPage } from '../belege/BelegListPage.js';
import { AblagenPane, WithdrawZone, buildWithdrawAction } from './AblagenPane.js';
import { MatrixBoard, MatrixInfo } from './MatrixBoard.js';
import { VorverteilungPane } from './VorverteilungPane.js';
import { canWithdraw, type ExperimentDragPayload } from './experimentDnd.js';
import {
  DEFAULT_SPLIT,
  applySegDrag,
  paneRects,
  sanitizeSplit,
  splitterSegs,
  type ExperimentSplit,
  type PaneId,
  type PaneRect,
  type SplitterSeg,
} from './experimentLayout.js';

export function ExperimentPage(): JSX.Element {
  const { board, forwardCase, withdraw, assignToEmployee, moveCase } = useCockpitData();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dragging, setDragging] = useState<ExperimentDragPayload | null>(null);
  const [forwardCard, setForwardCard] = useState<LaneCard | null>(null);
  const [focus, setFocus] = useState<PaneId | null>(null);
  // Flip-Karte des Beleg-Fensters: Vorderseite Beleg-Liste, Rückseite Vorverteilung.
  const [vorverteilungOffen, setVorverteilungOffen] = useState(false);
  const [split, setSplit] = useState<ExperimentSplit>(() =>
    sanitizeSplit(loadViewState<Partial<ExperimentSplit>>(EXPERIMENT_VIEW_KEY, DEFAULT_SPLIT)),
  );
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  // Frische Split-Sicht für die window-Listener (pointermove läuft außerhalb des React-Zyklus).
  const splitRef = useRef(split);
  splitRef.current = split;
  // Lupe ± je Fenster: Inhalt rein-/rauszoomen wie ⌘+/⌘− (CSS zoom), persistiert.
  const [zoom, setZoom] = useState<Record<PaneId, number>>(() => {
    const raw = loadViewState<Partial<Record<PaneId, number>> | null>(EXPERIMENT_ZOOM_VIEW_KEY, {});
    const norm = (v: unknown): number =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1.5, Math.max(0.6, v)) : 1;
    return { belege: norm(raw?.belege), ablagen: norm(raw?.ablagen), matrix: norm(raw?.matrix) };
  });
  const changeZoom = (pane: PaneId, delta: number): void => {
    setZoom((z) => {
      const next = {
        ...z,
        [pane]: Math.min(1.5, Math.max(0.6, Math.round((z[pane] + delta) * 10) / 10)),
      };
      saveViewState(EXPERIMENT_ZOOM_VIEW_KEY, next);
      return next;
    });
  };

  // Erste fehlgeschlagene DnD-Mutation treibt die Fehler-Snackbar (Board-Muster).
  const failed = [withdraw, assignToEmployee, moveCase].find((m) => m.isError);

  // Lieferungs-Farben der Matrix-Striche (das Ablagen-Fenster nutzt seit dem
  // Original-Design-Embed die LieferungChip-Darstellung des Basis-Boards).
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

  const startSegDrag =
    (segId: SplitterSeg['id'], axis: SplitterSeg['axis']) =>
    (e: ReactPointerEvent): void => {
      // Nur Primärtaste/-pointer: ein Rechtsklick öffnet das Kontextmenü und
      // verschluckt das pointerup — die Listener blieben sonst hängen.
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      const start = splitRef.current;
      let last = start;
      const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      const onMove = (ev: PointerEvent): void => {
        // Rect je Bewegung frisch lesen: bei Scroll/Resize während des Drags
        // wäre ein beim pointerdown eingefrorenes Rect versetzt.
        const rect = workspaceRef.current?.getBoundingClientRect();
        if (rect === undefined) return;
        const raw =
          axis === 'y'
            ? ((ev.clientY - rect.top) / rect.height) * 100
            : ((ev.clientX - rect.left) / rect.width) * 100;
        const next = applySegDrag(last, segId, raw, start);
        const restructured = next.matrixPos !== last.matrixPos;
        last = next;
        setSplit(next);
        if (restructured) {
          // Umbau: das gezogene Segment existiert in der neuen Anordnung nicht mehr.
          cleanup();
          saveViewState(EXPERIMENT_VIEW_KEY, next);
        }
      };
      const onUp = (): void => {
        cleanup();
        saveViewState(EXPERIMENT_VIEW_KEY, last);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

  const toggleFocus = (pane: PaneId): void => setFocus((f) => (f === pane ? null : pane));
  const clearDrag = (): void => setDragging(null);

  const belegePane = (
    <Pane
      title={vorverteilungOffen ? 'Vorverteilung' : 'Beleg-Übersicht'}
      focused={focus === 'belege'}
      onToggleFullscreen={() => toggleFocus('belege')}
      zoom={zoom.belege}
      onZoomDelta={(delta) => changeZoom('belege', delta)}
      center={
        <Tooltip
          title={
            vorverteilungOffen
              ? 'Karte zurückdrehen — Beleg-Übersicht'
              : 'Karte umdrehen — Vorverteilung (Bündel vorbereiten)'
          }
        >
          {/* Flip-Knopf (Nutzer-Wunsch): dezentes abgerundetes Quadrat im
              Sidebar-Blau mit weißer Bündel-Tasche, oben mittig zentriert. */}
          <Box
            component="button"
            type="button"
            aria-label={
              vorverteilungOffen ? 'Zur Beleg-Übersicht drehen' : 'Zur Vorverteilung drehen'
            }
            onClick={() => setVorverteilungOffen((v) => !v)}
            sx={{
              width: 22,
              height: 22,
              p: 0,
              border: 'none',
              borderRadius: 1,
              bgcolor: ltColors.brand,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              '&:hover': { filter: 'brightness(1.15)' },
            }}
          >
            <LocalMallOutlinedIcon sx={{ fontSize: 14 }} />
          </Box>
        </Tooltip>
      }
    >
      {/* Flip-Karte: 3D-Drehung um die Y-Achse. Beide Seiten bleiben gemountet,
          damit Tabellen-Filter/Scroll und der Vorschlag ihren Zustand behalten;
          die verdeckte Seite ist inert (aria-hidden + pointerEvents none). */}
      <Box sx={{ height: '100%', perspective: '1600px' }}>
        <Box
          sx={{
            position: 'relative',
            height: '100%',
            transformStyle: 'preserve-3d',
            transition: 'transform 500ms ease',
            transform: vorverteilungOffen ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          <Box
            aria-hidden={vorverteilungOffen}
            sx={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              overflow: 'auto',
              p: 1,
              pointerEvents: vorverteilungOffen ? 'none' : 'auto',
              bgcolor: 'background.paper',
            }}
          >
            {/* Eigener Saved-View-Key: das Experiment darf /belege nicht umkonfigurieren. */}
            <BelegListPage viewStateKey={EXPERIMENT_BELEGE_VIEW_KEY} fill />
          </Box>
          <Box
            aria-hidden={!vorverteilungOffen}
            sx={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              pointerEvents: vorverteilungOffen ? 'auto' : 'none',
              bgcolor: 'background.paper',
            }}
          >
            <VorverteilungPane
              active={vorverteilungOffen}
              dragging={dragging}
              onDragStart={setDragging}
              onDragEnd={clearDrag}
            />
          </Box>
        </Box>
      </Box>
    </Pane>
  );
  const ablagenPane = (
    <Pane
      title="Digitale Ablagen"
      focused={focus === 'ablagen'}
      onToggleFullscreen={() => toggleFocus('ablagen')}
      zoom={zoom.ablagen}
      onZoomDelta={(delta) => changeZoom('ablagen', delta)}
    >
      <AblagenPane
        dragging={dragging}
        onDragStart={setDragging}
        onDragEnd={clearDrag}
        requestReason={setPending}
        onForward={setForwardCard}
      />
    </Pane>
  );
  const matrixPane = (
    <Pane
      title="Mitarbeiter-Matrix"
      focused={focus === 'matrix'}
      onToggleFullscreen={() => toggleFocus('matrix')}
      zoom={zoom.matrix}
      onZoomDelta={(delta) => changeZoom('matrix', delta)}
      actions={<MatrixInfo board={board} />}
    >
      <MatrixBoard
        board={board}
        groupColorById={groupColorById}
        dragging={dragging}
        onDragStart={setDragging}
        onDragEnd={clearDrag}
        requestReason={setPending}
      />
    </Pane>
  );

  const rects = paneRects(split);

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Box ref={workspaceRef} sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Box sx={paneSlotSx(focus, 'belege', rects.belege)}>{belegePane}</Box>
        <Box sx={paneSlotSx(focus, 'ablagen', rects.ablagen)}>{ablagenPane}</Box>
        <Box sx={paneSlotSx(focus, 'matrix', rects.matrix)}>{matrixPane}</Box>
        {focus === null &&
          splitterSegs(split).map((seg) => (
            <SplitterBar
              key={seg.id}
              seg={seg}
              onPointerDown={startSegDrag(seg.id, seg.axis)}
            />
          ))}
        {/* Im Matrix-Vollbild sind die Ablagen versteckt — die Entziehen-Zone
            muss trotzdem erreichbar bleiben (gleicher Dialog, gleiche Gründe). */}
        {focus === 'matrix' && canWithdraw(dragging) && (
          <WithdrawZone
            dragging={dragging}
            onWithdraw={(src) =>
              setPending(buildWithdrawAction(src, (vars) => withdraw.mutate(vars)))
            }
          />
        )}
      </Box>

      <ReasonDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description}
        suggestions={pending?.suggestions}
        onConfirm={(reason) => pending?.run(reason)}
        onClose={() => setPending(null)}
      />

      <ForwardDialog
        open={forwardCard !== null}
        weBelegNo={forwardCard?.weBelegNo ?? ''}
        onConfirm={(recipient) => {
          if (forwardCard) forwardCase(forwardCard.caseId, recipient);
        }}
        onClose={() => setForwardCard(null)}
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

/**
 * Slot-Styles eines Fensters: absolutes Prozent-Rechteck (Normal-Layout),
 * Vollbild (inset 0) oder versteckt — alles an stabilen Baumpositionen.
 */
function paneSlotSx(focus: PaneId | null, id: PaneId, rect: PaneRect): SxProps<Theme> {
  if (focus === null)
    return {
      position: 'absolute',
      top: `${rect.top}%`,
      left: `${rect.left}%`,
      width: `${rect.width}%`,
      height: `${rect.height}%`,
      display: 'flex',
      minWidth: 0,
      minHeight: 0,
    };
  if (focus === id) return { position: 'absolute', inset: 0, display: 'flex', zIndex: 1 };
  return { display: 'none' };
}

interface PaneProps {
  title: string;
  focused: boolean;
  onToggleFullscreen: () => void;
  /** Zoom-Faktor des Fensterinhalts (Lupe ±, 0.6–1.5). */
  zoom: number;
  onZoomDelta: (delta: number) => void;
  /** Zusätzliche Kopfleisten-Aktionen (z. B. der Info-Kreis der Matrix). */
  actions?: ReactNode;
  /** Mittig zentrierte Kopf-Aktion (z. B. der Flip-Knopf des Beleg-Fensters). */
  center?: ReactNode;
  children: ReactNode;
}

/** Fenster-Rahmen: Titelleiste mit Lupe ±, Aktionen + Vollbild-Umschalter; Inhalt füllt den Rest. */
function Pane({
  title,
  focused,
  onToggleFullscreen,
  zoom,
  onZoomDelta,
  actions,
  center,
  children,
}: PaneProps): JSX.Element {
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        borderRadius: 0,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          flexShrink: 0,
        }}
      >
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700 }}>{title}</Typography>
        {center !== undefined && (
          <Box
            sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex' }}
          >
            {center}
          </Box>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            aria-label={`${title}: Ansicht verkleinern`}
            onClick={() => onZoomDelta(-0.1)}
            disabled={zoom <= 0.6}
            sx={{ p: 0.25 }}
          >
            <ZoomOutIcon sx={{ fontSize: 16 }} />
          </IconButton>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', minWidth: 28, textAlign: 'center' }}>
            {Math.round(zoom * 100)} %
          </Typography>
          <IconButton
            size="small"
            aria-label={`${title}: Ansicht vergrößern`}
            onClick={() => onZoomDelta(0.1)}
            disabled={zoom >= 1.5}
            sx={{ p: 0.25 }}
          >
            <ZoomInIcon sx={{ fontSize: 16 }} />
          </IconButton>
          {actions}
          <IconButton
            size="small"
            aria-label={focused ? `${title}: Vollbild verlassen` : `${title}: Vollbild`}
            onClick={onToggleFullscreen}
            sx={{ p: 0.25 }}
          >
            {focused ? (
              <FullscreenExitIcon sx={{ fontSize: 16 }} />
            ) : (
              <FullscreenIcon sx={{ fontSize: 16 }} />
            )}
          </IconButton>
        </Box>
      </Box>
      {/* CSS zoom = ⌘+/⌘− nur für dieses Fenster; reflowt das Layout (kein transform). */}
      <Box sx={{ flex: 1, minHeight: 0, zoom }}>{children}</Box>
    </Paper>
  );
}

interface SplitterBarProps {
  seg: SplitterSeg;
  onPointerDown: (e: ReactPointerEvent) => void;
}

/**
 * Schieberegler auf einer Fenster-Grenze (Pointer-Drag, ohne Zusatz-Dependency).
 * Liegt als 8px-Griff mittig über der Naht; ein Zug über den Anschlag hinaus
 * wechselt die Anordnung (Tooltip nennt die Geste).
 */
function SplitterBar({ seg, onPointerDown }: SplitterBarProps): JSX.Element {
  const horizontal = seg.axis === 'y';
  return (
    <Box
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={seg.label}
      title={seg.hint ?? seg.label}
      onPointerDown={onPointerDown}
      sx={{
        position: 'absolute',
        zIndex: 2,
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(horizontal
          ? {
              top: `calc(${seg.at}% - 4px)`,
              left: `${seg.from}%`,
              width: `${seg.to - seg.from}%`,
              height: 8,
              cursor: 'row-resize',
            }
          : {
              left: `calc(${seg.at}% - 4px)`,
              top: `${seg.from}%`,
              height: `${seg.to - seg.from}%`,
              width: 8,
              cursor: 'col-resize',
            }),
        '&:hover > .balken': { bgcolor: 'primary.main' },
      }}
    >
      <Box
        className="balken"
        sx={{
          bgcolor: 'divider',
          borderRadius: 1,
          width: horizontal ? 36 : 3,
          height: horizontal ? 3 : 36,
        }}
      />
    </Box>
  );
}
