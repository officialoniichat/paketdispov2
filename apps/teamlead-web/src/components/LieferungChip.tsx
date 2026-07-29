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
  const completeness =
    group.expectedSize && group.expectedSize > group.presentSize
      ? ` · ${group.presentSize} von ${group.expectedSize}`
      : '';
  const missing = group.missingCount > 0 ? ` · ${group.missingCount} fehlt` : '';
  const label = `${meta.dot} Lieferung ×${group.presentSize}${completeness}${missing} · ${group.label}`;
  return (
    <Tooltip title={`Zusammengehörige Lieferung ${group.label} — ${meta.text}`}>
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
