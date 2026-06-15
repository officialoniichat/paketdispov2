/**
 * Eiserne Reserve indicator (Reserve & Starterpaket concept §5/§9). Shows whether
 * the holdable, deadline-safe carryover backlog secures tomorrow morning's start.
 * Driven by the Admin/Regeln reserve rule, it renders four coherent states and
 * NEVER shows an ambiguous "✅ / Ziel 0":
 *
 * - satisfied:      ✅ "gesichert", secured / target, full progress.
 * - at_risk:        ⚠ warning tone, "Ziel … · nur …", Leerlauf-Risiko hint.
 * - disabled:       neutral/muted, "Eiserne Reserve deaktiviert", no progress.
 * - no_early_shift: neutral, "Keine Frühschicht geplant", no target number.
 *
 * Distinct from the "Freie Kapazität" tile (net − planned idle headroom) — this is
 * the deliberate floor of startable work held back for the next morning.
 */
import type { JSX } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatMinutes } from '../../lib/format.js';

export type ReserveState = 'satisfied' | 'at_risk' | 'disabled' | 'no_early_shift';

export interface ReserveCardProps {
  state: ReserveState;
  targetMinutes: number;
  securedMinutes: number;
}

export function ReserveCard({ state, targetMinutes, securedMinutes }: ReserveCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ minWidth: 220, flex: '1 1 220px' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        {state === 'satisfied' && (
          <SatisfiedBody targetMinutes={targetMinutes} securedMinutes={securedMinutes} />
        )}
        {state === 'at_risk' && (
          <AtRiskBody targetMinutes={targetMinutes} securedMinutes={securedMinutes} />
        )}
        {state === 'disabled' && <DisabledBody />}
        {state === 'no_early_shift' && <NoEarlyShiftBody />}
      </CardContent>
    </Card>
  );
}

interface FloorProps {
  targetMinutes: number;
  securedMinutes: number;
}

function SatisfiedBody({ targetMinutes, securedMinutes }: FloorProps): JSX.Element {
  return (
    <>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        ✅ Eiserne Reserve
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
          gesichert
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatMinutes(securedMinutes)} / Ziel {formatMinutes(targetMinutes)}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={100}
        color="success"
        sx={{ height: 8, borderRadius: 4, mt: 1 }}
      />
    </>
  );
}

function AtRiskBody({ targetMinutes, securedMinutes }: FloorProps): JSX.Element {
  const progress = targetMinutes <= 0 ? 0 : Math.min(100, (securedMinutes / targetMinutes) * 100);
  return (
    <>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        ⚠ Eiserne Reserve
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
          Ziel {formatMinutes(targetMinutes)} · nur {formatMinutes(securedMinutes)}
        </Typography>
        <Typography variant="body2" color="warning.main">
          Leerlauf-Risiko 09:00
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={progress}
        color="warning"
        sx={{ height: 8, borderRadius: 4, mt: 1 }}
      />
    </>
  );
}

function DisabledBody(): JSX.Element {
  return (
    <>
      <Typography variant="overline" color="text.disabled" sx={{ lineHeight: 1.2 }}>
        Eiserne Reserve
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.disabled' }}>
          deaktiviert
        </Typography>
        <Typography variant="body2" color="text.secondary">
          In Regeln nicht aktiv
        </Typography>
      </Stack>
    </>
  );
}

function NoEarlyShiftBody(): JSX.Element {
  return (
    <>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        Eiserne Reserve
      </Typography>
      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          Keine Frühschicht
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Kein Frühschicht-Bedarf geplant
        </Typography>
      </Stack>
    </>
  );
}
