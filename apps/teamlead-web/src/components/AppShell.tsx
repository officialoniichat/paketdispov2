/**
 * Teamlead cockpit shell: a persistent nav rail + top bar around the routed
 * surfaces (§10 Dashboard, §11 Admin). Denser than the Mitarbeiter-App but still
 * keyboard- and filter-friendly (Anhang E.6).
 */
import { Suspense, lazy, useState, type JSX } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import GroupsIcon from '@mui/icons-material/Groups';
import DescriptionIcon from '@mui/icons-material/Description';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import SettingsIcon from '@mui/icons-material/Settings';
import ScienceIcon from '@mui/icons-material/Science';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { ltColors } from '@paket/ui';
import { EMPLOYEE_APP_URL } from '../config/appLinks.js';
import { devPanelRuntimeEnabled } from '../config/devPanel.js';
import { NAV_VIEW_KEY, loadViewState, saveViewState } from '../lib/viewState.js';

/**
 * Dev-Panel gate (A1/A3): global time-override badge in the app bar. The
 * build-time expression MUST stay inline (Vite define + Rollup dead-code
 * elimination strip the lazy chunk from production builds); see
 * src/config/devPanel.ts and the identical gate in features/admin/AdminPage.tsx.
 */
const DEV_PANEL_BUILT: boolean =
  import.meta.env.VITE_DEV_PANEL === '0'
    ? false
    : import.meta.env.DEV || import.meta.env.VITE_DEV_PANEL === '1';

const DevTimeBadge = DEV_PANEL_BUILT ? lazy(() => import('./DevTimeBadge.js')) : null;
const showDevBadge = DevTimeBadge !== null && devPanelRuntimeEnabled();

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
  { to: '/aufteilungen', label: 'Aufteilungen', icon: <CallSplitIcon /> },
  { to: '/admin', label: 'Admin & Regeln', icon: <SettingsIcon /> },
  { to: '/experiment', label: 'Experiment DA.M.B', icon: <ScienceIcon /> },
];

const RAIL_WIDTH = 220;
/** Eingeklappte Rail: nur Icons, Links behalten ihren Namen via aria-label. */
const RAIL_WIDTH_COLLAPSED = 64;

/** Persistierter Shell-Zustand (Saved View): Sidebar ein-/ausgeklappt. */
interface NavViewState {
  collapsed: boolean;
}

export function AppShell(): JSX.Element {
  const [collapsed, setCollapsed] = useState<boolean>(
    // Optional-Chaining: ein gespeichertes JSON-`null` darf die Shell (und damit
    // ALLE Routen) nicht crashen — loadViewState prüft nur Parse-Fehler.
    () => loadViewState<Partial<NavViewState> | null>(NAV_VIEW_KEY, {})?.collapsed === true,
  );
  const toggleCollapsed = (): void => {
    setCollapsed((prev) => {
      saveViewState<NavViewState>(NAV_VIEW_KEY, { collapsed: !prev });
      return !prev;
    });
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="nav"
        aria-label="Hauptnavigation"
        sx={{
          width: collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH,
          transition: 'width 150ms ease',
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
        <Box sx={{ px: collapsed ? 1 : 2.5, py: 2.5, textAlign: collapsed ? 'center' : 'left' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
            {collapsed ? 'L&T' : 'L&T Cockpit'}
          </Typography>
          {!collapsed && (
            <Typography variant="caption" sx={{ opacity: 0.75 }}>
              Logistik Warenauszeichnung
            </Typography>
          )}
        </Box>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {NAV.map((item) => (
            <li key={item.to}>
              <Tooltip title={collapsed ? item.label : ''} placement="right">
                <NavLink
                  to={item.to}
                  end={item.end}
                  aria-label={item.label}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: collapsed ? 0 : 12,
                    padding: collapsed ? '12px 0' : '12px 20px',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? 'rgba(255,255,255,0.16)' : 'transparent',
                    borderLeft: isActive ? `4px solid ${ltColors.accent}` : '4px solid transparent',
                  })}
                >
                  {item.icon}
                  {!collapsed && item.label}
                </NavLink>
              </Tooltip>
            </li>
          ))}
        </Box>
        <Box sx={{ mt: 'auto', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', p: 1 }}>
          <IconButton
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}
            sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}
            size="small"
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
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
            {showDevBadge && DevTimeBadge !== null && (
              <Suspense fallback={null}>
                <DevTimeBadge />
              </Suspense>
            )}
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
