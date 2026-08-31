/**
 * „Beleg teilen" (Beleg-Zusammenarbeit 31.08.2026, Konzept §3.1): Liste aller
 * aktiven Kolleg:innen mit Haken links (wie in WhatsApp), Initialen, Name und
 * `'heute im Dienst'`; optional eine Nachricht, Aktion `'Einladen'` mit Zähler.
 *
 * Bereits Beteiligte/Eingeladene sind markiert und nicht erneut anhakbar;
 * wer abgelehnt hat oder entfernt wurde, ist wieder wählbar (das Backend setzt
 * die Beteiligung dann erneut auf `eingeladen`). Eine Einladung ist KEINE
 * Zuweisung — der Beleg bleibt beim Inhaber, die Eingeladenen entscheiden.
 * Alle Regeln (wer darf einladen, welcher Beleg-Status) prüft das Backend.
 */
import { useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { components } from '@paket/api-client';
import { touchTarget } from '@paket/ui';
import { useColleagues } from '../data/useColleagues.js';
import { useEinladen } from '../data/useInvitations.js';
import { initials } from './ProfileMenu.js';
import { oskProps } from './OnScreenKeyboard.js';

type CaseSummaryDto = components['schemas']['CaseSummaryDto'];
type CaseParticipantDto = components['schemas']['CaseParticipantDto'];

/**
 * Ist die Kolleg:in bereits am Beleg beteiligt oder eingeladen, liefert das ihr
 * Status-Label — die Zeile ist dann markiert und gesperrt. `abgelehnt`/`entfernt`
 * liefern undefined: erneut einladbar (Konzept §3.4). Vokabular wie in der
 * Team-Ansicht (A7): `'Inhaber'`, `'hilft'`, `'Teil erledigt'`.
 */
export function beteiligungsLabel(p: CaseParticipantDto): string | undefined {
  if (p.status !== 'eingeladen' && p.status !== 'angenommen' && p.status !== 'teil_erledigt') {
    return undefined;
  }
  if (p.role === 'inhaber') return 'Inhaber';
  if (p.status === 'eingeladen') return 'eingeladen';
  if (p.status === 'teil_erledigt') return 'Teil erledigt';
  return 'hilft';
}

export interface TeilenDialogProps {
  open: boolean;
  /** Der Beleg aus „1 · Ware holen" (eigenes Bündel — der Aufrufer ist Inhaber). */
  beleg: CaseSummaryDto;
  onClose: () => void;
}

export function TeilenDialog({ open, beleg, onClose }: TeilenDialogProps): JSX.Element {
  const colleagues = useColleagues();
  const einladen = useEinladen();
  const [ausgewaehlt, setAusgewaehlt] = useState<string[]>([]);
  const [nachricht, setNachricht] = useState('');

  const beteiligungByNo = new Map(
    (beleg.collaboration?.participants ?? []).map((p) => [p.employeeNo, p]),
  );

  const toggle = (employeeNo: string): void => {
    setAusgewaehlt((prev) =>
      prev.includes(employeeNo) ? prev.filter((no) => no !== employeeNo) : [...prev, employeeNo],
    );
  };

  const handleEinladen = async (): Promise<void> => {
    try {
      const text = nachricht.trim();
      await einladen.mutateAsync({
        caseId: beleg.id,
        employeeNos: ausgewaehlt,
        message: text === '' ? undefined : text,
      });
      onClose();
    } catch {
      // Fehler bleibt sichtbar (einladen.isError) — der Dialog bleibt offen.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Beleg teilen
        <Typography variant="body2" color="text.secondary">
          WE {beleg.weBelegNo} gemeinsam bearbeiten — alle sehen alle Positionen.
        </Typography>
      </DialogTitle>
      <DialogContent>
        {colleagues.isLoading ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : colleagues.isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void colleagues.refetch()}>
                Erneut versuchen
              </Button>
            }
          >
            Kolleg:innen konnten nicht geladen werden.
          </Alert>
        ) : (
          <List disablePadding>
            {(colleagues.data ?? []).map((kollegin) => {
              const beteiligung = beteiligungByNo.get(kollegin.employeeNo);
              const statusLabel = beteiligung ? beteiligungsLabel(beteiligung) : undefined;
              const gesperrt = statusLabel !== undefined;
              const angehakt = gesperrt || ausgewaehlt.includes(kollegin.employeeNo);
              return (
                <ListItemButton
                  key={kollegin.employeeNo}
                  disabled={gesperrt}
                  onClick={() => toggle(kollegin.employeeNo)}
                  sx={{ minHeight: touchTarget.min, gap: 1.5, px: 1 }}
                >
                  <Checkbox
                    edge="start"
                    checked={angehakt}
                    tabIndex={-1}
                    disableRipple
                    // Der Haken folgt der Zeile — die ganze Zeile ist das Tippziel.
                    slotProps={{ input: { 'aria-label': `${kollegin.displayName} auswählen` } }}
                  />
                  <Avatar sx={{ width: 36, height: 36, fontSize: '0.85rem', fontWeight: 700 }}>
                    {initials(kollegin.displayName)}
                  </Avatar>
                  <ListItemText
                    primary={kollegin.displayName}
                    secondary={statusLabel ?? (kollegin.shiftToday ? 'heute im Dienst' : undefined)}
                  />
                </ListItemButton>
              );
            })}
            {(colleagues.data ?? []).length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                Keine weiteren Kolleg:innen verfügbar.
              </Typography>
            ) : null}
          </List>
        )}

        <TextField
          label="Nachricht (optional)"
          value={nachricht}
          onChange={(event) => setNachricht(event.target.value)}
          fullWidth
          multiline
          minRows={2}
          sx={{ mt: 2 }}
          slotProps={{ htmlInput: { ...oskProps('text'), maxLength: 500 } }}
        />

        {einladen.isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {einladen.error instanceof Error ? einladen.error.message : 'Einladen fehlgeschlagen.'}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="contained"
          disabled={ausgewaehlt.length === 0 || einladen.isPending}
          onClick={() => void handleEinladen()}
        >
          {ausgewaehlt.length > 0 ? `Einladen (${ausgewaehlt.length})` : 'Einladen'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
