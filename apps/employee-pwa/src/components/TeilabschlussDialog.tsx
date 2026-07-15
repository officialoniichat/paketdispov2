/**
 * Teilabschluss-Zusammenfassung (Kundenfeedback 14.07.2026, Punkt 10). Ersetzt
 * den alten Freitext-Grund-Dialog: listet ALLE gesammelten Probleme (manuell +
 * implizite Mehr-/Minderlieferung + Preisabweichung) und erklärt, dass der
 * Vorgang zur Fehlerbehebung an die Teamleitung geht und bis zur Klärung gesperrt
 * beim Mitarbeiter geparkt bleibt.
 */
import type { JSX } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import type { CaseAggregate, CaseProgress } from '../domain/types.js';

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

interface ProblemSummaryLine {
  key: string;
  primary: string;
  secondary?: string;
}

/** Baut die Anzeige-Zeilen aller gesammelten Probleme des Belegs. */
export function collectProblemSummary(
  p: CaseProgress,
  aggregate: CaseAggregate,
): ProblemSummaryLine[] {
  const lines: ProblemSummaryLine[] = [];
  const posByPos = new Map(aggregate.positions.map((pos) => [pos.id, pos]));
  const skuIndex = new Map<
    string,
    { positionNo: number; ean: string; size: string; vkLabelPrice?: number }
  >();
  for (const pos of aggregate.positions) {
    for (const sku of pos.skuLines) {
      skuIndex.set(sku.id, {
        positionNo: pos.positionNo,
        ean: sku.ean,
        size: sku.size,
        vkLabelPrice: sku.vkLabelPrice,
      });
    }
  }

  // Manuelle Probleme (Grund aus dem Katalog).
  for (const problem of p.problems) {
    const pos = posByPos.get(problem.positionId);
    const sku = problem.skuLineId ? skuIndex.get(problem.skuLineId) : undefined;
    const scope = sku
      ? `Position ${sku.positionNo} · ${sku.size} · ${sku.ean}`
      : `Position ${pos?.positionNo ?? '?'}`;
    lines.push({
      key: `manual-${problem.id}`,
      primary: `${problem.reasonLabel} — ${scope}`,
      secondary: problem.note,
    });
  }

  // Implizite Mehr-/Minderlieferungen.
  for (const [skuLineId, ist] of Object.entries(p.confirmedQuantities)) {
    const sku = skuIndex.get(skuLineId);
    if (!sku) continue;
    const soll = aggregate.positions
      .flatMap((pos) => pos.skuLines)
      .find((s) => s.id === skuLineId)?.expectedQuantity;
    if (soll === undefined) continue;
    const delta = ist - soll;
    if (delta === 0) continue;
    lines.push({
      key: `qty-${skuLineId}`,
      primary:
        delta > 0
          ? `Mehrlieferung +${delta} — Position ${sku.positionNo} · ${sku.size}`
          : `Minderlieferung −${Math.abs(delta)} — Position ${sku.positionNo} · ${sku.size}`,
      secondary: `Soll ${soll} · Ist ${ist} · ${sku.ean}`,
    });
  }

  // Implizite Preisabweichungen.
  for (const [skuLineId, corrected] of Object.entries(p.correctedVkPrices)) {
    const sku = skuIndex.get(skuLineId);
    if (!sku) continue;
    const from = sku.vkLabelPrice !== undefined ? EUR.format(sku.vkLabelPrice) : '—';
    lines.push({
      key: `price-${skuLineId}`,
      primary: `Preisabweichung — Position ${sku.positionNo} · ${sku.size}`,
      secondary: `VK-Etikett ${from} → Etikettpreis ${EUR.format(corrected)}`,
    });
  }

  return lines;
}

interface TeilabschlussDialogProps {
  open: boolean;
  progress: CaseProgress;
  aggregate: CaseAggregate;
  onClose: () => void;
  onConfirm: () => void;
}

export function TeilabschlussDialog({
  open,
  progress,
  aggregate,
  onClose,
  onConfirm,
}: TeilabschlussDialogProps): JSX.Element {
  const summary = collectProblemSummary(progress, aggregate);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Teilabschluss mit Problemen</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Der Vorgang geht mit den folgenden Problemen zur Fehlerbehebung an die Teamleitung. Bis
          zur Klärung bleibt er in deiner Liste rot geparkt und ist nicht bearbeitbar. Sobald die
          Teamleitung geklärt hat, kommt er grün markiert zu dir zurück.
        </Typography>
        {summary.length === 0 ? (
          <Alert severity="warning">
            Es ist noch kein Problem erfasst. Ohne Problem bitte „Beleg erledigt" verwenden.
          </Alert>
        ) : (
          <List dense>
            {summary.map((line) => (
              <ListItem key={line.key} disableGutters>
                <ListItemText primary={line.primary} secondary={line.secondary} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" onClick={onConfirm} disabled={summary.length === 0}>
          An Teamleitung senden
        </Button>
      </DialogActions>
    </Dialog>
  );
}
