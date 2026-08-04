/**
 * „Instruktionen senden" (Kundenfeedback 04.08.2026): der Dialog listet ALLE
 * Meldungen eines Belegs einzeln — je Meldung der komplette Nachrichten-Verlauf
 * (MA-Meldung, TL-Instruktion, MA-Rückmeldung — wer hat wann was geschrieben),
 * je OFFENER Meldung ein Pflicht-Textfeld mit eigenem Senden-Knopf.
 * Es gibt bewusst keinen Sammel-Knopf: erst wenn
 * jede Meldung ihre Instruktion hat, kippt der Beleg im Backend auf „Geklärt"
 * (problem_resolved) — die Ableitung trifft ausschließlich das Backend.
 *
 * Standardanweisung je Problemart (Admin → Problemarten): mit Auto-Vorbefüllen
 * startet das Feld mit der Katalog-Vorlage, sonst fügt „Standard einfügen" sie
 * per Knopf ein — in beiden Fällen vor dem Senden frei editierbar.
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
import PostAddOutlinedIcon from '@mui/icons-material/PostAddOutlined';
import SendIcon from '@mui/icons-material/Send';
import { ProblemChip, problemKindLabels } from '@paket/ui';
import { IssueMessageList } from './IssueMessageList.js';
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

  // Standardanweisung der Problemart (04.08.2026): mit „Auto-Vorbefüllen" ist die
  // Vorlage der Startwert des Felds; ein selbst geleertes Feld (draft === '')
  // bleibt leer. Ohne Auto steht die Vorlage über den Knopf „Standard einfügen".
  const draftValue = (issue: CardIssue): string =>
    drafts[issue.id] ??
    (issue.defaultInstructionAuto && issue.defaultInstruction ? issue.defaultInstruction : '');

  const send = (issueId: string, text: string): void => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onSend(issueId, trimmed);
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
                {/* Kompletter Nachrichten-Verlauf dieser Meldung — inklusive
                    Rückmeldungen des MA, auf die der TL hier antwortet. */}
                <Box sx={{ mt: 0.75 }}>
                  <IssueMessageList messages={issue.messages} />
                </Box>
                {offen ? (
                  <Stack spacing={0.5} sx={{ mt: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <TextField
                        fullWidth
                        required
                        multiline
                        minRows={2}
                        size="small"
                        label="Instruktion an den Mitarbeiter (Pflichtfeld)"
                        value={draftValue(issue)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [issue.id]: e.target.value }))}
                      />
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<SendIcon />}
                        disabled={draftValue(issue).trim() === ''}
                        onClick={() => send(issue.id, draftValue(issue))}
                        sx={{ whiteSpace: 'nowrap', mt: 0.25 }}
                      >
                        Senden
                      </Button>
                    </Stack>
                    {issue.defaultInstruction ? (
                      <Button
                        size="small"
                        startIcon={<PostAddOutlinedIcon />}
                        sx={{ alignSelf: 'flex-start' }}
                        onClick={() =>
                          setDrafts((d) => ({ ...d, [issue.id]: issue.defaultInstruction ?? '' }))
                        }
                      >
                        Standard einfügen
                      </Button>
                    ) : null}
                  </Stack>
                ) : null}
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
