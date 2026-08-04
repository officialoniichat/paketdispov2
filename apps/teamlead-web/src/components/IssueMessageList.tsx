/**
 * Chronologischer Nachrichten-Verlauf einer Meldung (Instruktions-Loop
 * 04.08.2026): wer hat wann was geschrieben — MA-Meldung rot, TL-Instruktion
 * grün, MA-Rückmeldung orange. Gemeinsame Darstellung für den Instruktions-
 * Dialog und den Beleg-Detail-Reiter „Verlauf". Das Backend liefert bereits
 * chronologisch (Erst-Meldung zuerst); sortiert wird hier nur defensiv.
 */
import type { JSX } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDateTime } from '../lib/format.js';
import type { CardIssueMessage } from '../data/types.js';

const KIND_LABEL: Record<CardIssueMessage['kind'], string> = {
  meldung: 'Meldung',
  instruktion: 'Instruktion',
  rueckmeldung: 'Rückmeldung',
};

const KIND_COLOR: Record<CardIssueMessage['kind'], string> = {
  meldung: 'error.main',
  instruktion: 'success.main',
  rueckmeldung: 'warning.main',
};

export function IssueMessageList({
  messages,
}: {
  messages: CardIssueMessage[];
}): JSX.Element | null {
  if (messages.length === 0) return null;
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <Stack spacing={1} sx={{ pl: 1, borderLeft: 2, borderColor: 'divider' }}>
      {sorted.map((m) => (
        <Box key={m.id}>
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(m.createdAt)} ·{' '}
            <Typography
              component="span"
              variant="caption"
              sx={{ fontWeight: 700 }}
              color={KIND_COLOR[m.kind]}
            >
              {KIND_LABEL[m.kind]}
            </Typography>{' '}
            · {m.authorName} ({m.authorRole === 'teamlead' ? 'TL' : 'MA'})
          </Typography>
          <Typography variant="body2" sx={m.kind === 'instruktion' ? { fontWeight: 600 } : undefined}>
            „{m.text}"
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
