/**
 * Touch primitives & loading skeletons (Anhang E.3/E.5).
 *
 * TouchButton enforces the "Next Best Action" pattern: one large primary button
 * in thumb reach. Skeletons cover the < 200 ms screen-change budget (E.5).
 */
import type { JSX, ReactNode } from 'react';
import Button, { type ButtonProps } from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { touchTarget } from '../theme/tokens.js';

export interface TouchButtonProps extends Omit<ButtonProps, 'size'> {
  /** `primary` renders the oversized Next-Best-Action button (64px). */
  emphasis?: 'primary' | 'standard';
  children: ReactNode;
}

/** Large, glove-friendly action button. */
export function TouchButton({
  emphasis = 'standard',
  children,
  sx,
  ...rest
}: TouchButtonProps): JSX.Element {
  const isPrimary = emphasis === 'primary';
  return (
    <Button
      size={isPrimary ? 'large' : 'medium'}
      fullWidth={isPrimary}
      sx={{ minHeight: isPrimary ? touchTarget.primary : touchTarget.min, ...sx }}
      {...rest}
    >
      {children}
    </Button>
  );
}

export interface CaseCardSkeletonProps {
  /** Render N stacked card skeletons. */
  count?: number;
}

/** Placeholder for a case/package card while data loads. */
export function CaseCardSkeleton({ count = 1 }: CaseCardSkeletonProps): JSX.Element {
  return (
    <Stack spacing={1} role="status" aria-busy="true" aria-label="Lädt…">
      {Array.from({ length: count }, (_, i) => (
        <Box
          key={i}
          sx={{
            p: 2,
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Skeleton variant="text" width="60%" height={28} />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rectangular" height={48} sx={{ mt: 1, borderRadius: 2 }} />
        </Box>
      ))}
    </Stack>
  );
}

export interface ListSkeletonProps {
  rows?: number;
}

/** Placeholder for list/table rows (Teamlead cockpit). */
export function ListSkeleton({ rows = 5 }: ListSkeletonProps): JSX.Element {
  return (
    <Stack spacing={1} role="status" aria-busy="true" aria-label="Lädt…">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
      ))}
    </Stack>
  );
}
