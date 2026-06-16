/**
 * 9.9 Screen: Abschluss / ZST. The full close ("ZST setzen und abschließen") is
 * blocked until the completion gate passes (all positions checked, minimum
 * quantity control done, all boxes sealed). "Teilabschluss" needs a reason and
 * produces a partial-completion event (§4.6).
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useLiveQuery } from 'dexie-react-hooks';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { SkipDialog } from '../components/SkipDialog.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { canCompleteCase } from '../workflow/workflowModel.js';
import { db } from '../db/db.js';
import { TAGESSTART } from '../routes/paths.js';

export function AbschlussScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);
  const [partialOpen, setPartialOpen] = useState(false);

  const openIssues =
    useLiveQuery(
      () =>
        db.events
          .toArray()
          .then(
            (entries) =>
              entries.filter((e) => e.eventType === 'issue.created' && e.entityId === caseId)
                .length,
          ),
      [caseId],
      0,
    ) ?? 0;

  if (!flow.aggregate || !flow.progress) {
    return <CaseCardSkeleton />;
  }

  const agg = flow.aggregate;
  const p = flow.progress;
  const gate = canCompleteCase(p, agg, openIssues);

  const doneQuantity = agg.positions
    .filter((pos) => p.confirmedPositionIds.includes(pos.id))
    .reduce((sum, pos) => sum + pos.skuLines.reduce((a, l) => a + l.expectedQuantity, 0), 0);

  const boxesCreated = p.boxes.filter((b) => b.labelPrinted).length;
  const boxesSealed = p.boxes.filter((b) => b.sealed).length;

  const complete = async (): Promise<void> => {
    await flow.complete();
    navigate(TAGESSTART);
  };

  const partial = async (reason: string): Promise<void> => {
    await flow.partialComplete(reason);
    setPartialOpen(false);
    navigate(TAGESSTART);
  };

  return (
    <Box sx={{ p: 2, pb: 20 }}>
      <Typography variant="overline" color="text.secondary">
        Beleg WE {agg.case.weBelegNo}
      </Typography>
      <Typography variant="h1" gutterBottom>
        Beleg abschließen
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={0.5}>
          <Typography>
            Fertige Menge: {doneQuantity} / {agg.case.totalQuantity}
          </Typography>
          <Typography>Offene Probleme: {openIssues}</Typography>
          <Typography>Boxzettel: {boxesCreated} erstellt</Typography>
          <Typography>Boxen: {boxesSealed} verplombt</Typography>
        </Stack>
      </Paper>

      {!gate.ok ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Noch offen: {gate.reasons.join(', ')}
        </Alert>
      ) : null}

      <Stack
        spacing={1}
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
        <TouchButton emphasis="primary" disabled={!gate.ok} onClick={complete}>
          ZST setzen und abschließen
        </TouchButton>
        <Button variant="outlined" size="large" fullWidth onClick={() => setPartialOpen(true)}>
          Teilabschluss
        </Button>
      </Stack>

      <SkipDialog
        open={partialOpen}
        title="Teilabschluss – Grund"
        onCancel={() => setPartialOpen(false)}
        onConfirm={partial}
      />
    </Box>
  );
}
