/**
 * Live-Vorschau für den Admin "Aufwand"-Tab (§11). Rechnet den geschätzten Aufwand
 * eines Beispiel-Belegs live neu, während der Teamlead einen Faktor ändert — über die
 * ECHTE Engine-Funktion {@link previewEffortBreakdown} (single source of truth, keine
 * Nachimplementierung der Formel). Macht so Punkt 2 der Teamlead-Anmerkungen sichtbar:
 * "Welchen Impact hat es, wenn ich z. B. Faktor Etikettendruck von 1,2 auf 2,0 ändere?".
 */
import type { JSX } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { EffortRuleConfig } from '@paket/domain-types';
import { previewEffortBreakdown, EXAMPLE_EFFORT_VECTOR } from '@paket/assignment-engine';

/** German display label + the engine term each factor scales (for the breakdown rows). */
const FACTOR_META: Record<keyof EffortRuleConfig, { label: string; scales: string }> = {
  priceLabelPrintFactor: { label: 'Etikettendruck', scales: 'Drucken + Anbringen von Preisetiketten' },
  securingFactor: { label: 'Sicherung', scales: 'Warensicherung je Position' },
  onlineFactor: { label: 'Online', scales: 'Behandlung online-relevanter Positionen' },
  redPriceFactor: { label: 'Rotpreis', scales: 'Auszeichnung reduzierter Artikel' },
  checkShareFactor: { label: 'Prüfanteil', scales: 'Prüfaufwand (Mengen-/Stichproben-/Vollkontrolle)' },
  boxSplittingFactor: { label: 'Box-Splitting', scales: 'je zusätzlicher Transportbox (nachgelagert)' },
};

const FACTOR_ORDER: readonly (keyof EffortRuleConfig)[] = [
  'priceLabelPrintFactor',
  'securingFactor',
  'onlineFactor',
  'redPriceFactor',
  'checkShareFactor',
  'boxSplittingFactor',
];

/** "44.75" → "44,75 min" — German decimal comma for minutes. */
function min(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} min`;
}

/** Plain-language description of the engine's EXAMPLE_EFFORT_VECTOR. */
function exampleSummary(): string {
  const v = EXAMPLE_EFFORT_VECTOR;
  const parts = [
    `${v.totalQuantity} Teile`,
    v.priceLabelPrintRequired ? 'Etikettendruck' : null,
    `${v.priceLabelAttachPositionCount} Pos. etikettieren`,
    `${v.securityRequiredPositionCount} Pos. sichern`,
    `${v.onlineRelevantPositionCount} Pos. online`,
    v.redPriceRequired ? 'Rotpreis' : null,
    v.goodsReceiptCheckPercentage != null ? `${v.goodsReceiptCheckPercentage}% Prüfung` : null,
  ].filter((p): p is string => p != null);
  return parts.join(' · ');
}

export function EffortPreview({ factors }: { factors: EffortRuleConfig }): JSX.Element {
  const preview = previewEffortBreakdown(factors);

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'action.hover' }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
        Live-Vorschau · Beispiel-Beleg
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {exampleSummary()}
      </Typography>

      <Stack direction="row" spacing={3} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
        <Stat label="Bearbeitungszeit" value={min(preview.totalMinutes)} strong />
        <Stat label="Aufwandspunkte" value={preview.totalPoints.toFixed(2).replace('.', ',')} />
        <Stat label="davon durch Faktoren" value={`+ ${min(preview.factorMinutes)}`} />
        <Stat label="neutral (alle Faktoren 1,0)" value={min(preview.baselineMinutes)} muted />
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      <Stack spacing={0.75}>
        {FACTOR_ORDER.map((key) => {
          const meta = FACTOR_META[key];
          const contrib = preview.contributions.find((c) => c.key === key);
          const value = factors[key];
          const isBoxSplitting = key === 'boxSplittingFactor';
          return (
            <Box
              key={key}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 1,
                alignItems: 'baseline',
              }}
            >
              <Typography variant="body2">
                <strong>{meta.label}</strong>{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  — {meta.scales}
                </Typography>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                ×&nbsp;{value.toFixed(2).replace('.', ',')}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 120, textAlign: 'right' }}
                color={isBoxSplitting ? 'text.disabled' : 'text.primary'}
              >
                {isBoxSplitting
                  ? 'wirkt bei Aufteilung'
                  : `+ ${min(contrib?.deltaMinutes ?? 0)}`}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" color="text.secondary">
        Aufwand bestimmt <strong>Bearbeitungszeit</strong> und <strong>Aufwandspunkte</strong> und
        damit indirekt <strong>Bündelgröße</strong> und <strong>Lastverteilung</strong>. Er ändert{' '}
        <strong>nicht</strong> die Priorität (Reihenfolge) — die ergibt sich aus Prio-Kennzeichen
        und Terminen. Box-Splitting greift erst beim Aufteilen eines Belegs in mehrere
        Transportboxen, daher ohne Wirkung auf diesen Einzelbeleg.
      </Typography>
    </Paper>
  );
}

function Stat({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}): JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant={strong ? 'h6' : 'body1'}
        sx={{ fontWeight: strong ? 800 : 600, fontVariantNumeric: 'tabular-nums' }}
        color={muted ? 'text.secondary' : 'text.primary'}
      >
        {value}
      </Typography>
    </Box>
  );
}
