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
import { istMenge } from '../workflow/workflowModel.js';

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

  // Implizite Probleme kommen aus dem AGGREGAT: Ist-Menge und Preiskorrektur sind
  // seit der Zusammenarbeit (31.08.2026) serverseitig erfasst — auch die eines
  // anderen Beteiligten gehören in diese Zusammenfassung.
  for (const line of aggregate.positions.flatMap((pos) => pos.skuLines)) {
    const sku = skuIndex.get(line.id);
    if (!sku) continue;
    const ist = istMenge(line);
    const delta = ist - line.expectedQuantity;
    if (delta !== 0) {
      lines.push({
        key: `qty-${line.id}`,
        primary:
          delta > 0
            ? `Mehrlieferung +${delta} — Position ${sku.positionNo} · ${sku.size}`
            : `Minderlieferung −${Math.abs(delta)} — Position ${sku.positionNo} · ${sku.size}`,
        secondary: `Soll ${line.expectedQuantity} · Ist ${ist} · ${sku.ean}`,
      });
    }
    if (line.correctedVkPrice !== undefined) {
      const from = sku.vkLabelPrice !== undefined ? EUR.format(sku.vkLabelPrice) : '—';
      lines.push({
        key: `price-${line.id}`,
        primary: `Preisabweichung — Position ${sku.positionNo} · ${sku.size}`,
        secondary: `VK-Etikett ${from} → Etikettpreis ${EUR.format(line.correctedVkPrice)}`,
      });
    }
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
