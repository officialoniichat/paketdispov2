/**
 * Teamlead cockpit shell: a persistent nav rail + top bar around the routed
 * surfaces (§10 Dashboard, §11 Admin). Denser than the Mitarbeiter-App but still
 * keyboard- and filter-friendly (Anhang E.6).
 */
import type { JSX } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import GroupsIcon from '@mui/icons-material/Groups';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import { ltColors } from '@paket/ui';
import { EMPLOYEE_APP_URL } from '../config/appLinks.js';

interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Tagescockpit', icon: <DashboardIcon />, end: true },
  { to: '/ablagen', label: 'Digitale Ablagen', icon: <ViewKanbanIcon /> },
  { to: '/board', label: 'Mitarbeiterboard', icon: <GroupsIcon /> },
  { to: '/belege', label: 'Belege', icon: <DescriptionIcon /> },
  { to: '/admin', label: 'Admin & Regeln', icon: <SettingsIcon /> },
];

const RAIL_WIDTH = 220;

export function AppShell(): JSX.Element {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="nav"
        aria-label="Hauptnavigation"
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          bgcolor: ltColors.brand,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <Box sx={{ px: 2.5, py: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
            L&amp;T Cockpit
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.75 }}>
            Logistik Warenauszeichnung
          </Typography>
        </Box>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 20px',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? 'rgba(255,255,255,0.16)' : 'transparent',
                  borderLeft: isActive ? `4px solid ${ltColors.accent}` : '4px solid transparent',
                })}
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          color="default"
          elevation={0}
          sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Toolbar variant="dense">
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Teamlead-Dashboard
            </Typography>
            <Button
              component="a"
              href={EMPLOYEE_APP_URL}
              size="small"
              variant="outlined"
              startIcon={<PhoneAndroidIcon />}
              sx={{ ml: 'auto' }}
            >
              Zur Mitarbeiter-App
            </Button>
          </Toolbar>
        </AppBar>
        <Container maxWidth={false} sx={{ py: 3, flexGrow: 1 }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
