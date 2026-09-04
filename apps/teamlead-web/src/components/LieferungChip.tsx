import { Box, Chip, Tooltip } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import type { DeliveryGroupRef } from '../data/types';

/**
 * Per-Beleg „Lieferung"-Badge (Teamlead-Anforderung Punkt 1). One reusable visual so the
 * Board, Pool/Eingang and Belegdetail all show the same colour-by-confidence chip plus
 * the „X von N · 1 fehlt" completeness. Standalone Belege render nothing.
 */
const CONFIDENCE_META: Record<
  DeliveryGroupRef['confidence'],
  { color: 'success' | 'info' | 'warning' | 'default'; dot: string; text: string }
> = {
  confirmed: { color: 'success', dot: '🟢', text: 'bestätigt (Quelle „X von N")' },
  likely: { color: 'info', dot: '🟡', text: 'wahrscheinlich (gleiche Lieferschein-Nr)' },
  suspected: { color: 'warning', dot: '🟠', text: 'vermutet (fortlaufende Belegnummern)' },
  locked: { color: 'default', dot: '🔒', text: 'vom Teamlead bestätigt' },
};

/**
 * Frage 8: dezente Kennfarben für Gruppen-Punkt/Kante. Je Lieferung EIN konsistenter
 * Ton innerhalb der aktuellen Fläche (Reihenfolge des ersten Auftretens), damit
 * zusammengehörige Belege auf einen Blick erkennbar sind. Bewusst getrennt von den
 * Vertrauensstufen-Farben des Chips (grün/gelb/orange/Schloss).
 */
export const GROUP_IDENTITY_COLORS = [
  '#7e57c2', // deepPurple 400
  '#26a69a', // teal 400
  '#ef6c00', // orange 800
  '#5c6bc0', // indigo 400
  '#8d6e63', // brown 400
  '#d81b60', // pink 600
  '#558b2f', // lightGreen 800
  '#0288d1', // lightBlue 700
];

/** Gruppen-Id → Kennfarbe in Reihenfolge des ersten Auftretens (Palette zyklisch). */
export function buildGroupColorMap(
  groupIds: Iterable<string | null | undefined>,
): Map<string, string> {
  const colors = new Map<string, string>();
  for (const id of groupIds) {
    if (!id || colors.has(id)) continue;
    colors.set(id, GROUP_IDENTITY_COLORS[colors.size % GROUP_IDENTITY_COLORS.length]!);
  }
  return colors;
}

/**
 * Der Zugehörigkeits-Satz eines Gruppen-Belegs — exakt der Chip-Wortlaut, damit
 * Board, Beleg-Liste und die Matrix-Striche (DA.M.B) identisch sprechen.
 */
export function lieferungSatz(group: DeliveryGroupRef): string {
  const meta = CONFIDENCE_META[group.confidence];
  const completeness =
    group.expectedSize && group.expectedSize > group.presentSize
      ? ` · ${group.presentSize} von ${group.expectedSize}`
      : '';
  const missing = group.missingCount > 0 ? ` · ${group.missingCount} fehlt` : '';
  return `${meta.dot} Lieferung ×${group.presentSize}${completeness}${missing} · ${group.label}`;
}

/** Tooltip-Satz zur Vertrauensstufe — Wortlaut des LieferungChip-Tooltips. */
export function lieferungHinweis(group: DeliveryGroupRef): string {
  return `Zusammengehörige Lieferung ${group.label} — ${CONFIDENCE_META[group.confidence].text}`;
}

/**
 * Warn-Satz des Mitarbeiterboards für auf mehrere Mitarbeiter verteilte
 * Lieferungen; `null` wenn nichts verteilt ist. Single Source für Board + Matrix.
 */
export function splitLieferungWarnung(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? '1 zusammengehörige Lieferung ist auf mehrere Mitarbeiter verteilt — bitte zusammen einem Mitarbeiter zuweisen.'
    : `${count} zusammengehörige Lieferungen sind auf mehrere Mitarbeiter verteilt — bitte jeweils einem Mitarbeiter zuweisen.`;
}

interface LieferungChipProps {
  group: DeliveryGroupRef | null | undefined;
  size?: 'small' | 'medium';
  /**
   * Frage 8: dezenter, je Gruppe konsistenter Farbton (Punkt vor dem Text), damit in
   * der Tabelle sichtbar ist, WELCHE Zeilen zusammengehören. Die Chip-Farbe selbst
   * bleibt die Vertrauensstufe (grün/gelb/orange/Schloss) — der Punkt ist ein
   * zusätzlicher Kanal, kein Ersatz.
   */
  identityColor?: string;
}

export function LieferungChip({ group, size = 'small', identityColor }: LieferungChipProps) {
  if (!group || group.presentSize < 2) return null;
  const meta = CONFIDENCE_META[group.confidence];
  const label = lieferungSatz(group);
  return (
    <Tooltip title={lieferungHinweis(group)}>
      <Chip
        size={size}
        color={meta.color}
        variant="outlined"
        label={
          identityColor ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                component="span"
                aria-hidden
                sx={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  bgcolor: identityColor,
                  flexShrink: 0,
                }}
              />
              {label}
            </Box>
          ) : (
            label
          )
        }
        icon={group.locked ? <LockIcon fontSize="inherit" /> : undefined}
      />
    </Tooltip>
  );
}
