/**
 * Experiment DA.M.B — Mitarbeiter-Matrix (unteres Fenster).
 *
 * Eine Zeile je Mitarbeiter: Name sticky links (farbiger Schicht-Streifen =
 * Pausen-Schieber, der beim Ziehen als Farbband über die Zelle wächst; „!"-
 * Zeileninfo oben rechts), daneben ein Rechteck je Engine-Pack (horizontal
 * scrollbar), INNEN aufgeteilt wie die Board-Karte: Laufend (n) / Geplant (n)
 * / Fertig (n). Die Belege sind dünne Striche: blau = in Arbeit, rot =
 * Problem, grün + durchgestrichen = fertig; geplante tragen die
 * Lieferungs-Gruppenfarbe. Hover auf einen Strich öffnet die Schnellinfo des
 * Mitarbeiterboards. Drops auf eine Zeile lösen die EXISTIERENDEN auditierten
 * Mutationen aus (Ablage → Zeile = zuweisen, Zeile → Zeile = verschieben) —
 * immer über den §8.4-ReasonDialog des Parents, nie direkt.
 */
import { useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { alpha } from '@mui/material/styles';
import { assignmentStatusLabels } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import type { BoardCase, BoardRow } from '../../data/types.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { CaseQuickInfoTooltip, DragDots } from '../board/KanbanBoard.js';
import { isManualOnlyTier, tierLabel } from '../../components/TierChip.js';
import { formatMinutes } from '../../lib/format.js';
import {
  ABSENCE_LABEL,
  shiftKindColor,
  shiftKindLabel,
  shiftKindOfStart,
} from '../../lib/schichtFarben.js';
import { lieferungSatz, splitLieferungWarnung } from '../../components/LieferungChip.js';
import {
  matrixDropAction,
  type ExperimentDragPayload,
} from './experimentDnd.js';
import {
  FERTIG_STATUSES,
  LAUFEND_STATUSES,
  STRIP_LEGEND,
  derivePacks,
  packSections,
  stripStyle,
} from './matrixPacks.js';

/** Breite der sticky Namenszelle — zugleich Zielstrecke des Pausen-Streifens. */
const NAME_COL = 150;

export interface MatrixBoardProps {
  board: BoardRow[];
  /** Lieferungs-Gruppenfarben, screen-weit konsistent (Matrix + Ablagen). */
  groupColorById: Map<string, string>;
  dragging: ExperimentDragPayload | null;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
  requestReason: (action: PendingAction) => void;
}

export function MatrixBoard({
  board,
  groupColorById,
  dragging,
  onDragStart,
  onDragEnd,
  requestReason,
}: MatrixBoardProps): JSX.Element {
  return (
    <Box sx={{ height: '100%', overflow: 'auto', bgcolor: 'background.default' }}>
      {/* Abwesende (Krank/Urlaub) ganz nach unten — sonst stabile Reihenfolge. */}
      {[...board]
        .sort((a, b) => Number(a.absence != null) - Number(b.absence != null))
        .map((row) => (
        <MatrixRow
          key={row.employeeId}
          row={row}
          groupColorById={groupColorById}
          dragging={dragging}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          requestReason={requestReason}
        />
      ))}
      {board.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Keine Mitarbeiter für heute eingeplant.
        </Typography>
      )}
    </Box>
  );
}

interface MatrixRowProps {
  row: BoardRow;
  groupColorById: Map<string, string>;
  dragging: ExperimentDragPayload | null;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
  requestReason: (action: PendingAction) => void;
}

