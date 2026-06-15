/**
 * 9.3 Screen: Paket und Abholreihenfolge. The pickup order is vorgegeben; the
 * worker only follows it (§E.3 "Abholreihenfolge ohne Denken").
 */
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { getActiveBundle } from '../db/repository.js';
import { caseStepPath } from '../routes/paths.js';

export function PaketReihenfolgeScreen(): JSX.Element {
  const navigate = useNavigate();
  const bundle = useLiveQuery(() => getActiveBundle(), []);

  if (!bundle) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton count={3} />
      </Box>
    );
  }

  const first = bundle.pickupStops[0];

  return (
    <Box sx={{ p: 2, pb: 14 }}>
      <Typography variant="overline" color="text.secondary">
        Paket 1 von 1
      </Typography>
      <Typography variant="h1" gutterBottom>
        Abholreihenfolge
      </Typography>
      <Paper variant="outlined" sx={{ mb: 2 }}>
        <List disablePadding>
          {bundle.pickupStops.map((stop) => (
            <ListItem key={stop.caseId} divider>
              <ListItemText
                primary={`${stop.sequenceIndex}. ${stop.locationCode} · WE ${stop.weBelegNo}`}
                secondary={`${stop.quantity} Teile${stop.shopAreaNo ? ` · Shopbereich ${stop.shopAreaNo}` : ''}${stop.note ? ` · ${stop.note}` : ''}`}
              />
            </ListItem>
          ))}
        </List>
      </Paper>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Die Abholreihenfolge ist vorgegeben. Bitte in dieser Reihenfolge abholen.
      </Typography>
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
        <TouchButton
          emphasis="primary"
          disabled={!first}
          onClick={() => first && navigate(caseStepPath(first.caseId, 'pickup'))}
        >
          Abholung starten
        </TouchButton>
      </Box>
    </Box>
  );
}
