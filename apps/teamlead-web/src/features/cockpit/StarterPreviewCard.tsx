/**
 * Starterpaket-morgen summary (Reserve & Starterpaket concept §6). Previews the
 * carryover belege that would form the early shift's morning bundle — capped at the
 * eiserne-Reserve target worth. Summary card only (no drawer yet).
 */
import type { JSX } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatMinutes } from '../../lib/format.js';

export interface StarterPreviewCardProps {
  belegCount: number;
  minutes: number;
}

export function StarterPreviewCard({ belegCount, minutes }: StarterPreviewCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ minWidth: 220, flex: '1 1 220px' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
          Starterpaket morgen
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {belegCount} Belege
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ~{formatMinutes(minutes)}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
