/**
 * Employee login (replaces the former Tisch-Anmeldung gate). The worker signs in
 * with their Mitarbeiternummer alone against `POST /api/auth/login` (see
 * `data/auth.ts`) — no PIN: impersonating a colleague would only mean doing that
 * colleague's work. The resulting session gates the whole app in `App.tsx`.
 * Arbeitsplatz/Tisch is admin-assigned server-side (`User.workstationId`), not
 * claimed client-side.
 */
import { useState, type FormEvent, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { oskProps } from '../components/OnScreenKeyboard.js';
import { login, LoginError } from '../data/auth.js';
import type { Session } from '../data/session.js';
import { resolveEnv } from '../config/runtimeEnv.js';

export interface LoginScreenProps {
  onLoggedIn: (session: Session) => void;
}

/**
 * Vorbelegte Mitarbeiternummer — ausschließlich für den Demo-Link.
 *
 * Nur gesetzt, wenn die Umgebung `VITE_DEMO_EMPLOYEE_NO` mitgibt (Railway-Variable →
 * `/env.js`, siehe `config/runtimeEnv.ts`). Ohne die Variable startet das Feld leer:
 * ein produktiv genutzter Stand darf keine Nummer vorschlagen, mit der sich jeder
 * Besucher als dieser Mitarbeiter anmeldet. Für die Vorführung setzt man `ma-108` —
 * der Standard-Seed (B1) weist ihm direkt das Demo-Bündel zu: 8 Belege auf 4
 * Abhol-Stops über alle drei Bereiche, alle Warenarten, Liefergruppe ×3,
 * Online-Größen, CatMan-Termin sowie Fertig-/Problem-/Geklärt-Zustände
 * (siehe `seedMa108DemoBundle`, docs/dev/scenarios.md B1). Das Feld bleibt stets
 * editierbar.
 */
const demoEmployeeNo = resolveEnv('VITE_DEMO_EMPLOYEE_NO') ?? '';

export function LoginScreen({ onLoggedIn }: LoginScreenProps): JSX.Element {
  const [employeeNo, setEmployeeNo] = useState(demoEmployeeNo);
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const session = await login(employeeNo.trim());
      onLoggedIn(session);
    } catch (err) {
      if (err instanceof LoginError) {
        setError('Mitarbeiternummer ist unbekannt.');
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
        sx={{ mb: 3 }}
        slotProps={{ htmlInput: oskProps('text') }}
      />
      <Button type="submit" variant="contained" fullWidth disabled={submitting || !employeeNo.trim()}>
        {submitting ? 'Anmelden…' : 'Anmelden'}
      </Button>
    </Box>
  );
}
