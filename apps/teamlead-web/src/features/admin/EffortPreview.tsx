/**
 * Live-Vorschau für den Admin "Aufwand"-Tab (§11). Zeigt für einen Beispiel-Beleg,
 * wie die im Cockpit eingestellten ECHTEN Aufwandsparameter (Minuten je Tätigkeit)
 * die Bearbeitungszeit und Aufwandspunkte ergeben — live über die echte Engine-Funktion
 * {@link previewEffort} (single source of truth, keine Nachimplementierung, keine
 * versteckten Defaults: jede Zeile ist ein eingestellter Parameter).
 */
import type { JSX } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { EffortRuleConfig } from '@paket/domain-types';
import { previewEffort, EXAMPLE_EFFORT_VECTOR } from '@paket/assignment-engine';
import { EFFORT_COMPONENT_LABEL } from '../../lib/effort.js';

/** "44.75" → "44,75 min" — German decimal comma for minutes. */
function min(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} min`;
}

/** Plain-language description of the engine's EXAMPLE_EFFORT_VECTOR. */
function exampleSummary(): string {
  const v = EXAMPLE_EFFORT_VECTOR;
  return [
    `${v.totalQuantity} Teile`,
    v.priceLabelPrintRequired ? 'Etikettendruck' : null,
    `${v.priceLabelAttachPositionCount} Pos. etikettieren`,
    `${v.securityRequiredPositionCount} Pos. sichern`,
    `${v.onlineRelevantPositionCount} Pos. online`,
    v.redPriceRequired ? 'Rotpreis' : null,
    v.goodsReceiptCheckPercentage != null ? `${v.goodsReceiptCheckPercentage}% Prüfung` : null,
  ]
    .filter((p): p is string => p != null)
    .join(' · ');
}

export function EffortPreview({ config }: { config: EffortRuleConfig }): JSX.Element {
  const preview = previewEffort(config);

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
        Live-Vorschau · Beispiel-Beleg
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {exampleSummary()}
      </Typography>

      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: 'block', mt: 2, fontWeight: 700 }}
      >
        So setzt sich die Bearbeitungszeit zusammen
      </Typography>
      <Stack spacing={0.5}>
        {preview.components
          .filter((c) => c.minutes > 0)
          .map((c) => (
            <Row key={c.key} left={EFFORT_COMPONENT_LABEL[c.key]} right={min(c.minutes)} />
          ))}
        <Divider sx={{ my: 0.5 }} />
        <Row left="Bearbeitungszeit gesamt" right={min(preview.totalMinutes)} strong />
        <Row
          left="Aufwandspunkte"
          right={preview.totalPoints.toFixed(2).replace('.', ',')}
          strong
        />
      </Stack>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" color="text.secondary">
        Jede Zeile ist ein <strong>eingestellter Parameter</strong> (oben editierbar) × Belegmenge.
        Aufwand bestimmt <strong>Bearbeitungszeit</strong> und <strong>Aufwandspunkte</strong> und
        damit indirekt <strong>Bündelgröße</strong> und <strong>Lastverteilung</strong>; er ändert{' '}
        <strong>nicht</strong> die Priorität. Box-Splitting greift erst beim Aufteilen in mehrere
        Transportboxen (daher hier 0). Hinweis: Die Parameter wirken in der Live-Verteilung erst,
        sobald Positionsdaten je Beleg vorliegen — Details in{' '}
        <code>docs/concept/aufwandsfaktoren-wirkung.md</code>.
      </Typography>
    </Paper>
  );
}

function Row({
  left,
  right,
  strong,
}: {
  left: string;
  right: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 400 }}>
        {left}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: strong ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}
      >
        {right}
      </Typography>
    </Box>
  );
}
