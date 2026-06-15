/** Compact KPI tile for the cockpit (§10.1 Operations cockpit statt Liste). */
import type { JSX, ReactNode } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ltColors } from '@paket/ui';

export type MetricTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'accent';

const TONE_COLOR: Record<MetricTone, string> = {
  neutral: ltColors.textPrimary,
  positive: ltColors.success,
  warning: ltColors.warning,
  danger: ltColors.danger,
  accent: ltColors.brand,
};

export interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: MetricTone;
  icon?: ReactNode;
}

export function MetricCard({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: MetricCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ minWidth: 150, flex: '1 1 150px' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            {label}
          </Typography>
          {icon}
        </Stack>
        <Typography variant="h4" sx={{ color: TONE_COLOR[tone], fontWeight: 700, mt: 0.5 }}>
          {value}
        </Typography>
        {sub != null && (
          <Typography variant="body2" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
