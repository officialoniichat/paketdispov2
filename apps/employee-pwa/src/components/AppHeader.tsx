/**
 * Slim, always-visible top bar for the Mitarbeiter-App. The bar carries no
 * title and no permanent buttons: its only control is the signed-in employee's
 * profile on the right, and every action hangs in that profile's menu — the
 * cross-app switch ("Zur Teamlead-App") and "Abmelden". That keeps the header
 * of a phone-sized screen free for the work below it.
 *
 * The Toolbar stays `dense` even though it now holds a single control, so the
 * bar's height — and with it the content offset underneath — is unchanged.
 *
 * `logout()` clears the session (`data/auth.ts` → `data/session.ts`), which
 * notifies `App.tsx` (subscribed via `onSessionCleared`) to fall back to
 * `LoginScreen` — the same mechanism a 401 session-expiry uses.
 */
import { useState, type JSX } from 'react';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import LogoutIcon from '@mui/icons-material/Logout';
import { touchTarget } from '@paket/ui';
import { TEAMLEAD_APP_URL } from '../config/appLinks.js';
import { logout } from '../data/auth.js';
import { getSession } from '../data/session.js';

/** Under this viewport width only the avatar remains — the name would crowd the bar. */
const NAME_HIDDEN_BELOW_PX = 360;

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

export function AppHeader(): JSX.Element {
  const session = getSession();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={0}
      sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
    >
      {/* Ohne Session (Login) bleibt die Leiste bewusst leer — kein leerer Avatar. */}
      <Toolbar variant="dense" sx={{ justifyContent: 'flex-end' }}>
        {session && (
          <>
            <Button
              variant="text"
              color="inherit"
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              aria-haspopup="menu"
              aria-expanded={menuAnchor !== null}
              aria-label={`Profil ${session.displayName}`}
              sx={{ gap: 1, px: 1, minWidth: 0, maxWidth: '70vw' }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  bgcolor: 'primary.main',
                }}
              >
                {initials(session.displayName)}
              </Avatar>
              <Box
                component="span"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  [`@media (max-width:${NAME_HIDDEN_BELOW_PX - 0.05}px)`]: { display: 'none' },
                }}
              >
                {session.displayName}
              </Box>
            </Button>

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
        )}
      </Toolbar>
    </AppBar>
  );
}
