/**
 * Slim, always-visible top bar for the Mitarbeiter-App. Mirrors the Teamlead
 * cockpit's AppBar and carries the cross-app switch link ("Zur Teamlead-App"),
 * so users can move between the two frontends without editing the URL/port.
 */
import type { JSX } from 'react';
import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import { TEAMLEAD_APP_URL } from '../config/appLinks.js';

export function AppHeader(): JSX.Element {
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
        <Button
          component="a"
          href={TEAMLEAD_APP_URL}
          size="small"
          variant="outlined"
          startIcon={<DesktopWindowsIcon />}
        >
          Zur Teamlead-App
        </Button>
      </Toolbar>
    </AppBar>
  );
}
