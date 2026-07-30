/**
 * Vorverteilungs-Dialoge der Mitarbeiter-Matrix (Experiment DA.M.B).
 *
 * NeuesBuendelDialog — Drop auf den „+ Nächstes Bündel"-Slot hinter der
 * Trennwand: fragt die Semantik ab. „Soll enthalten" (Standard): NEUES
 * Bündel, der Self-Pull des Mitarbeiters darf passende Belege dazulegen.
 * „Soll bestehen": NEUES Bündel, das nur diesen Beleg enthält — die
 * Batch-Automatik legt eigene Bündel an und füllt dieses nicht. Beide Wege
 * nutzen dieselbe auditierte Mutation (assignToEmployee mit newBundle); die
 * Wahl wandert wortwörtlich in den §8.4-Audit-Grund.
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
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export type NeuesBuendelWahl = 'enthalten' | 'bestehen';

interface WahlLabelProps {
  titel: string;
  beschreibung: string;
}

function WahlLabel({ titel, beschreibung }: WahlLabelProps): JSX.Element {
  return (
    <Stack sx={{ py: 0.25 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {titel}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {beschreibung}
      </Typography>
    </Stack>
  );
}

export interface NeuesBuendelDialogProps {
  offen: boolean;
  weBelegNo: string;
  employeeName: string;
  onClose: () => void;
  onBestaetigen: (wahl: NeuesBuendelWahl, grund: string, nachricht: string) => void;
}

export function NeuesBuendelDialog({
  offen,
  weBelegNo,
  employeeName,
  onClose,
  onBestaetigen,
}: NeuesBuendelDialogProps): JSX.Element {
  const [wahl, setWahl] = useState<NeuesBuendelWahl>('enthalten');
  const [grund, setGrund] = useState('');
  const [nachricht, setNachricht] = useState('');
  // Frisch je Öffnung — der Dialog wird für wechselnde Belege wiederverwendet.
  useEffect(() => {
    if (offen) {
      setWahl('enthalten');
      setGrund('');
      setNachricht('');
    }
  }, [offen]);

  return (
    <Dialog open={offen} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Nächstes Bündel für {employeeName}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2">
            {weBelegNo} wird ein <b>neues, eigenes Bündel</b> hinter den bestehenden Slots.
          </Typography>
          <RadioGroup value={wahl} onChange={(e) => setWahl(e.target.value as NeuesBuendelWahl)}>
            <FormControlLabel
              value="enthalten"
              control={<Radio size="small" />}
              label={
                <WahlLabel
                  titel="Soll enthalten"
                  beschreibung="Die Automatik darf drumherum passende Belege nachordnen — der Self-Pull des Mitarbeiters füllt das Bündel bei Bedarf auf."
                />
              }
            />
            <FormControlLabel
              value="bestehen"
              control={<Radio size="small" />}
              label={
                <WahlLabel
                  titel="Soll bestehen"
                  beschreibung="Der Beleg bleibt der einzige Bestandteil des Bündels — die Batch-Automatik legt eigene Bündel an und füllt dieses nicht."
                />
              }
            />
          </RadioGroup>
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
        <Button variant="contained" onClick={() => onBestaetigen(wahl, grund.trim(), nachricht.trim())}>
          Bündel anlegen
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
