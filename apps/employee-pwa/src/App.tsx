import type { JSX } from 'react';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { StatusChip, PriorityChip, SyncChip, TouchButton, CaseCardSkeleton } from '@paket/ui';
import { samplePrioCase } from '@paket/test-fixtures';

/**
 * Foundation showcase for the Mitarbeiter-App surface. Renders the shared
 * design-system core components under the L&T theme; the full task-first
 * screens are built in the Mitarbeiter-App EPIC.
 */
export function App(): JSX.Element {
  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h1" gutterBottom>
        Mitarbeiter-App
      </Typography>
      <Stack spacing={2}>
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
          <Typography>Beleg {samplePrioCase.weBelegNo}:</Typography>
          <StatusChip status={samplePrioCase.status} />
          {samplePrioCase.priorityFlags.map((flag) => (
            <PriorityChip key={flag} flag={flag} />
          ))}
          <SyncChip state="pending" />
        </Stack>
        <CaseCardSkeleton />
        <TouchButton emphasis="primary">Nächsten Lagerplatz anfahren</TouchButton>
      </Stack>
    </Container>
  );
}