function MatrixRow({
  row,
  groupColorById,
  dragging,
  onDragStart,
  onDragEnd,
  requestReason,
}: MatrixRowProps): JSX.Element {
  const { assignToEmployee, moveCase, pauseResume } = useCockpitData();
  const [over, setOver] = useState(false);
  // Krank/Urlaub (Schichtplan-Kalender): Zeile wird nur noch angezeigt (ganz
  // unten, durchgestrichen) — Drops sind gesperrt, Abwesende bekommen nichts.
  const absent = row.absence ?? null;
  const action =
    absent !== null || dragging === null ? null : matrixDropAction(dragging, row.employeeId);
  const packs = derivePacks(row.cases, row.packs);
  // Pausen-Toggle per Wisch: Linksklick auf den Namen, von links nach rechts ziehen.
  const swipe = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  const fireSwipePause = (): void => {
    const bundleId = row.bundleId;
    if (bundleId === undefined) return;
    requestReason({
      title: `${row.displayName}: ${row.paused ? 'Pause beenden' : 'Pause/Abwesenheit'}`,
      description: row.paused ? 'Bearbeitung fortsetzen.' : 'Pausiert die Bearbeitung.',
      suggestions: ['Pause', 'Krank', 'Andere Aufgabe', 'Zurück aus Pause'],
      run: (reason) => pauseResume.mutate({ bundleId, reason, paused: row.paused }),
    });
  };

  const handleDrop = (): void => {
    setOver(false);
    if (dragging === null || action === null) return;
    const src = dragging;
    if (action.kind === 'assign') {
      requestReason({
        title: `${src.weBelegNo} an ${row.displayName} zuweisen`,
        description:
          'Der Beleg wird dem Tages-Bündel des Mitarbeiters zugeteilt (bei Bedarf wird ein Bündel angelegt).',
        suggestions: ['Kapazität frei', 'Bereich passt', 'Eilig für Verladung'],
        run: (reason) =>
          assignToEmployee.mutate({ employeeNo: row.employeeId, caseId: src.caseId, reason }),
      });
    } else if (src.source === 'matrix') {
      requestReason({
        title: `${src.weBelegNo} zu ${row.displayName} verschieben`,
        description: `Der Beleg wird aus dem Bündel von ${src.employeeName} entfernt und ${row.displayName} zugeteilt.`,
        suggestions: ['Auslastung ausgleichen', 'Bereich passt besser', 'Auf Wunsch des Mitarbeiters'],
        run: (reason) =>
          moveCase.mutate({
            bundleId: src.bundleId,
            caseId: src.caseId,
            targetEmployeeNo: row.employeeId,
            reason,
          }),
      });
    }
  };

  /** Strich inkl. Lieferungs-Gruppenfarbe — in allen Pack-Abschnitten identisch. */
  const stripFor = (c: BoardCase): JSX.Element => (
    <CaseStrip
      key={c.caseId}
      c={c}
      row={row}
      groupColor={
        c.deliveryGroup && c.deliveryGroup.presentSize >= 2
          ? groupColorById.get(c.deliveryGroup.id)
          : undefined
      }
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );

  return (
    <Box
      data-testid={`matrix-row-${row.employeeId}`}
      onDragOver={(e) => {
        if (action === null) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={(e) => {
        // Kind-Elemente lösen ebenfalls dragleave aus — nur echtes Verlassen zählt.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (action === null) return;
        e.preventDefault();
        handleDrop();
      }}
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 0.75,
        px: 0.5,
        py: 0.5,
        minWidth: 'max-content',
        borderBottom: '1px solid',
        borderColor: 'divider',
        outline: action !== null ? '1px dashed' : 'none',
        outlineColor: 'primary.light',
        outlineOffset: -2,
        bgcolor: over && action !== null ? (t) => alpha(t.palette.primary.main, 0.08) : undefined,
      }}
    >
      <Box
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          swipe.current = { x: e.clientX, y: e.clientY, fired: false };
        }}
        onPointerMove={(e) => {
          const s = swipe.current;
          if (s === null || s.fired) return;
          if (Math.abs(e.clientY - s.y) > 24) {
            swipe.current = null;
            return;
          }
          if (e.clientX - s.x > 60) {
            s.fired = true;
            fireSwipePause();
          }
        }}
        onPointerUp={() => {
          swipe.current = null;
        }}
        onPointerLeave={() => {
          swipe.current = null;
        }}
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          width: NAME_COL,
          flexShrink: 0,
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          pl: '14px',
          pr: 0.75,
          py: 0.25,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          opacity: absent !== null ? 0.6 : 1,
          touchAction: 'none',
        }}
      >
        {absent === null && (
          // Der farbige Schicht-Streifen bleibt links stehen; beim Ziehen wächst
          // er als Farbband über die Zelle — bedeckt er sie, kommt Pause/Weiter.
          <PauseHandle
            color={
              row.shiftStart != null
                ? shiftKindColor(shiftKindOfStart(row.shiftStart))
                : '#b0bec5'
            }
            label={`${row.displayName}: Streifen über die Zelle ziehen für ${row.paused ? 'Weiter' : 'Pause'}`}
            onFire={fireSwipePause}
          />
        )}
        <Typography
          sx={{
            fontSize: '0.74rem',
            fontWeight: 700,
            lineHeight: 1.2,
            pr: 1.5,
            textDecoration: absent !== null ? 'line-through' : 'none',
          }}
          noWrap
        >
          {row.displayName}
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }} noWrap>
          {tierLabel(row.skillTier)} · {row.plannedTeile} Teile · {Math.round(row.utilisationPct)} %
        </Typography>
        {absent !== null ? (
          <Typography
            sx={{
              fontSize: '0.6rem',
              fontWeight: 700,
              textDecoration: 'line-through',
              color: absent === 'krank' ? 'error.main' : 'warning.main',
            }}
          >
            {ABSENCE_LABEL[absent]}
          </Typography>
        ) : (
          row.shiftStart != null && (
            <ShiftPill startIso={row.shiftStart} endIso={row.shiftEnd ?? null} />
          )
        )}
        {row.paused && (
          <Typography sx={{ fontSize: '0.6rem', color: 'warning.main', fontWeight: 700 }}>
            Pausiert
          </Typography>
        )}
        <RowInfoButton row={row} />
      </Box>

      {packs.map((pack) => (
        <Box
          key={pack.key}
          sx={{
            width: 200,
            flexShrink: 0,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
            p: 0.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.375,
          }}
        >
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary' }}>
            {pack.label} · {pack.cases.length} {pack.cases.length === 1 ? 'Beleg' : 'Belege'} ·{' '}
            {pack.teile} Teile
          </Typography>
          {/* EIN Pack, innen aufgeteilt wie die Board-Karte (Nutzer-Vorgabe):
              Laufend (n) / Geplant (n) / Fertig (n). */}
          {packSections(pack.cases).map((sec, index) => (
            <Box
              key={sec.key}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.375,
                borderTop: index > 0 ? '1px solid' : 'none',
                borderColor: 'divider',
                pt: index > 0 ? 0.375 : 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.56rem',
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                }}
              >
                {sec.title}
              </Typography>
              {sec.cases.map(stripFor)}
              {sec.cases.length === 0 && sec.empty !== null && (
                <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>
                  {sec.empty}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      ))}
      {packs.length === 0 && (
        <Box
          sx={{
            flexShrink: 0,
            width: 200,
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 36,
          }}
        >
          <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>
            Keine Belege — zum Zuweisen hierher ziehen
          </Typography>
        </Box>
      )}
    </Box>
  );
}

interface CaseStripProps {
  c: BoardCase;
  row: BoardRow;
  groupColor: string | undefined;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
}

/**
 * Dünner Beleg-Strich: Statusfarbe überschreibt die Gruppenfarbe (Punkt hält
 * sie sichtbar); Hover öffnet die Schnellinfo des Mitarbeiterboards („!" oben
 * rechts im Strich), Klick die Belegdetails; bei Gruppen-Belegen nennt eine
 * Extra-Zeile die Zugehörigkeit im Wortlaut des Mitarbeiterboards.
 */
function CaseStrip({ c, row, groupColor, onDragStart, onDragEnd }: CaseStripProps): JSX.Element {
  const navigate = useNavigate();
  const style = stripStyle(c.status);
  const color = style?.color ?? groupColor;
  // Das Bündel des ITEMS, nicht der Zeile — bei Multi-Bündel-Zeilen verschieden.
  const itemBundleId = c.bundleId ?? row.bundleId;
  const draggable = c.status === 'assigned' && itemBundleId != null;
  const group = c.deliveryGroup && c.deliveryGroup.presentSize >= 2 ? c.deliveryGroup : null;
  return (
    // Hover irgendwo auf dem Strich → dieselbe Schnellinfo wie das „!" im Board.
    <CaseQuickInfoTooltip c={c}>
      <Box
        onClick={() => navigate(`/belege/${c.caseId}`)}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', c.weBelegNo);
          // Kein setDragImage: der ganze Strich wird als Geisterbild mitgezogen
          // (Nutzer-Vorgabe — nicht nur die vier Griff-Punkte).
          onDragStart({
            source: 'matrix',
            caseId: c.caseId,
            weBelegNo: c.weBelegNo,
            status: c.status,
            bundleId: itemBundleId ?? '',
            employeeId: row.employeeId,
            employeeName: row.displayName,
          });
        }}
        onDragEnd={onDragEnd}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          borderLeft: '3px solid',
          borderLeftColor: color ?? 'divider',
          bgcolor: color ? alpha(color, 0.1) : 'action.hover',
          cursor: 'pointer',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 18 }}>
          {draggable && (
            <Box
              role="button"
              aria-label={`${c.weBelegNo} aus Bündel ziehen`}
              onClick={(e) => e.stopPropagation()}
              sx={{ cursor: 'grab', display: 'flex', alignItems: 'center', '&:active': { cursor: 'grabbing' } }}
            >
              <DragDots />
            </Box>
          )}
          <Typography
            sx={{
              fontSize: '0.66rem',
              fontWeight: 600,
              color: style?.color,
              textDecoration: style?.strike ? 'line-through' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {c.weBelegNo}
          </Typography>
          {style && groupColor && (
            // Statusfarbe überschreibt die Lieferungs-Farbe — der Punkt erhält die
            // Gruppen-Identität trotzdem sichtbar (Nutzer-Vorgabe).
            <Box
              aria-hidden
              sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: groupColor, flexShrink: 0 }}
            />
          )}
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', ml: 'auto', flexShrink: 0 }}>
            {c.totalQuantity} Teile
          </Typography>
          <ErrorOutlineIcon aria-hidden sx={{ fontSize: 11, color: 'text.secondary', flexShrink: 0 }} />
        </Box>
        {group && (
          <Typography
            sx={{
              fontSize: '0.56rem',
              color: 'text.secondary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {lieferungSatz(group)}
          </Typography>
        )}
      </Box>
    </CaseQuickInfoTooltip>
  );
}

