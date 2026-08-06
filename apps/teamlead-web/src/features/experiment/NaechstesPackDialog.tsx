/**
 * Vorverteilungs-Dialoge der Mitarbeiter-Matrix (Experiment DA.M.B).
 *
 * NaechstesPackDialog — Drop auf den „+ Nächstes Pack"-Slot hinter der
 * Trennwand: der Beleg wird ein eigenes, VORGEPLANTES Pack im Tages-Bündel
 * des Mitarbeiters (assignToEmployee mit newPack). In seiner App erscheint es
 * erst, wenn er es sich per „Nächstes Pack" zieht (Pull-Prinzip); die
 * Automatik plant um die Platzierung herum, statt sie abzuräumen. Ein
 * paralleles Zweit-Bündel entsteht nie — das verschattete in der
 * Mitarbeiter-App das aktive Pack samt Problem-Belegen.
 *
 * LaufendEinfassenDialog — Sicherheitsfrage, bevor ein Beleg in ein
 * LAUFENDES Bündel eingefasst (hinten angehängt) wird.
 *
 * Beide Dialoge können optional eine Nachricht an die Mitarbeiter-App
 * mitgeben (Anzeige + „Gelesen"-Quittung, s. data/nachrichten.ts).
 */
import { useEffect, useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface NaechstesPackDialogProps {
  offen: boolean;
  weBelegNo: string;
  employeeName: string;
  onClose: () => void;
  onBestaetigen: (grund: string, nachricht: string) => void;
}

export function NaechstesPackDialog({
  offen,
  weBelegNo,
  employeeName,
  onClose,
  onBestaetigen,
}: NaechstesPackDialogProps): JSX.Element {
  const [grund, setGrund] = useState('');
  const [nachricht, setNachricht] = useState('');
  // Frisch je Öffnung — der Dialog wird für wechselnde Belege wiederverwendet.
  useEffect(() => {
    if (offen) {
      setGrund('');
      setNachricht('');
    }
  }, [offen]);

  return (
    <Dialog open={offen} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nächstes Pack für {employeeName} vorplanen</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2">
            {weBelegNo} wird ein <b>vorgeplantes nächstes Pack</b> im Bündel von {employeeName}.
            In der Mitarbeiter-App erscheint es erst, wenn {employeeName} es sich mit „Nächstes
            Pack" zieht — bis dahin plant die Automatik um die Platzierung herum.
          </Typography>
          <TextField
            size="small"
            label="Grund (optional, §8.4-Audit)"
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
          />
          <TextField
            size="small"
            label={`Nachricht an ${employeeName} (optional, Mitarbeiter-App)`}
            value={nachricht}
            onChange={(e) => setNachricht(e.target.value)}
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" onClick={() => onBestaetigen(grund.trim(), nachricht.trim())}>
          Pack vorplanen
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export interface LaufendEinfassenDialogProps {
  offen: boolean;
  weBelegNo: string;
  employeeName: string;
  onClose: () => void;
  onBestaetigen: (nachricht: string) => void;
}

/** Sicherheitsfrage vor dem Einfassen in ein LAUFENDES Bündel (hinten angehängt). */
export function LaufendEinfassenDialog({
  offen,
  weBelegNo,
  employeeName,
  onClose,
  onBestaetigen,
}: LaufendEinfassenDialogProps): JSX.Element {
  const [nachricht, setNachricht] = useState('');
  useEffect(() => {
    if (offen) setNachricht('');
  }, [offen]);
  return (
    <Dialog open={offen} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>In laufendes Bündel einfassen?</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2">
            Sicher, dass {weBelegNo} in das <b>laufende</b> Bündel von {employeeName} eingefasst
            werden soll? Der Beleg wird hinten an die Abhol-Reihenfolge angehängt.
          </Typography>
          <TextField
            size="small"
            label={`Nachricht an ${employeeName} (optional, Mitarbeiter-App)`}
            value={nachricht}
            onChange={(e) => setNachricht(e.target.value)}
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" color="warning" onClick={() => onBestaetigen(nachricht.trim())}>
          Ja, einfassen
        </Button>
      </DialogActions>
    </Dialog>
  );
}
