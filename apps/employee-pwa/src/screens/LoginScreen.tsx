/**
 * Real employee login (replaces the former Tisch-Anmeldung gate). The worker
 * authenticates with their Mitarbeiternummer + PIN against
 * `POST /api/auth/login` (see `data/auth.ts`); the resulting session gates the
 * whole app in `App.tsx`. Arbeitsplatz/Tisch is now admin-assigned server-side
 * (`User.workstationId`), not claimed client-side.
 */
import { useState, type FormEvent, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { login, LoginError } from '../data/auth.js';
import type { Session } from '../data/session.js';

export interface LoginScreenProps {
  onLoggedIn: (session: Session) => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps): JSX.Element {
  const [employeeNo, setEmployeeNo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const session = await login(employeeNo.trim(), pin);
      onLoggedIn(session);
    } catch (err) {
      if (err instanceof LoginError) {
        setError('Mitarbeiternummer oder PIN ist falsch.');
      } else {
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      component="form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => void handleSubmit(event)}
      sx={{ maxWidth: 360, mx: 'auto', mt: 8, p: 3 }}
    >
      <Typography variant="h5" sx={{ mb: 3 }}>
        Anmeldung
      </Typography>
      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      <TextField
        label="Mitarbeiternummer"
        value={employeeNo}
        onChange={(e) => setEmployeeNo(e.target.value)}
        fullWidth
        autoFocus
        disabled={submitting}
        sx={{ mb: 2 }}
      />
      <TextField
        label="PIN"
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        fullWidth
        disabled={submitting}
        sx={{ mb: 3 }}
      />
      <Button
        type="submit"
        variant="contained"
        fullWidth
        disabled={submitting || !employeeNo.trim() || !pin}
      >
        {submitting ? 'Anmelden…' : 'Anmelden'}
      </Button>
    </Box>
  );
}