/**
 * Info-Kreis der Matrix (Fenster-Kopfleiste oben rechts): Farb-Legende, Gesten
 * und — wie im Mitarbeiterboard, gleicher Wortlaut — die Warnung, wenn eine
 * zusammengehörige Lieferung auf mehrere Mitarbeiter verteilt ist.
 */
export function MatrixInfo({ board }: { board: BoardRow[] }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const employeesByGroup = new Map<string, Set<string>>();
  for (const row of board) {
    for (const c of row.cases) {
      const id = c.deliveryGroup?.id;
      if (!id) continue;
      const set = employeesByGroup.get(id) ?? new Set<string>();
      set.add(row.employeeId);
      employeesByGroup.set(id, set);
    }
  }
  const splitCount = [...employeesByGroup.values()].filter((s) => s.size > 1).length;
  const warnung = splitLieferungWarnung(splitCount);
  return (
    <>
      <Tooltip title="Legende & Gesten">
        <IconButton
          size="small"
          aria-label="Matrix-Infos anzeigen"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{ p: 0.25 }}
        >
          <Badge color="warning" variant="dot" invisible={warnung === null}>
            <InfoOutlinedIcon sx={{ fontSize: 16 }} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack spacing={0.75} sx={{ p: 1.5, maxWidth: 360 }}>
          {warnung !== null && (
            <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>
              {warnung}
            </Typography>
          )}
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            Farben der Beleg-Striche
          </Typography>
          {STRIP_LEGEND.map((l) => (
            <Stack key={l.text} direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: l.color, flexShrink: 0 }} />
              <Typography
                variant="caption"
                sx={{ textDecoration: l.strike ? 'line-through' : 'none' }}
              >
                {l.text}
              </Typography>
            </Stack>
          ))}
          <Typography variant="caption">
            Geplante Belege tragen die Kennfarbe ihrer Lieferung; überdeckt eine Statusfarbe sie,
            bleibt die Lieferung als kleiner Farbpunkt sichtbar — die Zeile unter dem Strich nennt
            die Zugehörigkeit im Wortlaut des Mitarbeiterboards.
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            Gesten
          </Typography>
          <Typography variant="caption">
            Ablage → Zeile: zuweisen · Beleg-Strich → andere Zeile: verschieben · Beleg-Strich →
            Ablagen/rote Zone: entziehen · Hover auf einen Strich: Schnellinfo, Klick:
            Belegdetails · Farbigen Schicht-Streifen links über die Namenszelle aufziehen, bis er
            sie bedeckt (oder Wisch über den Namen): Pause/Weiter · Fenster-Grenzen ziehen — über
            den Anschlag hinaus wechselt die Anordnung.
          </Typography>
        </Stack>
      </Popover>
    </>
  );
}

