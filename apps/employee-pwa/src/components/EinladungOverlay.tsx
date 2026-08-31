/**
 * Bildschirm-Benachrichtigung einer Einladung (Beleg-Zusammenarbeit
 * 31.08.2026, Konzept §3.2): App-weit unter dem Profilkreis, zeigt die
 * ÄLTESTE offene Einladung — „<Name> lädt dich ein, WE <Nr> gemeinsam zu
 * bearbeiten" plus mitgeschickte Nachricht, mit zwei runden Tasten: grüner
 * Haken links (annehmen), rotes Kreuz rechts (ablehnen).
 *
 * Sie bleibt stehen, bis der Mitarbeiter reagiert (KEIN Auto-Dismiss — A8:
 * nichts blinkt kurz auf und ist wieder weg); danach rückt die nächste offene
 * Einladung nach. Datenquelle ist der Posteingang (Polling 15 s, SSE
 * beschleunigt nur) — verschwindet die Einladung serverseitig (z. B.
 * Zusammenarbeit beendet), verschwindet auch die Benachrichtigung.
 */
import type { JSX } from 'react';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import GroupsIcon from '@mui/icons-material/Groups';
import { ltColors } from '@paket/ui';
import { aeltesteOffeneEinladung, usePosteingang } from '../data/usePosteingang.js';
import { useEinladungAntworten } from '../data/useInvitations.js';

/** Direkt unter dem Profilkreis (ProfileMenu: top 8px + ~56px Kreis). */
const OVERLAY_TOP = 'calc(72px + env(safe-area-inset-top, 0px))';
const OVERLAY_RIGHT = 'calc(8px + env(safe-area-inset-right, 0px))';

/** Runde Reaktionstasten — Fingerziele deutlich über touchTarget.min. */
const TASTE = 56;

export function EinladungOverlay(): JSX.Element | null {
  const { data } = usePosteingang();
  const antworten = useEinladungAntworten();
  const einladung = aeltesteOffeneEinladung(data?.items ?? []);

  if (einladung === undefined) return null;

  const respond = (accept: boolean): void => {
    if (antworten.isPending || typeof einladung.participantId !== 'string') return;
    antworten.mutate({ participantId: einladung.participantId, accept });
  };

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        top: OVERLAY_TOP,
        right: OVERLAY_RIGHT,
        // Über Inhalt und Dialogen, aber UNTER der On-Screen-Tastatur (1500) —
        // die OSK muss bedienbar bleiben, während die Einladung steht.
        zIndex: 1400,
        p: 2,
        width: 'min(400px, calc(100vw - 16px))',
        borderLeft: `4px solid ${ltColors.shared}`,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {/* Gold + Icon + Text: die geteilte-Beleg-Kennzeichnung ist nie Farbe allein (E.6). */}
        <GroupsIcon sx={{ color: ltColors.shared, mt: 0.25 }} />
        <Typography sx={{ fontWeight: 700 }}>
          {einladung.fromLabel} lädt dich ein, WE {einladung.weBelegNo ?? '—'} gemeinsam zu
          bearbeiten
        </Typography>
      </Stack>
      {typeof einladung.text === 'string' && einladung.text !== '' ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          „{einladung.text}“
        </Typography>
      ) : null}
      {antworten.isError ? (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
          Antwort fehlgeschlagen – bitte erneut versuchen.
        </Typography>
      ) : null}
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
        <IconButton
          aria-label="Einladung annehmen"
          onClick={() => respond(true)}
          disabled={antworten.isPending}
          sx={{
            width: TASTE,
            height: TASTE,
            bgcolor: 'success.main',
            color: 'common.white',
            '&:hover': { bgcolor: 'success.dark' },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
          }}
        >
          <CheckIcon />
        </IconButton>
        <IconButton
          aria-label="Einladung ablehnen"
          onClick={() => respond(false)}
          disabled={antworten.isPending}
          sx={{
            width: TASTE,
            height: TASTE,
            bgcolor: 'error.main',
            color: 'common.white',
            '&:hover': { bgcolor: 'error.dark' },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
          }}
        >
          <CloseIcon />
        </IconButton>
      </Stack>
    </Paper>
  );
}
