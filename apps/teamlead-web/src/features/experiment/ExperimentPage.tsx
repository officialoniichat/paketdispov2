/**
 * Experiment DA.M.B — 3-Fenster-Workspace (Digitale Ablagen · Mitarbeiter-
 * Matrix · Belege) als EIGENER experimenteller Reiter. Die Basis-Tabs bleiben
 * unberührt: die Beleg-Liste wird unverändert eingebettet, Ablagen und Matrix
 * sind Experiment-eigene Ansichten über denselben Daten (useCockpitData).
 *
 * Aufteilung (Default): unten 1/2 Matrix, oben links 1/4 Belege, oben rechts
 * 1/4 Ablagen. Beide Splitter sind ziehbar (persistiert unter
 * `paket.view.experiment`), jedes Fenster hat einen Vollbild-Umschalter.
 * Drag-&-Drop-Gesten aller Fenster münden im hiesigen §8.4-ReasonDialog bzw.
 * ForwardDialog; der Drag-Zustand lebt screen-global (KanbanBoard-Muster).
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
import Typography from '@mui/material/Typography';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import type { SxProps, Theme } from '@mui/material/styles';
import { useCockpitData } from '../../data/store.js';
import type { LaneCard } from '../../data/types.js';
import { buildGroupColorMap } from '../../components/LieferungChip.js';
import { ReasonDialog } from '../../components/ReasonDialog.js';
import { ForwardDialog } from '../../components/ForwardDialog.js';
import {
  EXPERIMENT_BELEGE_VIEW_KEY,
  EXPERIMENT_VIEW_KEY,
  loadViewState,
  saveViewState,
} from '../../lib/viewState.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { BelegListPage } from '../belege/BelegListPage.js';
import { AblagenPane, WithdrawZone, buildWithdrawAction } from './AblagenPane.js';
import { MatrixBoard } from './MatrixBoard.js';
import { canWithdraw, type ExperimentDragPayload } from './experimentDnd.js';

type PaneId = 'belege' | 'ablagen' | 'matrix';

/** Persistierte Splitter-Verhältnisse (Prozent der Workspace-Fläche). */
interface ExperimentSplit {
  /** Höhe der oberen Fensterzeile. */
  topPct: number;
  /** Breite des linken oberen Fensters (Belege). */
  leftPct: number;
}

const DEFAULT_SPLIT: ExperimentSplit = { topPct: 50, leftPct: 50 };

function clampPct(value: number): number {
  return Math.min(80, Math.max(20, value));
}

/** Korrupte/alte localStorage-Blobs defensiv auf gültige Werte zurückführen. */
function sanitizeSplit(raw: Partial<ExperimentSplit> | null | undefined): ExperimentSplit {
  return {
    topPct:
      typeof raw?.topPct === 'number' && Number.isFinite(raw.topPct)
        ? clampPct(raw.topPct)
        : DEFAULT_SPLIT.topPct,
    leftPct:
      typeof raw?.leftPct === 'number' && Number.isFinite(raw.leftPct)
        ? clampPct(raw.leftPct)
        : DEFAULT_SPLIT.leftPct,
  };
}