/** Schicht-Pill: Früh hellblau / Spät helllila; vor Schichtbeginn „ab HH:MM", fett ab 1 h vorher. */
function ShiftPill({ startIso, endIso }: { startIso: string; endIso: string | null }): JSX.Element {
  const kind = shiftKindOfStart(startIso);
  const start = new Date(startIso);
  const hhmm = (d: Date): string =>
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const now = Date.now();
  const beforeStart = now < start.getTime();
  const soon = beforeStart && start.getTime() - now <= 60 * 60 * 1000;
  const window = `${hhmm(start)}${endIso ? `–${hhmm(new Date(endIso))}` : ''}`;
  return (
    <Box
      sx={{
        alignSelf: 'flex-start',
        px: 0.5,
        borderRadius: 0.5,
        bgcolor: shiftKindColor(kind),
        color: 'rgba(0,0,0,0.78)',
        fontSize: '0.56rem',
        fontWeight: soon ? 800 : 600,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
      }}
    >
      {shiftKindLabel(kind)} {beforeStart ? `ab ${window}` : window}
      {soon ? ' · gleich' : ''}
    </Box>
  );
}

/**
 * Zeilen-Info („!" im Kreis, oben rechts in der Namenszelle — wie am Beleg-
 * Container des Boards): dieselben Infos wie die Karte der Board-Ansicht —
 * Kopfzeile (Stufe · Status · Teile · % verplant · nur manuell) und
 * Laufend/Geplant/Fertig mit Status, Teilen, Minuten und dem
 * Zugehörigkeits-Satz der Lieferung.
 */
