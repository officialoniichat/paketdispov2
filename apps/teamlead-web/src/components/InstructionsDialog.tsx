/**
 * „Instruktionen senden" (Kundenfeedback 04.08.2026): der Dialog listet ALLE
 * Meldungen eines Belegs einzeln — je OFFENER Meldung ein Pflicht-Textfeld mit
 * eigenem Senden-Knopf, bereits instruierte Meldungen erscheinen grün mit dem
 * gesendeten Instruktionstext. Es gibt bewusst keinen Sammel-Knopf: erst wenn
 * jede Meldung ihre Instruktion hat, kippt der Beleg im Backend auf „Geklärt"
 * (problem_resolved) — die Ableitung trifft ausschließlich das Backend.
 */
import { useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SendIcon from '@mui/icons-material/Send';
import { ProblemChip, problemKindLabels } from '@paket/ui';
import type { CardIssue } from '../data/types.js';

export interface InstructionsDialogProps {
  open: boolean;
  weBelegNo: string;
  issues: CardIssue[];
  /** Sendet die Instruktion für GENAU eine Meldung (Pflichttext). */
  onSend: (issueId: string, text: string) => void;
  onClose: () => void;
}

/** Kurzer Anker der Meldung: Position/Order-Nr + Meldezeit. */
function issueAnchor(issue: CardIssue): string {
  const parts: string[] = [];
  if (issue.positionNo !== null) parts.push(`Pos. ${issue.positionNo}`);
  if (issue.orderNo) parts.push(`Order ${issue.orderNo}`);
  parts.push(
    new Date(issue.reportedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }),
  );
  return parts.join(' · ');
}

/** Anzeige-Label der Meldung (Katalog-Snapshot, sonst Problemart). */
export function issueLabel(issue: Pick<CardIssue, 'kind' | 'reasonLabel'>): string {
  return issue.reasonLabel ?? problemKindLabels[issue.kind];
}

export function InstructionsDialog({
  open,
  weBelegNo,
  issues,
  onSend,
  onClose,
}: InstructionsDialogProps): JSX.Element {
  // Entwürfe je Meldung — bleiben beim Senden anderer Meldungen erhalten.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const openIssues = issues.filter((i) => i.status === 'open');

  const send = (issueId: string): void => {
    const text = (drafts[issueId] ?? '').trim();
    if (text === '') return;
    onSend(issueId, text);
    setDrafts((d) => ({ ...d, [issueId]: '' }));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Instruktionen senden · Beleg {weBelegNo}</DialogTitle>
      <DialogContent>
        <Alert severity={openIssues.length > 0 ? 'warning' : 'success'} sx={{ mb: 1.5 }}>
          {openIssues.length > 0
            ? `${openIssues.length} von ${issues.length} Meldungen ohne Instruktion — der Beleg gilt erst als „Geklärt", wenn JEDE Meldung ihre Instruktion hat.`
            : 'Alle Meldungen instruiert — der Beleg ist grün beim Mitarbeiter.'}
        </Alert>
        <Stack spacing={1.5}>
          {issues.map((issue) => {
            const offen = issue.status === 'open';
            // Jüngste MA-Nachricht (Meldung/Rückmeldung) = das, worauf der TL antwortet.
            const letzteMeldung = [...issue.messages]
              .reverse()
              .find((m) => m.kind === 'meldung' || m.kind === 'rueckmeldung');
            return (
              <Box
                key={issue.id}
                sx={{
                  border: 1,
                  borderColor: offen ? 'error.main' : 'success.main',
                  borderRadius: 1,
                  p: 1.25,
                }}
              >
                <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
                  <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
                    {issueLabel(issue)}
                  </Typography>
                  <ProblemChip status={issue.status} size="small" />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {issueAnchor(issue)}
                </Typography>
                {letzteMeldung && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {letzteMeldung.kind === 'rueckmeldung' ? 'Rückmeldung' : 'Meldung'} von{' '}
                    {letzteMeldung.authorName}: „{letzteMeldung.text}"
                  </Typography>
                )}
                {offen ? (
                  <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
                    <TextField
                      fullWidth
                      required
                      multiline
                      minRows={2}
                      size="small"
                      label="Instruktion an den Mitarbeiter (Pflichtfeld)"
                      value={drafts[issue.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [issue.id]: e.target.value }))}
                    />
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<SendIcon />}
                      disabled={(drafts[issue.id] ?? '').trim() === ''}
                      onClick={() => send(issue.id)}
                      sx={{ whiteSpace: 'nowrap', mt: 0.25 }}
                    >
                      Senden
                    </Button>
                  </Stack>
                ) : (
                  issue.instruction && (
                    <Typography variant="body2" color="success.main" sx={{ mt: 0.5 }}>
                      Instruktion: „{issue.instruction}"
                    </Typography>
                  )
                )}
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Schließen</Button>
      </DialogActions>
    </Dialog>
  );
}
