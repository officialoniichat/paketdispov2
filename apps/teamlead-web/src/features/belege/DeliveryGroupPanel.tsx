import { useState, type JSX } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LockIcon from '@mui/icons-material/Lock';
import { CaseStatusChip } from '@paket/ui';
import { LieferungChip } from '../../components/LieferungChip';
import {
  mergeDeliveryGroup,
  releaseDeliveryGroup,
  splitDeliveryGroup,
  type DeliveryGroupDetail,
} from '../../data/belege';

interface DeliveryGroupPanelProps {
  caseId: string;
  group: DeliveryGroupDetail;
}

/**
 * „Zugehörige Lieferung" (Teamlead-Anforderung Punkt 1) on the Belegdetailview. Shows every
 * sibling Beleg, who holds it, the „X von N · n fehlt" completeness, and lets the teamlead
 * confirm a vermutete Lieferung, trennen, or remove the current Beleg.
 */
export function DeliveryGroupPanel({ caseId, group }: DeliveryGroupPanelProps): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['beleg'] });
    void queryClient.invalidateQueries({ queryKey: ['board'] });
  };
  const onError = (e: Error) => setError(e.message);

  const confirm = useMutation({
    mutationFn: () => mergeDeliveryGroup(group.members.map((m) => m.caseId)),
    onSuccess: invalidate,
    onError,
  });
  const split = useMutation({
    mutationFn: () => splitDeliveryGroup(group.members.map((m) => m.caseId)),
    onSuccess: invalidate,
    onError,
  });
  const remove = useMutation({
    mutationFn: () => splitDeliveryGroup([caseId]),
    onSuccess: invalidate,
    onError,
  });
  const release = useMutation({
    mutationFn: () => releaseDeliveryGroup(group.members.map((m) => m.caseId)),
    onSuccess: invalidate,
    onError,
  });
  const busy = confirm.isPending || split.isPending || remove.isPending || release.isPending;

  const missing = group.missingCount;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Zugehörige Lieferung
        </Typography>
        <LieferungChip group={group} />
        {group.locked && <LockIcon fontSize="small" color="action" />}
      </Stack>

      {missing > 0 && !group.released && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
          {group.presentSize} von {group.expectedSize} Belegen da — {missing} noch nicht gebucht.
          Die Belege warten im Pool, bis die Lieferung vollständig ist (oder du sie freigibst).
        </Alert>
      )}
      {group.released && (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
          Trotz {missing > 0 ? `${missing} fehlender Belege ` : ''}freigegeben — die Lieferung
          wird verteilt, Nachzügler laufen normal ein.
        </Alert>
      )}

      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        {group.members.map((m) => (
          <Stack
            key={m.caseId}
            direction="row"
            alignItems="center"
            gap={1}
            sx={{
              px: 1,
              py: 0.5,
              borderRadius: 1,
              bgcolor: m.isCurrent ? 'action.selected' : 'transparent',
            }}
          >
            <Typography sx={{ fontWeight: m.isCurrent ? 700 : 500, minWidth: 110 }}>
              {m.weBelegNo}
            </Typography>
            <CaseStatusChip status={m.status} size="small" />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {m.assignedEmployeeName ?? 'nicht zugeteilt'}
            </Typography>
            {m.isCurrent ? (
              <Typography variant="caption" color="primary">
                ← dieser Beleg
              </Typography>
            ) : (
              <Button size="small" onClick={() => navigate(`/belege/${m.caseId}`)}>
                öffnen
              </Button>
            )}
          </Stack>
        ))}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Erkannt über: {SIGNAL_LABEL[group.signal]}
      </Typography>

      {error && (
        <Alert severity="error" variant="outlined" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {!group.locked && group.confidence === 'suspected' && (
          <Button variant="contained" size="small" disabled={busy} onClick={() => confirm.mutate()}>
            Lieferung bestätigen
          </Button>
        )}
        {missing > 0 && !group.released && (
          <Button
            variant="contained"
            color="warning"
            size="small"
            disabled={busy}
            onClick={() => release.mutate()}
          >
            Trotzdem bearbeiten
          </Button>
        )}
        <Button variant="outlined" size="small" color="warning" disabled={busy} onClick={() => split.mutate()}>
          Lieferung trennen
        </Button>
        <Button variant="text" size="small" disabled={busy} onClick={() => remove.mutate()}>
          Diesen Beleg entfernen
        </Button>
      </Box>
    </Paper>
  );
}

const SIGNAL_LABEL: Record<DeliveryGroupDetail['signal'], string> = {
  source: 'Quelle „Lieferschein X von N"',
  note: 'gleiche Lieferschein-Nr',
  run: 'fortlaufende Belegnummern',
  manual: 'Teamlead-Korrektur',
  mixed: 'mehrere Signale',
};