function RowInfoButton({ row }: { row: BoardRow }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const laufend = row.cases.filter((c) => LAUFEND_STATUSES.includes(c.status));
  const geplant = row.cases.filter((c) => c.status === 'assigned');
  const fertig = row.cases.filter((c) => FERTIG_STATUSES.includes(c.status));
  return (
    <>
      <IconButton
        size="small"
        aria-label={`Details zu ${row.displayName} anzeigen`}
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        sx={{ p: 0, position: 'absolute', top: 2, right: 2 }}
      >
        <ErrorOutlineIcon sx={{ fontSize: 13 }} />
      </IconButton>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack spacing={0.75} sx={{ p: 1.5, minWidth: 260, maxWidth: 340 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {row.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tierLabel(row.skillTier)}
            {row.bundleStatus ? ` · ${assignmentStatusLabels[row.bundleStatus]}` : ''} ·{' '}
            {row.plannedTeile} Teile · {Math.round(row.utilisationPct)} % verplant
            {isManualOnlyTier(row.skillTier) ? ' · nur manuell' : ''}
          </Typography>
          <RowInfoSection title={`Laufend (${laufend.length})`} cases={laufend} empty="Nichts in Arbeit." />
          <RowInfoSection title={`Geplant (${geplant.length})`} cases={geplant} empty="Nichts geplant." />
          {fertig.length > 0 && (
            <RowInfoSection title={`Fertig (${fertig.length})`} cases={fertig} empty="" />
          )}
        </Stack>
      </Popover>
    </>
  );
}

function RowInfoSection({
  title,
  cases,
  empty,
}: {
  title: string;
  cases: BoardCase[];
  empty: string;
}): JSX.Element {
  return (
    <Stack spacing={0.25}>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      {cases.length === 0 && empty !== '' && (
        <Typography variant="caption" color="text.secondary">
          {empty}
        </Typography>
      )}
      {cases.map((c, i) => {
        const style = stripStyle(c.status);
        const group = c.deliveryGroup && c.deliveryGroup.presentSize >= 2 ? c.deliveryGroup : null;
        return (
          <Stack key={c.caseId} spacing={0}>
            <Typography variant="caption">
              {i + 1}. <b>{c.weBelegNo}</b> · {style?.statusLabel ?? 'Zugewiesen'} ·{' '}
              {c.totalQuantity} Teile · {formatMinutes(c.estimatedMinutes)}
            </Typography>
            {group && (
              <Typography variant="caption" color="text.secondary" sx={{ pl: 1.5 }}>
                {lieferungSatz(group)}
              </Typography>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

/**
 * Pausen-Streifen: der farbige Schicht-Streifen bleibt links in der Namenszelle
 * verankert; mit gedrückter Maustaste zieht man ihn zum anderen Ende auf — er
 * wächst als Farbband ("verschmiert"), bis er die Zelle als Rechteck bedeckt,
 * dann öffnet sich der Pause/Weiter-Dialog (dieselbe auditierte
 * pauseResume-Mutation wie überall, via ReasonDialog des Parents).
 */
function PauseHandle({
  color,
  label,
  onFire,
}: {
  color: string;
  label: string;
  onFire: () => void;
}): JSX.Element {
  // Zusatzbreite über die 8-px-Ruhelage hinaus (0 = Streifen liegt links an).
  const [w, setW] = useState(0);
  const drag = useRef<{ x: number; max: number; fired: boolean } | null>(null);
  const reset = (): void => {
    drag.current = null;
    setW(0);
  };
  return (
    <Tooltip title={label}>
      <Box
        role="button"
        aria-label={label}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.isPrimary) return;
          // Nicht zusätzlich den Namens-Wisch starten — sonst feuert es doppelt.
          e.stopPropagation();
          drag.current = {
            x: e.clientX,
            // Zellbreite = Zielstrecke; jsdom liefert 0 → Spaltenbreite als Ersatz.
            max: e.currentTarget.parentElement?.clientWidth || NAME_COL,
            fired: false,
          };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Kein aktiver Pointer (jsdom/synthetische Events) — Drag geht auch ohne Capture.
          }
        }}
        onPointerMove={(e) => {
          const s = drag.current;
          if (s === null || s.fired) return;
          const next = Math.max(0, Math.min(s.max - 8, e.clientX - s.x));
          setW(next);
          if (8 + next >= s.max - 8) {
            s.fired = true;
            setW(0);
            onFire();
          }
        }}
        onPointerUp={reset}
        onPointerCancel={reset}
        onPointerLeave={reset}
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 2,
          width: 8 + w,
          bgcolor: color,
          cursor: 'grab',
          touchAction: 'none',
          borderTopRightRadius: 4,
          borderBottomRightRadius: 4,
          opacity: w > 0 ? 0.92 : 1,
          transition: w === 0 ? 'width 140ms ease-out' : 'none',
          '&:hover': { filter: 'brightness(0.9)' },
          '&:active': { cursor: 'grabbing' },
        }}
      />
    </Tooltip>
  );
}
