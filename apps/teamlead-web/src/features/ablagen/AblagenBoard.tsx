/**
 * Digitale Ablagen (§10.2 / Anhang E.4 "Kanban/Queue-Lanes passend zur heutigen
 * Ablagekästen-Logik"). One column per lane (Prio, Jeden-Tag, Verladeplan
 * heute/morgen, Reserve, Geparkt, Prüfen, Problemfälle). Card actions that change
 * state (Parken/Freigeben/Priorisieren) require a reason and are audited (§8.4).
 */
import { useState, type JSX } from 'react';
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
import { ReasonDialog } from '../../components/ReasonDialog.js';
import type { Lane, LaneCard } from '../../data/types.js';

interface PendingAction {
  title: string;
  description: string;
  suggestions: string[];
  run: (reason: string) => void;
}

export function AblagenBoard(): JSX.Element {
  const { lanes, parkCase, releaseCase, prioritiseCase } = useCockpitData();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingAction | null>(null);

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
            onOpen={(caseId) => navigate(`/belege/${caseId}`)}
            onPark={(c) =>
              setPending({
                title: `Beleg ${c.weBelegNo} parken`,
                description: 'Wird aus der Automatik ausgeschlossen.',
                suggestions: ['Wartet auf Klärung', 'Unvollständige Ware', 'Rücksprache nötig'],
                run: (reason) => parkCase(c.caseId, reason),
              })
            }
            onRelease={(c) =>
              setPending({
                title: `Beleg ${c.weBelegNo} freigeben`,
                description: 'Wird wieder für die Zuteilung freigegeben.',
                suggestions: ['Klärung erledigt', 'Daten korrigiert'],
                run: (reason) => releaseCase(c.caseId, reason),
              })
            }
            onPrioritise={(c) =>
              setPending({
                title: `Beleg ${c.weBelegNo} priorisieren`,
                description: 'Setzt eine manuelle Teamlead-Priorität.',
                suggestions: ['Kunde wartet', 'Verladetag heute', 'Eskalation Markt'],
                run: (reason) => prioritiseCase(c.caseId, reason),
              })
            }
          />
        ))}
      </Box>

      <ReasonDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description}
        suggestions={pending?.suggestions}
        onConfirm={(reason) => pending?.run(reason)}
        onClose={() => setPending(null)}
      />
    </Stack>
  );
}

interface LaneColumnProps {
  lane: Lane;
  onOpen: (caseId: string) => void;
  onPark: (c: LaneCard) => void;
  onRelease: (c: LaneCard) => void;
  onPrioritise: (c: LaneCard) => void;
}

function LaneColumn({
  lane,
  onOpen,
  onPark,
  onRelease,
  onPrioritise,
}: LaneColumnProps): JSX.Element {
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
          <Card key={c.caseId} variant="outlined">
            <CardContent sx={{ pb: 0.5 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 0.5 }}
              >
                <Typography sx={{ fontWeight: 700 }}>{c.weBelegNo}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {c.storageCode}
                </Typography>
              </Stack>
              <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mb: 0.5 }}>
                <CaseStatusChip status={c.status} size="small" />
                {c.priorityFlags.map((f) => (
                  <PriorityChip key={f} flag={f} size="small" />
                ))}
                {c.section !== null && <Chip size="small" label={`Abschnitt ${c.section}`} />}
                {c.issueStatus && <ProblemChip status={c.issueStatus} size="small" />}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {c.totalQuantity} Teile · {formatMinutes(c.estimatedMinutes)}
                {c.assignedTo ? ` · ${c.assignedTo}` : ''}
              </Typography>
            </CardContent>
            <CardActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              <Button size="small" onClick={() => onOpen(c.caseId)}>
                Details
              </Button>
              {lane.id === 'geparkt' ? (
                <Button size="small" onClick={() => onRelease(c)}>
                  Freigeben
                </Button>
              ) : (
                <>
                  <Button size="small" onClick={() => onPrioritise(c)}>
                    Priorisieren
                  </Button>
                  <Button size="small" color="warning" onClick={() => onPark(c)}>
                    Parken
                  </Button>
                </>
              )}
            </CardActions>
          </Card>
        ))}
      </Stack>
    </Paper>
  );
}
