/**
 * Slim, always-visible top bar for the Mitarbeiter-App. Mirrors the Teamlead
 * cockpit's AppBar and carries the cross-app switch link ("Zur Teamlead-App"),
 * so users can move between the two frontends without editing the URL/port.
 * Also shows the signed-in employee's name and an "Abmelden" (logout) action.
 * `logout()` clears the session (`data/auth.ts` → `data/session.ts`), which
 * notifies `App.tsx` (subscribed via `onSessionCleared`) to fall back to
 * `LoginScreen` — the same mechanism a 401 session-expiry uses.
 */
import type { JSX } from 'react';
import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import LogoutIcon from '@mui/icons-material/Logout';
import { TEAMLEAD_APP_URL } from '../config/appLinks.js';
import { logout } from '../data/auth.js';
import { getSession } from '../data/session.js';

export function AppHeader(): JSX.Element {
  const session = getSession();

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }}>
          L&amp;T Warenauszeichnung
        </Typography>
        {session && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {session.displayName}
          </Typography>
        )}
        <Button
          component="a"
          href={TEAMLEAD_APP_URL}
          size="small"
          variant="outlined"
          startIcon={<DesktopWindowsIcon />}
        >
          Zur Teamlead-App
        </Button>
        <Button size="small" variant="text" startIcon={<LogoutIcon />} onClick={() => logout()}>
          Abmelden
        </Button>
      </Toolbar>
    </AppBar>
  );
}
