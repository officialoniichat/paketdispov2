/**
 * A2 Tisch-Anmeldung: lightweight login step — the worker identifies their
 * Arbeitsplatz by typing the Tisch-Nr. or scanning its barcode (keyboard-wedge
 * scanner). The choice persists locally (and is claimed on the backend in
 * live mode) so 'Arbeitsplatz: Tisch X' reflects reality everywhere.
 */
import { useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { TouchButton } from '@paket/ui';
import { useScanner } from '../scanner/useScanner.js';
import { claimWorkstation, type WorkstationClaim } from '../data/workstation.js';
import { getSession } from '../data/session.js';

export interface TischLoginScreenProps {
  onClaimed: (claim: WorkstationClaim) => void;
}

export function TischLoginScreen({ onClaimed }: TischLoginScreenProps): JSX.Element {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const session = getSession();

  const submit = async (value: string): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      onClaimed(await claimWorkstation(trimmed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  // Scanning the Tisch barcode logs in directly (keyboard-wedge scanner).
  useScanner({ onScan: (scanned) => void submit(scanned) });

  return (
    <Box sx={{ p: 2, pt: 6, maxWidth: 480, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary">
        Anmeldung · {session.displayName}
      </Typography>
      <Typography variant="h1" gutterBottom>
        Wo arbeitest du heute?
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Tisch-Nr. eingeben oder den Barcode am Tisch scannen.
      </Typography>

      <Stack spacing={2}>
        <TextField
          autoFocus
          label="Tisch-Nr."
          placeholder="z. B. T-04"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit(code);
          }}
          disabled={busy}
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TouchButton emphasis="primary" disabled={!code.trim() || busy} onClick={() => void submit(code)}>
          {busy ? 'Anmelden…' : 'Anmelden'}
        </TouchButton>
      </Stack>
    </Box>
  );
}
