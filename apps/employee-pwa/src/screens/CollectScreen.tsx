/**
 * COLLECT phase: one consolidated, route-ordered pick list for the whole bundle.
 *
 * The worker drives the cart to every Lagerplatz and checks each stop off. This
 * is the only gate before PROCESS. Scanning is optional (a stop with
 * `scanRequired` shows a hint and a scan toggles it), but the check-off works
 * without any scanner — the client does not scan today.
 */
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { useBundle } from '../workflow/useBundle.js';
import { useScanner } from '../scanner/useScanner.js';
import { scanMatches } from '../workflow/workflowModel.js';
import { TAGESSTART } from '../routes/paths.js';

export function CollectScreen(): JSX.Element {
  const navigate = useNavigate();
  const { loading, bundle, stops, collectProgress, counts, collectComplete, toggleStop } =
    useBundle();

  const collected = new Set(collectProgress?.collectedSequences ?? []);

  // Optional scan: a scanned code that matches an uncollected stop checks it off.
  useScanner({
    onScan: (code) => {
      const hit = stops.find((s) => !collected.has(s.sequence) && scanMatches(code, s.locationCode));
      if (hit) void toggleStop(hit.sequence);
    },
  });

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton count={3} />
      </Box>
    );
  }

  return (
    <StepScaffold
      caseId=""
      where={`Sammeln · ${bundle?.bereich ?? 'Karren'}`}
      title="Plätze abholen"
      subtitle={`${counts.collected}/${counts.total} Plätze · alle holen, dann bearbeiten`}
      onBack={() => navigate(TAGESSTART)}
      hideProblem
      primary={{
        label: collectComplete
          ? 'Sammeln fertig → Bearbeiten'
          : `Noch ${counts.total - counts.collected} offen`,
        onClick: () => navigate(TAGESSTART),
        disabled: !collectComplete,
      }}
    >
      <Stack spacing={1}>
        {stops.map((stop, index) => {
          const isDone = collected.has(stop.sequence);
          return (
            <Paper
              key={stop.sequence}
              variant="outlined"
              onClick={() => void toggleStop(stop.sequence)}
              sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                cursor: 'pointer',
                borderColor: isDone ? 'success.main' : 'divider',
                bgcolor: isDone ? 'action.hover' : 'background.paper',
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isDone ? 'success.main' : 'action.selected',
                  color: isDone ? 'common.white' : 'text.primary',
                  fontWeight: 700,
                }}
              >
                {isDone ? '✓' : index + 1}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 20 }}>{stop.locationCode}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {stop.caseIds.length} Beleg{stop.caseIds.length === 1 ? '' : 'e'}
                  {stop.scanRequired ? ' · scannen möglich' : ''}
                </Typography>
              </Box>
              <Chip
                size="small"
                color={isDone ? 'success' : 'default'}
                label={isDone ? 'geholt' : 'offen'}
              />
            </Paper>
          );
        })}
      </Stack>
    </StepScaffold>
  );
}
