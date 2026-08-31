/**
 * Geteilter Beleg — goldene Kennzeichnung im Cockpit (Konzept
 * beleg-zusammenarbeit §4, 31.08.2026). Ein gemeinsam bearbeiteter Beleg wird in
 * allen drei Karten-Darstellungen (Kanban-Karte, Listen-Zeile, Matrix-Strich)
 * golden eingefasst; Farbe allein ist nie das Signal (E.6): Gold kommt immer mit
 * Gruppen-Icon und Text — `'mit <Name>'` bei genau einem Helfer, sonst `'<n>×'`.
 * Der Tooltip nennt alle Beteiligten mit ihrem Stand; `teil_erledigt` steht grau
 * (Handbuch B3/A7). Dazu das gemeinsame Kontextmenü
 * `'Aus geteiltem Beleg entfernen: <Name>'` je Helfer → §8.4-Pflichtgrund.
 */
import type { JSX } from 'react';
import { alpha } from '@mui/material/styles';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import GroupsIcon from '@mui/icons-material/Groups';
import { ltColors } from '@paket/ui';
import type { BoardParticipant } from '../data/types.js';
import type { PendingAction } from '../features/board/MitarbeiterBoard.js';

/** §8.4-Grund-Vorschläge des Entfernen-Dialogs (Handbuch B3). */
export const GETEILT_ENTFERNEN_VORSCHLAEGE = [
  'Anderweitig gebraucht',
  'Falsch eingeladen',
  'Schichtende',
];

/** Goldene Karten-Einfassung: Rahmen + Left-Border + alpha-Tint. */
export const GETEILT_KARTE_SX = {
  borderColor: ltColors.shared,
  borderLeft: `3px solid ${ltColors.shared}`,
  bgcolor: alpha(ltColors.shared, 0.06),
} as const;

/** `'mit <Name>'` bei genau einem Helfer, sonst `'<n>×'` (Konzept §4). */
export function geteiltMitText(sharedWith: readonly BoardParticipant[]): string {
  const erster = sharedWith[0];
  return sharedWith.length === 1 && erster ? `mit ${erster.displayName}` : `${sharedWith.length}×`;
}

/** Helle Tooltip-Karte (wie die Schnellinfo des Boards), damit Grau lesbar bleibt. */
const TOOLTIP_SLOT_PROPS = {
  tooltip: {
    sx: {
      bgcolor: 'background.paper',
      color: 'text.primary',
      border: '1px solid',
      borderColor: 'divider',
      boxShadow: 3,
    },
  },
} as const;

/** Tooltip-Inhalt: Beteiligte mit Stand — `teil_erledigt` grau (Handbuch B3). */
function BeteiligtenListe({
  sharedWith,
}: {
  sharedWith: readonly BoardParticipant[];
}): JSX.Element {
  return (
    <Stack spacing={0.25}>
      {sharedWith.map((p) => (
        <Typography
          key={p.employeeNo}
          variant="caption"
          sx={{ color: p.status === 'teil_erledigt' ? 'text.disabled' : 'text.primary' }}
        >
          {p.displayName} — {p.status === 'teil_erledigt' ? 'Teil erledigt' : 'hilft'}
        </Typography>
      ))}
    </Stack>
  );
}

export interface GeteiltHinweisProps {
  sharedWith: readonly BoardParticipant[];
  /** Kompaktvariante für den Matrix-Strich: immer `'<n>×'`, kleinere Schrift. */
  dense?: boolean;
}

/** Goldenes Gruppen-Icon + Text, Tooltip mit den Beteiligten. */
export function GeteiltHinweis({
  sharedWith,
  dense = false,
}: GeteiltHinweisProps): JSX.Element | null {
  if (sharedWith.length === 0) return null;
  const label = dense ? `${sharedWith.length}×` : geteiltMitText(sharedWith);
  return (
    <Tooltip
      arrow
      placement="top"
      slotProps={TOOLTIP_SLOT_PROPS}
      title={<BeteiligtenListe sharedWith={sharedWith} />}
    >
      <Stack
        direction="row"
        spacing={0.375}
        alignItems="center"
        sx={{ color: ltColors.shared, minWidth: 0 }}
      >
        <GroupsIcon sx={{ fontSize: dense ? 11 : 14 }} />
        <Typography
          noWrap
          sx={{ fontSize: dense ? '0.6rem' : '0.66rem', fontWeight: 700, color: 'inherit' }}
        >
          {label}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

/** Ankerpunkt des Kontextmenüs (Mausposition bzw. Unterkante des Icon-Buttons). */
export interface GeteiltMenuPosition {
  top: number;
  left: number;
}

export interface GeteiltEntfernenMenuProps {
  /** null = geschlossen. */
  position: GeteiltMenuPosition | null;
  sharedWith: readonly BoardParticipant[];
  onWahl: (helfer: BoardParticipant) => void;
  onClose: () => void;
}

/** Kontextmenü mit einem Eintrag je Helfer (der Inhaber ist nicht entfernbar). */
export function GeteiltEntfernenMenu({
  position,
  sharedWith,
  onWahl,
  onClose,
}: GeteiltEntfernenMenuProps): JSX.Element {
  return (
    <Menu
      open={position !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={position ?? undefined}
      // Karten navigieren bei Klick — das Menü darf den Klick nie durchreichen.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {sharedWith.map((p) => (
        <MenuItem key={p.employeeNo} onClick={() => onWahl(p)}>
          Aus geteiltem Beleg entfernen: {p.displayName}
        </MenuItem>
      ))}
    </Menu>
  );
}

/** §8.4-PendingAction fürs Entfernen eines Helfers — an allen drei Oberflächen gleich. */
export function geteiltEntfernenAction(
  weBelegNo: string,
  // Board-Karte und Beleg-Detail reichen verschiedene Beteiligten-Typen herein;
  // gebraucht wird nur, wen es trifft.
  helfer: Pick<BoardParticipant, 'employeeNo' | 'displayName'>,
  run: (reason: string) => void,
): PendingAction {
  return {
    title: `Aus geteiltem Beleg entfernen: ${helfer.displayName}`,
    description: `${helfer.displayName} sieht ${weBelegNo} danach nicht mehr; bereits geprüfte Positionen bleiben geprüft.`,
    suggestions: GETEILT_ENTFERNEN_VORSCHLAEGE,
    run,
  };
}
