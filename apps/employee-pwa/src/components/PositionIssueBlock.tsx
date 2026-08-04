/**
 * TL-Hinweis-Block an der BETROFFENEN Position (Kundenfeedback 04.08.2026):
 * zeigt unterhalb der Positions-Infos den kompletten Nachrichten-Verlauf der
 * Meldung — wer hat wann was geschrieben (MA-Meldung rot, TL-Instruktion grün,
 * MA-Rückmeldung orange). Offene Meldungen rahmen rot („wartet auf die
 * Teamleitung"), instruierte grün. Am instruierten Problem kann der MA mit
 * Pflichttext reagieren („Erneut melden / Rückfrage"): die Meldung geht zurück
 * auf offen, der Beleg zurück in den Problem-Status — kein freies Chatten,
 * immer am konkreten Problem verankert. Statuslogik: nur Backend.
 */
import { useState, type JSX } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import { problemKindLabels } from '@paket/ui';
import type { CaseIssueView, IssueMessageView } from '../domain/types.js';

function labelFor(issue: CaseIssueView): string {
  return issue.reasonLabel ?? problemKindLabels[issue.kind] ?? issue.kind;
}

const MESSAGE_KIND_LABEL: Record<IssueMessageView['kind'], string> = {
  meldung: 'Meldung',
  instruktion: 'Instruktion',
  rueckmeldung: 'Rückmeldung',
};

/** Verlaufs-Farbe je Eintragsart: MA-Meldung rot, TL-Instruktion grün, Rückmeldung orange. */
const MESSAGE_KIND_COLOR: Record<IssueMessageView['kind'], string> = {
  meldung: 'error.main',
  instruktion: 'success.main',
  rueckmeldung: 'warning.main',
};

const MESSAGE_TIME = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });

export interface PositionIssueBlockProps {
  issues: CaseIssueView[];
  /** Rückmeldung absenden (Pflichttext) — Screen liefert die Mutation. */
  onReopen: (issueId: string, text: string) => void;
  /** true, solange eine Rückmeldung unterwegs ist (Buttons sperren). */
  reopenPending: boolean;
}

export function PositionIssueBlock({
  issues,
  onReopen,
  reopenPending,
}: PositionIssueBlockProps): JSX.Element | null {
  const [reopenTarget, setReopenTarget] = useState<CaseIssueView | null>(null);
  const [text, setText] = useState('');
  if (issues.length === 0) return null;

  const submit = (): void => {
    if (!reopenTarget || text.trim() === '') return;
    onReopen(reopenTarget.id, text.trim());
    setReopenTarget(null);
    setText('');
  };

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      {issues.map((issue) => {
        const offen = issue.status === 'open';
        return (
          <Box
            key={issue.id}
            sx={{
              border: 2,
              borderColor: offen ? 'error.main' : 'success.main',
              borderRadius: 1,
              p: 1.25,
              bgcolor: offen ? 'rgba(211, 47, 47, 0.06)' : 'rgba(46, 125, 50, 0.06)',
            }}
          >
            <Stack direction="row" alignItems="center" gap={0.75}>
              <CampaignOutlinedIcon
                fontSize="small"
                sx={{ color: offen ? 'error.main' : 'success.main' }}
              />
              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                {labelFor(issue)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700 }}
                color={offen ? 'error.main' : 'success.main'}
              >
                {offen ? 'Offen — wartet auf die Teamleitung' : 'Hinweis der Teamleitung'}
              </Typography>
            </Stack>
            {/* Kompletter Nachrichten-Verlauf: wer hat wann was geschrieben.
                Das Backend liefert chronologisch (Erst-Meldung zuerst). */}
            {issue.messages.length > 0 ? (
              <Stack spacing={0.75} sx={{ mt: 0.75, pl: 1, borderLeft: 2, borderColor: 'divider' }}>
                {issue.messages.map((m) => (
                  <Box key={m.id}>
                    <Typography variant="caption" color="text.secondary">
                      {MESSAGE_TIME.format(new Date(m.createdAt))} ·{' '}
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ fontWeight: 700 }}
                        color={MESSAGE_KIND_COLOR[m.kind]}
                      >
                        {MESSAGE_KIND_LABEL[m.kind]}
                      </Typography>{' '}
                      · {m.authorName} ({m.authorRole === 'teamlead' ? 'TL' : 'MA'})
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={m.kind === 'instruktion' ? { fontWeight: 600 } : undefined}
                    >
                      „{m.text}"
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : issue.description ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                Deine Meldung: „{issue.description}"
              </Typography>
            ) : null}
            {!offen ? (
              <Button
                size="small"
                color="warning"
                startIcon={<ReplyOutlinedIcon />}
                disabled={reopenPending}
                onClick={(e) => {
                  e.stopPropagation();
                  setReopenTarget(issue);
                }}
                sx={{ mt: 0.5, fontWeight: 700 }}
              >
                Erneut melden / Rückfrage
              </Button>
            ) : null}
          </Box>
        );
      })}

      {/* Rückmeldung: Pflichttext, verankert an GENAU dieser Meldung. */}
      <Dialog
        open={reopenTarget !== null}
        onClose={() => setReopenTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Erneut melden · {reopenTarget ? labelFor(reopenTarget) : ''}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Deine Rückmeldung geht direkt an die Teamleitung — die Meldung gilt danach wieder als
            offen und der Beleg wartet erneut auf Klärung.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            required
            multiline
            minRows={3}
            label="Rückmeldung (Pflichtfeld)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReopenTarget(null)}>Abbrechen</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={text.trim() === '' || reopenPending}
            onClick={submit}
          >
            Erneut melden
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
