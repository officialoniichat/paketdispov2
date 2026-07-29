/**
 * Experiment DA.M.B — Mitarbeiter-Matrix (unteres Fenster).
 *
 * Eine Zeile je Mitarbeiter (Name links, sticky), rechts daneben ein Rechteck
 * je Engine-Pack (horizontal scrollbar). Die Belege eines Packs sind dünne
 * Striche: blau = in Arbeit (immer oben), rot = Problem, grün + durchgestrichen
 * = fertig; geplante Belege tragen die Lieferungs-Gruppenfarbe. Drops auf eine
 * Zeile lösen die EXISTIERENDEN auditierten Mutationen aus (Ablage → Zeile =
 * zuweisen, Zeile → Zeile = verschieben) — immer über den §8.4-ReasonDialog
 * des Parents, nie direkt.
 */
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { alpha } from '@mui/material/styles';
import { useCockpitData } from '../../data/store.js';
import type { BoardCase, BoardRow } from '../../data/types.js';
import type { PendingAction } from '../board/MitarbeiterBoard.js';
import { DragDots } from '../board/KanbanBoard.js';
import { tierLabel } from '../../components/TierChip.js';
import {
  lieferungHinweis,
  lieferungSatz,
  splitLieferungWarnung,
} from '../../components/LieferungChip.js';
import {
  matrixDropAction,
  type ExperimentDragPayload,
} from './experimentDnd.js';
import { STRIP_LEGEND, derivePacks, stripStyle } from './matrixPacks.js';

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
      {board.map((row) => (
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
  const { assignToEmployee, moveCase } = useCockpitData();
  const [over, setOver] = useState(false);
  const action = dragging === null ? null : matrixDropAction(dragging, row.employeeId);
  const packs = derivePacks(row.cases, row.packs);

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
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          width: 150,
          flexShrink: 0,
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
          px: 0.75,
          py: 0.25,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, lineHeight: 1.2 }} noWrap>
          {row.displayName}
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }} noWrap>
          {tierLabel(row.skillTier)} · {row.plannedTeile} Teile · {Math.round(row.utilisationPct)} %
        </Typography>
        {row.paused && (
          <Typography sx={{ fontSize: '0.6rem', color: 'warning.main', fontWeight: 700 }}>
            Pausiert
          </Typography>
        )}
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
          {pack.cases.map((c) => (
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
 * sie sichtbar); Klick öffnet die Belegdetails; bei Gruppen-Belegen nennt eine
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
  const statusTitle = style ? `${c.weBelegNo} — ${style.statusLabel}` : c.weBelegNo;
  return (
    <Box
      title={group ? `${statusTitle} · ${lieferungHinweis(group)}` : statusTitle}
      onClick={() => navigate(`/belege/${c.caseId}`)}
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
            draggable
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', c.weBelegNo);
              if (typeof e.dataTransfer.setDragImage === 'function') {
                e.dataTransfer.setDragImage(e.currentTarget, 12, 10);
              }
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
            Ablagen/rote Zone: entziehen · Klick auf einen Strich: Belegdetails · Fenster-Grenzen
            ziehen — über den Anschlag hinaus wechselt die Anordnung.
          </Typography>
        </Stack>
      </Popover>
    </>
  );
}
