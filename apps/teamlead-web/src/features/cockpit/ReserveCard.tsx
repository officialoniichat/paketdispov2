/**
 * Eiserne Reserve indicator (Reserve & Starterpaket concept §5/§9). Shows whether
 * the holdable, deadline-safe carryover backlog secures tomorrow morning's start.
 *
 * - satisfied: ✅ "gesichert", secured / target, full-ish progress.
 * - not satisfied: ⚠ warning tone, "Ziel … · nur …", Leerlauf-Risiko hint.
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

export interface ReserveCardProps {
  targetMinutes: number;
  securedMinutes: number;
  satisfied: boolean;
}

export function ReserveCard({
  targetMinutes,
  securedMinutes,
  satisfied,
}: ReserveCardProps): JSX.Element {
  const progress =
    targetMinutes <= 0 ? 100 : Math.min(100, (securedMinutes / targetMinutes) * 100);
  const color = satisfied ? 'success' : 'warning';

  return (
    <Card variant="outlined" sx={{ minWidth: 220, flex: '1 1 220px' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
          {satisfied ? '✅ Eiserne Reserve' : '⚠ Eiserne Reserve'}
        </Typography>
        {satisfied ? (
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
              gesichert
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatMinutes(securedMinutes)} / Ziel {formatMinutes(targetMinutes)}
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
              Ziel {formatMinutes(targetMinutes)} · nur {formatMinutes(securedMinutes)}
            </Typography>
            <Typography variant="body2" color="warning.main">
              Leerlauf-Risiko 09:00
            </Typography>
          </Stack>
        )}
        <LinearProgress
          variant="determinate"
          value={progress}
          color={color}
          sx={{ height: 8, borderRadius: 4, mt: 1 }}
        />
      </CardContent>
    </Card>
  );
}
