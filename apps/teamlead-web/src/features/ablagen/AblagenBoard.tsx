/**
 * Digitale Ablagen (§10.2 / Anhang E.4 "Kanban/Queue-Lanes passend zur heutigen
 * Ablagekästen-Logik"). One column per lane (Prio, Jeden-Tag, Verladeplan
 * heute/morgen, Reserve, Geparkt, Prüfen, Problemfälle). Each card's teamlead
 * actions come from the single-source {@link CaseActions} registry, which derives
 * the allowed buttons from the case's §7.1 status — so a parked card offers
 * Entparken, a Problemfall offers „Problem freigeben", etc., with no per-lane
 * button logic here.
 */
import { type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseStatusChip, PriorityChip, ProblemChip } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import { formatMinutes } from '../../lib/format.js';
import { CaseActions } from '../../components/CaseActions.js';
import type { CaseActionCtx } from '../../actions/caseActions.js';
import type { Lane, LaneCard } from '../../data/types.js';

export function AblagenBoard(): JSX.Element {
  const { lanes, parkCase, releaseCase, prioritiseCase, cancelCase, resolveIssue } =
    useCockpitData();
  const navigate = useNavigate();

  const store: CaseActionCtx['store'] = {
    prioritiseCase,
    parkCase,
    releaseCase,
    cancelCase,
    resolveIssue,
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        Digitale Ablagen
      </Typography>
      <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, alignItems: 'flex-start' }}>
        {lanes.map((lane) => (
          <LaneColumn
            key={lane.id}
            lane={lane}
            store={store}
            onOpen={(caseId) => navigate(`/belege/${caseId}`)}
          />
        ))}
      </Box>
    </Stack>
  );
}

interface LaneColumnProps {
  lane: Lane;
  store: CaseActionCtx['store'];
  onOpen: (caseId: string) => void;
}

function LaneColumn({ lane, store, onOpen }: LaneColumnProps): JSX.Element {
  return (
    <Paper
      variant="outlined"
      sx={{ width: 300, flexShrink: 0, p: 1.5, bgcolor: 'background.default' }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography sx={{ fontWeight: 700 }}>{lane.title}</Typography>
        <Chip size="small" label={lane.cards.length} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {lane.description} · {formatMinutes(lane.totalEffortMinutes)}
      </Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {lane.cards.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            Leer.
          </Typography>
        )}
        {lane.cards.map((c) => (
          <LaneCardView key={c.caseId} card={c} store={store} onOpen={onOpen} />
        ))}
      </Stack>
    </Paper>
  );
}

function LaneCardView({
  card,
  store,
  onOpen,
}: {
  card: LaneCard;
  store: CaseActionCtx['store'];
  onOpen: (caseId: string) => void;
}): JSX.Element {
  // „Problem freigeben" is case-scoped (resolves the case's open issue by caseId),
  // so the same ctx works from every surface — incl. the Problemfälle lane card.
  const ctx: CaseActionCtx = { caseId: card.caseId, store };
  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: 0.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{card.weBelegNo}</Typography>
          <Typography variant="caption" color="text.secondary">
            {card.storageCode}
          </Typography>
        </Stack>
        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 0.5 }}>
          <CaseStatusChip status={card.status} size="small" />
          {card.priorityFlags.map((f) => (
            <PriorityChip key={f} flag={f} size="small" />
          ))}
          {card.section !== null && <Chip size="small" label={`Abschnitt ${card.section}`} />}
          {card.issueStatus && <ProblemChip status={card.issueStatus} size="small" />}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {card.totalQuantity} Teile · {formatMinutes(card.estimatedMinutes)}
          {card.assignedTo ? ` · ${card.assignedTo}` : ''}
        </Typography>
      </CardContent>
      <CardActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        <Button size="small" onClick={() => onOpen(card.caseId)}>
          Details
        </Button>
        <CaseActions variant="card" caseStatus={card.status} weBelegNo={card.weBelegNo} ctx={ctx} />
      </CardActions>
    </Card>
  );
}