export function ExperimentPage(): JSX.Element {
  const { board, lanes, forwardCase, withdraw, assignToEmployee, moveCase } = useCockpitData();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dragging, setDragging] = useState<ExperimentDragPayload | null>(null);
  const [forwardCard, setForwardCard] = useState<LaneCard | null>(null);
  const [focus, setFocus] = useState<PaneId | null>(null);
  const [split, setSplit] = useState<ExperimentSplit>(() =>
    sanitizeSplit(loadViewState<Partial<ExperimentSplit>>(EXPERIMENT_VIEW_KEY, DEFAULT_SPLIT)),
  );
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  // Erste fehlgeschlagene DnD-Mutation treibt die Fehler-Snackbar (Board-Muster).
  const failed = [withdraw, assignToEmployee, moveCase].find((m) => m.isError);

  // Lieferungs-Farben screen-weit konsistent über Matrix UND Ablagen (stabile
  // Zuordnung unabhängig davon, in welchem Fenster eine Gruppe zuerst auftaucht).
  const groupColorById = useMemo(
    () =>
      buildGroupColorMap([
        ...board.flatMap((r) =>
          r.cases.map((c) =>
            c.deliveryGroup && c.deliveryGroup.presentSize >= 2 ? c.deliveryGroup.id : null,
          ),
        ),
        ...lanes.flatMap((l) =>
          l.cards.map((c) =>
            c.deliveryGroup && c.deliveryGroup.presentSize >= 2 ? c.deliveryGroup.id : null,
          ),
        ),
      ]),
    [board, lanes],
  );

  const startSplitDrag =
    (kind: 'top' | 'left') =>
    (e: ReactPointerEvent): void => {
      // Nur Primärtaste/-pointer: ein Rechtsklick öffnet das Kontextmenü und
      // verschluckt das pointerup — die Listener blieben sonst hängen.
      if (e.button !== 0 || !e.isPrimary) return;
      e.preventDefault();
      const onMove = (ev: PointerEvent): void => {
        // Rect je Bewegung frisch lesen: bei Scroll/Resize während des Drags
        // wäre ein beim pointerdown eingefrorenes Rect versetzt.
        const rect = workspaceRef.current?.getBoundingClientRect();
        if (rect === undefined) return;
        setSplit((s) =>
          kind === 'top'
            ? { ...s, topPct: clampPct(((ev.clientY - rect.top) / rect.height) * 100) }
            : { ...s, leftPct: clampPct(((ev.clientX - rect.left) / rect.width) * 100) },
        );
      };
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setSplit((s) => {
          saveViewState(EXPERIMENT_VIEW_KEY, s);
          return s;
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

  const toggleFocus = (pane: PaneId): void => setFocus((f) => (f === pane ? null : pane));
  const clearDrag = (): void => setDragging(null);

  const belegePane = (
    <Pane
      title="Beleg-Übersicht"
      focused={focus === 'belege'}
      onToggleFullscreen={() => toggleFocus('belege')}
    >
      <Box sx={{ height: '100%', overflow: 'auto', p: 1 }}>
        {/* Eigener Saved-View-Key: das Experiment darf /belege nicht umkonfigurieren. */}
        <BelegListPage viewStateKey={EXPERIMENT_BELEGE_VIEW_KEY} />
      </Box>
    </Pane>
  );
  const ablagenPane = (
    <Pane
      title="Digitale Ablagen"
      focused={focus === 'ablagen'}
      onToggleFullscreen={() => toggleFocus('ablagen')}
    >
      <AblagenPane
        groupColorById={groupColorById}
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

  return (
    <Stack spacing={1} sx={{ height: 'calc(100vh - 140px)', minHeight: 480 }}>
      <Stack direction="row" alignItems="baseline" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Experiment DA.M.B
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Ziehen zwischen den Fenstern: Ablage ⇄ Ablage · Ablage → Mitarbeiter (zuweisen) · Beleg →
          anderer Mitarbeiter (verschieben) · Beleg → Ablagen (entziehen)
        </Typography>
      </Stack>

      <Box
        ref={workspaceRef}
        sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}
      >
        {/* Vollbild ist REINES CSS (absolut/none) an stabilen Baumpositionen —
            ein Remount würde Seitenzahl, Filter-Entwürfe und Scroll-Positionen
            der eingebetteten Fenster verwerfen. */}
        <Box
          sx={
            focus === 'matrix'
              ? { display: 'none' }
              : { height: `${split.topPct}%`, minHeight: 120, display: 'flex', minWidth: 0 }
          }
        >
          <Box
            sx={paneSlotSx(focus, 'belege', {
              width: `${split.leftPct}%`,
              minWidth: 180,
              minHeight: 0,
              display: 'flex',
            })}
          >
            {belegePane}
          </Box>
          {focus === null && (
            <Splitter orientation="vertical" onPointerDown={startSplitDrag('left')} />
          )}
          <Box
            sx={paneSlotSx(focus, 'ablagen', {
              flex: 1,
              minWidth: 180,
              minHeight: 0,
              display: 'flex',
            })}
          >
            {ablagenPane}
          </Box>
        </Box>
        {focus === null && (
          <Splitter orientation="horizontal" onPointerDown={startSplitDrag('top')} />
        )}
        <Box sx={paneSlotSx(focus, 'matrix', { flex: 1, minHeight: 120, display: 'flex' })}>
          {matrixPane}
        </Box>
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

/** Slot-Styles eines Fensters: Normal-Layout, Vollbild (absolut im Workspace) oder versteckt. */
function paneSlotSx(
  focus: PaneId | null,
  id: PaneId,
  base: SxProps<Theme>,
): SxProps<Theme> {
  if (focus === null) return base;
  if (focus === id) return { position: 'absolute', inset: 0, display: 'flex', zIndex: 1 };
  return { display: 'none' };
}

interface PaneProps {
  title: string;
  focused: boolean;
  onToggleFullscreen: () => void;
  children: ReactNode;
}

/** Fenster-Rahmen: Titelleiste mit Vollbild-Umschalter, Inhalt füllt den Rest. */
function Pane({ title, focused, onToggleFullscreen, children }: PaneProps): JSX.Element {
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
      }}
    >
      <Box
        sx={{
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
        <IconButton
          size="small"
          aria-label={focused ? `${title}: Vollbild verlassen` : `${title}: Vollbild`}
          onClick={onToggleFullscreen}
          sx={{ ml: 'auto', p: 0.25 }}
        >
          {focused ? (
            <FullscreenExitIcon sx={{ fontSize: 16 }} />
          ) : (
            <FullscreenIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
    </Paper>
  );
}

interface SplitterProps {
  orientation: 'vertical' | 'horizontal';
  onPointerDown: (e: ReactPointerEvent) => void;
}

/** Schieberegler zwischen zwei Fenstern (Pointer-Drag, ohne Zusatz-Dependency). */
function Splitter({ orientation, onPointerDown }: SplitterProps): JSX.Element {
  const vertical = orientation === 'vertical';
  return (
    <Box
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={vertical ? 'Fensterbreite anpassen' : 'Fensterhöhe anpassen'}
      onPointerDown={onPointerDown}
      sx={{
        flexShrink: 0,
        width: vertical ? 8 : 'auto',
        height: vertical ? 'auto' : 8,
        cursor: vertical ? 'col-resize' : 'row-resize',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        '&:hover > .balken': { bgcolor: 'primary.main' },
      }}
    >
      <Box
        className="balken"
        sx={{
          bgcolor: 'divider',
          borderRadius: 1,
          width: vertical ? 3 : 36,
          height: vertical ? 36 : 3,
        }}
      />
    </Box>
  );
}
