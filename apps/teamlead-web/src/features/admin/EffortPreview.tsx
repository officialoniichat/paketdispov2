/**
 * Live-Vorschau für den Admin "Aufwand"-Tab (§11). Macht Teamlead-Punkt 2 vollständig
 * greifbar: (1) WOHER die Minuten kommen (feste Engine-Grundzeiten je Beleg), und
 * (2) WORAUF die Faktoren wirken (Multiplikator je Aufwandsanteil). Beide Blöcke werden
 * live über die ECHTE Engine-Funktion {@link previewEffortBreakdown} berechnet
 * (single source of truth, keine Nachimplementierung der Formel).
 */
import type { JSX } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { EffortRuleConfig } from '@paket/domain-types';
import {
  previewEffortBreakdown,
  EXAMPLE_EFFORT_VECTOR,
  type EffortBaseComponent,
  type EffortFactorContribution,
} from '@paket/assignment-engine';

/** German label per base-formula term (where the neutral minutes come from). */
const COMPONENT_LABEL: Record<EffortBaseComponent['key'], string> = {
  base: 'Grundzeit je Beleg',
  quantity: 'Mengenerfassung',
  priceLabelPrint: 'Etiketten drucken',
  labelAttach: 'Etiketten anbringen',
  security: 'Warensicherung',
  online: 'Online-Behandlung',
  redPrice: 'Rotpreis-Auszeichnung',
  check: 'Prüfung (Mehraufwand)',
  handling: 'Handling / Füllmaterial',
};

/** German label + the base term each factor multiplies. */
const FACTOR_META: Record<EffortFactorContribution['key'], { label: string; scales: string }> = {
  priceLabelPrintFactor: { label: 'Etikettendruck', scales: 'Etiketten drucken + anbringen' },
  securingFactor: { label: 'Sicherung', scales: 'Warensicherung je Position' },
  onlineFactor: { label: 'Online', scales: 'Online-Behandlung je Position' },
  redPriceFactor: { label: 'Rotpreis', scales: 'Rotpreis-Auszeichnung' },
  checkShareFactor: { label: 'Prüfanteil', scales: 'Prüf-Mehraufwand' },
  boxSplittingFactor: { label: 'Box-Splitting', scales: 'je zusätzlicher Transportbox (nachgelagert)' },
};

/** "44.75" → "44,75 min" — German decimal comma for minutes. */
function min(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} min`;
}

/** "1.2" → "1,20" — German decimal comma for a factor value. */
function fac(value: number): string {
  return value.toFixed(2).replace('.', ',');
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

      {/* 1 — Woher die Minuten kommen: feste Engine-Grundzeiten (ohne Faktoren). */}
      <SectionTitle index="1" title="Grundaufwand — feste Engine-Minuten (ohne Faktoren)" />
      <Stack spacing={0.5}>
        {preview.baseComponents
          .filter((c) => c.minutes > 0)
          .map((c) => (
            <Row key={c.key} left={COMPONENT_LABEL[c.key]} right={min(c.minutes)} />
          ))}
        <Divider sx={{ my: 0.5 }} />
        <Row left="Grundaufwand (alle Faktoren = 1,0)" right={min(preview.baselineMinutes)} strong />
      </Stack>

      {/* 2 — Worauf die Faktoren wirken: Multiplikator je Anteil. */}
      <SectionTitle index="2" title="Wirkung der Faktoren (Multiplikatoren)" />
      <Stack spacing={0.5}>
        {preview.contributions.map((contrib) => {
          const meta = FACTOR_META[contrib.key];
          const isBoxSplitting = contrib.key === 'boxSplittingFactor';
          return (
            <Box
              key={contrib.key}
              sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1, alignItems: 'baseline' }}
            >
              <Typography variant="body2">
                <strong>{meta.label}</strong>{' '}
                <Typography component="span" variant="caption" color="text.secondary">
                  — {meta.scales}
                </Typography>
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                ×&nbsp;{fac(factors[contrib.key])}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 120, textAlign: 'right' }}
                color={isBoxSplitting ? 'text.disabled' : 'text.primary'}
              >
                {isBoxSplitting ? 'wirkt bei Aufteilung' : `+ ${min(contrib.deltaMinutes)}`}
              </Typography>
            </Box>
          );
        })}
        <Divider sx={{ my: 0.5 }} />
        <Row left="Mehraufwand durch Faktoren" right={`+ ${min(preview.factorMinutes)}`} strong />
      </Stack>

      {/* Ergebnis. */}
      <Divider sx={{ my: 1.5 }} />
      <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap' }}>
        <Stat label="Bearbeitungszeit gesamt" value={min(preview.totalMinutes)} strong />
        <Stat
          label="Aufwandspunkte"
          value={preview.totalPoints.toFixed(2).replace('.', ',')}
        />
      </Stack>

      <Divider sx={{ my: 1.5 }} />
      <Typography variant="caption" color="text.secondary">
        Aufwand bestimmt <strong>Bearbeitungszeit</strong> und <strong>Aufwandspunkte</strong> und
        damit indirekt <strong>Bündelgröße</strong> und <strong>Lastverteilung</strong>. Er ändert{' '}
        <strong>nicht</strong> die Priorität (Reihenfolge) — die ergibt sich aus Prio-Kennzeichen
        und Terminen. Box-Splitting greift erst beim Aufteilen eines Belegs in mehrere
        Transportboxen, daher ohne Wirkung auf diesen Einzelbeleg. Die Vorschau rechnet mit der
        echten Aufwandsformel der Engine — Details in{' '}
        <code>docs/concept/aufwandsfaktoren-wirkung.md</code>.
      </Typography>
    </Paper>
  );
}

function SectionTitle({ index, title }: { index: string; title: string }): JSX.Element {
  return (
    <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2, fontWeight: 700 }}>
      {index} · {title}
    </Typography>
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

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }): JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        variant={strong ? 'h6' : 'body1'}
        sx={{ fontWeight: strong ? 800 : 600, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    </Box>
  );
}
