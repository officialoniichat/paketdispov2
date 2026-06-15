/** 9.2 Screen: Tagesstart – one bundle, one primary action (§E.3 task-first). */
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { getActiveBundle } from '../db/repository.js';
import { PAKET } from '../routes/paths.js';

export function TagesstartScreen(): JSX.Element {
  const navigate = useNavigate();
  const bundle = useLiveQuery(() => getActiveBundle(), []);

  if (!bundle) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton />
      </Box>
    );
  }

  const route = bundle.pickupStops.map((s) => s.locationCode).join(' → ');
  const belege = bundle.pickupStops.length;

  return (
    <Box sx={{ p: 2, pb: 14 }}>
      <Typography variant="overline" color="text.secondary">
        Tagesstart
      </Typography>
      <Typography variant="h1" gutterBottom>
        Guten Morgen, {bundle.employeeName}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={0.5}>
          <Typography>Arbeitsplatz: {bundle.workstation}</Typography>
          <Typography>
            Geplante Zeit: {bundle.plannedStart}–{bundle.plannedEnd}
          </Typography>
          <Typography>
            Aktuelles Paket: {belege} {belege === 1 ? 'Beleg' : 'Belege'} / ca.{' '}
            {bundle.estimatedMinutes} Minuten
          </Typography>
          <Typography>Abholreihenfolge: {route}</Typography>
        </Stack>
      </Paper>
      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          p: 2,
          bgcolor: 'background.paper',
          boxShadow: 8,
        }}
      >
        <TouchButton emphasis="primary" onClick={() => navigate(PAKET)}>
          Starten
        </TouchButton>
      </Box>
    </Box>
  );
}
