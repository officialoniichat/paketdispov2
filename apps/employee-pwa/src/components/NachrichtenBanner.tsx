/**
 * Banner unter dem AppHeader: die älteste UNGELESENE Teamlead-Nachricht.
 * „Gelesen" quittiert sie (readAt) — der Teamlead sieht die Quittung in
 * seinem Schnellaktionen-Ausklapper. Weitere Nachrichten rücken nach.
 */
import type { JSX } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { useNachrichtGelesen, useUngeleseneNachrichten } from '../data/useNachrichten.js';

export function NachrichtenBanner(): JSX.Element | null {
  const { data } = useUngeleseneNachrichten();
  const gelesen = useNachrichtGelesen();
  const nachrichten = data?.messages ?? [];
  const erste = nachrichten[0];
  if (erste === undefined) return null;
  return (
    <Alert
      severity="info"
      icon={<MailOutlineIcon />}
      sx={{ borderRadius: 0, alignItems: 'flex-start' }}
      action={
        <Button
          color="inherit"
          size="small"
          disabled={gelesen.isPending}
          onClick={() => gelesen.mutate(erste.id)}
        >
          Gelesen
        </Button>
      }
    >
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        Nachricht vom Teamlead
        {erste.weBelegNo !== null ? ` · ${erste.weBelegNo}` : ''}
      </Typography>
      <Typography variant="body2">{erste.text}</Typography>
      {nachrichten.length > 1 && (
        <Typography variant="caption" color="text.secondary">
          +{nachrichten.length - 1} weitere ungelesen
        </Typography>
      )}
    </Alert>
  );
}
