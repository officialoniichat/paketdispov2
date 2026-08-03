/**
 * Der Profilkreis der Mitarbeiter-App — die frühere Kopfzeile (AppBar mit
 * Titel und Button-Leiste) ist ersatzlos entfallen, die Screens beginnen jetzt
 * direkt oben. Übrig bleibt der Avatar des angemeldeten Mitarbeiters in der
 * rechten oberen Ecke; alle Aktionen liegen in seinem Menü.
 *
 * Er liegt `fixed` über dem Inhalt (wie die Aktionsleiste in `StepScaffold`),
 * belegt also keine Layout-Höhe und bleibt beim Scrollen erreichbar — auf dem
 * Handy ist „Abmelden" damit von jedem Screen aus einen Tipp entfernt.
 *
 * `logout()` clears the session (`data/auth.ts` → `data/session.ts`), which
 * notifies `App.tsx` (subscribed via `onSessionCleared`) to fall back to
 * `LoginScreen` — the same mechanism a 401 session-expiry uses.
 */
import { useState, type JSX } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import LogoutIcon from '@mui/icons-material/Logout';
import { touchTarget } from '@paket/ui';
import { TEAMLEAD_APP_URL } from '../config/appLinks.js';
import { logout } from '../data/auth.js';
import { getSession } from '../data/session.js';

/** Abstand zur Ecke; auf installierten PWAs zusätzlich um den Notch versetzt. */
const INSET_TOP = 'calc(8px + env(safe-area-inset-top, 0px))';
const INSET_RIGHT = 'calc(8px + env(safe-area-inset-right, 0px))';

/**
 * MUI shrinks MenuItems to ~36 px from the `sm` breakpoint up — exactly the
 * case on the touchscreen monitors this app also runs on. Pin *both* breakpoints
 * to the theme's tap target (a single unconditional value loses to MUI's own
 * `sm`-and-up rule): these entries are finger targets at every width.
 */
const MENU_ITEM_SX = { minHeight: { xs: touchTarget.min, sm: touchTarget.min } } as const;

/** "Anna Müller" → "AM"; a single-word name yields its first letter alone. */
function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words.at(0) ?? '';
  const last = words.length > 1 ? (words.at(-1) ?? '') : '';
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}

export function ProfileMenu(): JSX.Element | null {
  const session = getSession();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  // Ohne Session (Login-Screen) erscheint gar nichts — kein leerer Kreis.
  if (!session) return null;

  return (
    <>
      <IconButton
        onClick={(event) => setMenuAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={menuAnchor !== null}
        aria-label={`Profil ${session.displayName}`}
        sx={{
          position: 'fixed',
          top: INSET_TOP,
          right: INSET_RIGHT,
          zIndex: (theme) => theme.zIndex.appBar,
          // Der Kreis schwebt über beliebigem Inhalt: eigener Grund + Schatten,
          // damit er auch über Tabellen und Karten ablesbar bleibt.
          p: 0.5,
          bgcolor: 'background.paper',
          boxShadow: 3,
          '&:hover': { bgcolor: 'background.paper' },
        }}
      >
        <Avatar
          sx={{
            width: 40,
            height: 40,
            fontSize: '0.9rem',
            fontWeight: 700,
            bgcolor: 'primary.main',
          }}
        >
          {initials(session.displayName)}
        </Avatar>
      </IconButton>

      <Menu
        anchorEl={menuAnchor}
        open={menuAnchor !== null}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {session.displayName}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Mitarbeiternummer {session.employeeNo}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          component="a"
          href={TEAMLEAD_APP_URL}
          onClick={() => setMenuAnchor(null)}
          sx={MENU_ITEM_SX}
        >
          <ListItemIcon>
            <DesktopWindowsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Zur Teamlead-App</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            logout();
          }}
          sx={MENU_ITEM_SX}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Abmelden</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
