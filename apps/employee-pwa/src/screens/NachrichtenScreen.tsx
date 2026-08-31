/**
 * `/nachrichten` — der Verlauf der Beleg-Zusammenarbeit (31.08.2026, Konzept
 * §3.3): erhaltene Einladungen (offen/angenommen/abgelehnt/entfernt, offene mit
 * Antwort-Tasten direkt im Eintrag), gesendete Einladungen mit der Reaktion und
 * Teamlead-Nachrichten (mit `'Gelesen'`-Quittung), neueste zuerst.
 *
 * Ab `md` ein Splitscreen: links bleibt die Übersicht (`BundleHomeScreen`)
 * stehen und bedienbar, rechts schmal der Verlauf mit eigener Scrollfläche.
 * Auf dem Handy nur der Verlauf mit Zurück-Taste. Alle Stände kommen aus dem
 * Posteingang (`usePosteingang`, Polling 15 s) — die UI wertet nichts selbst.
 */
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Theme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { touchTarget } from '@paket/ui';
import { useEinladungAntworten } from '../data/useInvitations.js';
import { useNachrichtGelesen } from '../data/useNachrichten.js';
import { usePosteingang, type NachrichtDto } from '../data/usePosteingang.js';
import { TAGESSTART } from '../routes/paths.js';
import { BundleHomeScreen } from './BundleHomeScreen.js';

/** Zeitstempel wie in den TL-Hinweis-Blöcken (PositionIssueBlock). */
const ZEIT = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' });

type ChipColor = 'default' | 'success' | 'warning' | 'error' | 'info';

/** Stand je Eintrag — Vokabular aus A7 (offen/angenommen/abgelehnt/entfernt). */
const STATUS_CHIP: Record<NachrichtDto['status'], { label: string; color: ChipColor }> = {
  offen: { label: 'offen', color: 'warning' },
  angenommen: { label: 'angenommen', color: 'success' },
  abgelehnt: { label: 'abgelehnt', color: 'default' },
  entfernt: { label: 'entfernt', color: 'default' },
  ungelesen: { label: 'ungelesen', color: 'info' },
  gelesen: { label: 'gelesen', color: 'default' },
};

function eintragTitel(n: NachrichtDto): string {
  if (n.kind === 'einladung_erhalten') {
    return `${n.fromLabel} lädt dich ein, WE ${n.weBelegNo ?? '—'} gemeinsam zu bearbeiten`;
  }
  if (n.kind === 'einladung_gesendet') {
    return `Einladung an ${n.toLabel}${n.weBelegNo != null ? ` · WE ${n.weBelegNo}` : ''}`;
  }
  // Gleiche Überschrift wie das App-weite Banner (NachrichtenBanner).
  return `Nachricht vom Teamlead${n.weBelegNo != null ? ` · ${n.weBelegNo}` : ''}`;
}

/** Runde Antwort-Taste (grüner Haken / rotes Kreuz) im Verlauf. */
const TASTE_SX = {
  width: touchTarget.min,
  height: touchTarget.min,
  color: 'common.white',
  '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
} as const;

function NachrichtEintrag({ nachricht }: { nachricht: NachrichtDto }): JSX.Element {
  const antworten = useEinladungAntworten();
  const gelesen = useNachrichtGelesen();
  const chip = STATUS_CHIP[nachricht.status];
  const offeneEinladung =
    nachricht.kind === 'einladung_erhalten' &&
    nachricht.status === 'offen' &&
    typeof nachricht.participantId === 'string';

  const respond = (accept: boolean): void => {
    if (antworten.isPending || typeof nachricht.participantId !== 'string') return;
    antworten.mutate({ participantId: nachricht.participantId, accept });
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 0 }}>
          {eintragTitel(nachricht)}
        </Typography>
        <Chip size="small" color={chip.color} label={chip.label} sx={{ flexShrink: 0 }} />
      </Stack>
      {typeof nachricht.text === 'string' && nachricht.text !== '' ? (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          „{nachricht.text}“
        </Typography>
      ) : null}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {ZEIT.format(new Date(nachricht.createdAt))}
      </Typography>

      {offeneEinladung ? (
        // Wie in der Bildschirm-Benachrichtigung: grüner Haken LINKS, rotes Kreuz RECHTS.
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.5 }}>
          <IconButton
            aria-label="Einladung annehmen"
            onClick={() => respond(true)}
            disabled={antworten.isPending}
            sx={{ ...TASTE_SX, bgcolor: 'success.main', '&:hover': { bgcolor: 'success.dark' } }}
          >
            <CheckIcon fontSize="small" />
          </IconButton>
          <IconButton
            aria-label="Einladung ablehnen"
            onClick={() => respond(false)}
            disabled={antworten.isPending}
            sx={{ ...TASTE_SX, bgcolor: 'error.main', '&:hover': { bgcolor: 'error.dark' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ) : null}

      {nachricht.kind === 'teamlead' && nachricht.status === 'ungelesen' ? (
        <Button
          size="small"
          disabled={gelesen.isPending}
          onClick={() => gelesen.mutate(nachricht.id)}
          sx={{ mt: 1 }}
        >
          Gelesen
        </Button>
      ) : null}
    </Paper>
  );
}

/** Rechte Spalte des Splitscreens (`seite`) bzw. Vollbild am Handy (`voll`). */
const SEITE_SX = {
  width: { md: 380, lg: 440 },
  flexShrink: 0,
  borderLeft: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  height: '100dvh',
  overflowY: 'auto',
  position: 'sticky',
  top: 0,
  p: 2,
  // Die fixe Bottom-Bar der Übersicht läuft über die volle Breite — die
  // letzten Einträge brauchen denselben Freiraum wie der Übersichts-Inhalt.
  pb: 18,
} as const;

const VOLL_SX = { p: 2, pb: 4 } as const;

export function NachrichtenPanel({ variant }: { variant: 'seite' | 'voll' }): JSX.Element {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = usePosteingang();
  const items = data?.items ?? [];

  return (
    <Box sx={variant === 'seite' ? SEITE_SX : VOLL_SX}>
      {/* pr hält die Kopfzeile frei vom fixierten Profilkreis oben rechts. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, pr: 7 }}>
        {variant === 'voll' ? (
          <IconButton aria-label="Zurück" onClick={() => navigate(TAGESSTART)}>
            <ArrowBackIcon />
          </IconButton>
        ) : null}
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
          Nachrichten
        </Typography>
        {variant === 'seite' ? (
          <IconButton aria-label="Nachrichten schließen" onClick={() => navigate(TAGESSTART)}>
            <CloseIcon />
          </IconButton>
        ) : null}
      </Stack>

      {isLoading ? (
        <Stack alignItems="center" sx={{ py: 3 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Erneut versuchen
            </Button>
          }
        >
          Nachrichten konnten nicht geladen werden.
        </Alert>
      ) : items.length === 0 ? (
        <Typography color="text.secondary">Keine Nachrichten.</Typography>
      ) : (
        <Stack spacing={1}>
          {items.map((n) => (
            <NachrichtEintrag key={`${n.kind}-${n.id}`} nachricht={n} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export function NachrichtenScreen(): JSX.Element {
  // Splitscreen ab `md` (Konzept §3.3): links bleibt die Übersicht stehen und
  // bedienbar, rechts schmal der Verlauf. Auf dem Handy nur der Verlauf.
  const breit = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));
  if (!breit) return <NachrichtenPanel variant="voll" />;
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <BundleHomeScreen />
      </Box>
      <NachrichtenPanel variant="seite" />
    </Box>
  );
}
