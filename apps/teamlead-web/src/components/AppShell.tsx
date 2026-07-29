/**
 * Teamlead cockpit shell: a persistent, collapsible nav rail around the routed
 * surfaces (§10 Dashboard, §11 Admin). Bewusst OHNE Top-Bar — die Fläche gehört
 * den Inhalten; der Absprung zur Mitarbeiter-App ist ein Button in der Rail
 * unter dem letzten Reiter. Die Experiment-Route rendert randlos bis an die
 * Fenster-Kanten, alle übrigen Reiter behalten den gepolsterten Container.
 */
import { Suspense, lazy, useState, type JSX } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
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
 * Dev-Panel gate (A1/A3): global time-override badge, seit dem Wegfall der
 * Top-Bar als fixiertes Overlay oben rechts. The build-time expression MUST
 * stay inline (Vite define + Rollup dead-code elimination strip the lazy chunk
 * from production builds); see src/config/devPanel.ts and the identical gate in
 * features/admin/AdminPage.tsx.
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
  // Experiment DA.M.B will die volle Fläche: Fenster bis in die Bildschirm-Ecken.
  const fullBleed = useLocation().pathname.startsWith('/experiment');

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
        {/* Absprung zur Mitarbeiter-App: Button direkt unter „Experiment DA.M.B"
            (ersetzt die frühere Top-Bar samt „Teamlead-Dashboard"-Titel). */}
        <Box sx={{ px: collapsed ? 1 : 2, pt: 1.5 }}>
          <Tooltip title={collapsed ? 'Zur Mitarbeiter-App' : ''} placement="right">
            <Box
              component="a"
              href={EMPLOYEE_APP_URL}
              aria-label="Zur Mitarbeiter-App"
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                border: '1px solid rgba(255,255,255,0.45)',
                borderRadius: 1,
                color: '#fff',
                textDecoration: 'none',
                px: collapsed ? 0 : 1.25,
                py: 0.75,
                fontSize: '0.82rem',
                fontWeight: 600,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
              }}
            >
              <PhoneAndroidIcon fontSize="small" />
              {!collapsed && 'Zur Mitarbeiter-App'}
            </Box>
          </Tooltip>
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

      <Box
        sx={{
          flexGrow: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          ...(fullBleed ? { height: '100vh', overflow: 'hidden' } : {}),
        }}
      >
        {showDevBadge && DevTimeBadge !== null && (
          <Suspense fallback={null}>
            <Box
              sx={{ position: 'fixed', top: 8, right: 12, zIndex: (theme) => theme.zIndex.appBar }}
            >
              <DevTimeBadge />
            </Box>
          </Suspense>
        )}
        {fullBleed ? (
          <Outlet />
        ) : (
          <Container maxWidth={false} sx={{ py: 3, flexGrow: 1 }}>
            <Outlet />
          </Container>
        )}
      </Box>
    </Box>
  );
}
