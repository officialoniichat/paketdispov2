/**
 * Schnellaktionen — die Entscheidungsliste des Tagescockpits als Single-Source.
 *
 * Jeder Eintrag ist ein reales, bereits geladenes Signal mit Sprungziel
 * (Probleme, Überbuchung, Topf, unvollständige Lieferungen, Überlast,
 * Schichtende). Genutzt vom Tagescockpit UND vom Hexagon-Ausklapper der
 * Sidebar (SchnellaktionenFlyout) — die Fachsignale werden nur EINMAL
 * abgeleitet, nie doppelt.
 */
import { useMemo, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ltColors } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import { formatMinutes } from '../../lib/format.js';

/** Auslastungs-Schwelle, ab der ein Kopf als „eng" markiert wird. */
export const OVERLOAD_PCT = 90;

export interface DecisionItem {
  key: string;
  count: number;
  severity: 'high' | 'mid' | 'low';
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
}

export const SEVERITY_COLOR: Record<DecisionItem['severity'], string> = {
  high: ltColors.danger,
  mid: ltColors.warning,
  low: ltColors.brand,
};

/** Baut die Schnellaktionen aus den bereits geladenen Cockpit-Daten. */
export function useSchnellaktionen(): DecisionItem[] {
  const { cockpit, board, lanes } = useCockpitData();
  const navigate = useNavigate();
  const { capacity, pool } = cockpit;

  const geparktCount = lanes.find((l) => l.id === 'geparkt')?.cards.length ?? 0;
  const incompleteDeliveries = useMemo(() => {
    const seen = new Set<string>();
    for (const lane of lanes) {
      for (const card of lane.cards) {
        const dg = card.deliveryGroup;
        if (dg && dg.missingCount > 0 && !dg.released && !dg.locked) seen.add(dg.id);
      }
    }
    return seen.size;
  }, [lanes]);
  const overloaded = board.filter((r) => r.utilisationPct >= OVERLOAD_PCT);
  const overbooked = capacity.freeCapacityMinutes <= 0;

  const decisions: DecisionItem[] = [];
  if (pool.openIssues > 0) {
    decisions.push({
      key: 'probleme',
      count: pool.openIssues,
      severity: 'high',
      title: pool.openIssues === 1 ? 'Problem offen' : 'Probleme offen',
      description: 'Belege mit gemeldetem Problem — brauchen eine Entscheidung.',
      action: () => navigate('/ablagen'),
      actionLabel: 'Ansehen',
    });
  }
  if (overbooked) {
    decisions.push({
      key: 'kapazitaet',
      count: 1,
      severity: 'high',
      title: 'Überbucht',
      description: `Verplant übersteigt Netto-Kapazität um ${formatMinutes(-capacity.freeCapacityMinutes)}.`,
      action: () => navigate('/board'),
      actionLabel: 'Zum Board',
    });
  }
  if (geparktCount > 0) {
    decisions.push({
      key: 'topf',
      count: geparktCount,
      severity: 'mid',
      title: 'Topf — aus Automatik ausgeschlossen',
      description: 'Manuell geparkte Belege, warten auf eine Entscheidung.',
      action: () => navigate('/ablagen'),
      actionLabel: 'Öffnen',
    });
  }
  if (incompleteDeliveries > 0) {
    decisions.push({
      key: 'lieferungen',
      count: incompleteDeliveries,
      severity: 'mid',
      title: incompleteDeliveries === 1 ? 'Unvollständige Lieferung' : 'Unvollständige Lieferungen',
      description: 'Noch nicht alle Belege der Lieferung erfasst.',
      action: () => navigate('/ablagen'),
      actionLabel: 'Prüfen',
    });
  }
  if (overloaded.length > 0) {
    decisions.push({
      key: 'ausgelastet',
      count: overloaded.length,
      severity: 'low',
      title: `Ausgelastet ≥ ${OVERLOAD_PCT}%`,
      description: overloaded.map((r) => r.displayName).join(', '),
      action: () => navigate('/board'),
      actionLabel: 'Zum Board',
    });
  }
  if (pool.endOfShiftOpen > 0) {
    decisions.push({
      key: 'schichtende',
      count: pool.endOfShiftOpen,
      severity: 'high',
      title: 'Offen trotz Schichtende',
      description: 'Zugeteilter Mitarbeiter hat bereits Feierabend — keine offene Ware über Nacht.',
      action: () => navigate('/board'),
      actionLabel: 'Klären',
    });
  }

  return decisions;
}

/** Die klickbare Liste — identische Optik im Tagescockpit und im Sidebar-Ausklapper. */
export function SchnellaktionenListe({ decisions }: { decisions: DecisionItem[] }): JSX.Element {
  return (
    <Stack spacing={1}>
      {decisions.map((d) => (
        <Paper
          key={d.key}
          variant="outlined"
          sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <Box
            sx={{
              minWidth: 34,
              height: 34,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 15,
              color: SEVERITY_COLOR[d.severity],
              bgcolor: `${SEVERITY_COLOR[d.severity]}1a`,
              flex: 'none',
            }}
          >
            {d.count}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {d.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {d.description}
            </Typography>
          </Box>
          <Button size="small" onClick={d.action} sx={{ flex: 'none' }}>
            {d.actionLabel} →
          </Button>
        </Paper>
      ))}
    </Stack>
  );
}
