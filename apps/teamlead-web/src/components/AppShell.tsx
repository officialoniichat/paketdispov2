/**
 * Teamlead cockpit shell: a persistent, collapsible nav rail around the routed
 * surfaces (§10 Dashboard, §11 Admin). Bewusst OHNE Top-Bar — die Fläche gehört
 * den Inhalten; der Absprung zur Mitarbeiter-App ist ein Button in der Rail
 * unter der Navigation.
 *
 * Sichtbarer Haupteintrag der Rail ist „DA.M.B" (Route /experiment, rendert
 * randlos bis an die Fenster-Kanten). Die fünf Reiter (Tagescockpit … Admin &
 * Regeln) hängen als aus-/einklappbare Gruppe darunter: eingeklappt sind sie
 * komplett unsichtbar, ausgeklappt behalten sie den gepolsterten Container.
 * Klick auf „DA.M.B" navigiert, der Pfeil daneben klappt nur die Gruppe — zwei
 * getrennte Bedienelemente, nichts Verschachteltes. Das gilt breit wie schmal:
 * schmal zeigt die Gruppe dieselben Reiter als Icons (Name via aria-label +
 * Tooltip), der Pfeil sitzt rechts neben dem DA.M.B-Icon.
 */
import { Suspense, lazy, useEffect, useState, type JSX } from 'react';
import { NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import GroupsIcon from '@mui/icons-material/Groups';
import DescriptionIcon from '@mui/icons-material/Description';
import SettingsIcon from '@mui/icons-material/Settings';
import ScienceIcon from '@mui/icons-material/Science';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { ltColors } from '@paket/ui';
import { EMPLOYEE_APP_URL } from '../config/appLinks.js';
import { devPanelRuntimeEnabled } from '../config/devPanel.js';
import { SchnellaktionenFlyout } from '../features/cockpit/SchnellaktionenFlyout.js';
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

/** Haupteintrag der Rail — immer sichtbar; Klick navigiert. */
const DAMB: NavItem = { to: '/experiment', label: 'DA.M.B', icon: <ScienceIcon /> };

/** Reiter der DA.M.B-Gruppe — nur im ausgeklappten Zustand sichtbar. */
const DAMB_REITER: NavItem[] = [
  { to: '/', label: 'Tagescockpit', icon: <DashboardIcon />, end: true },
  { to: '/ablagen', label: 'Digitale Ablagen', icon: <ViewKanbanIcon /> },
  { to: '/board', label: 'Mitarbeiterboard', icon: <GroupsIcon /> },
  { to: '/belege', label: 'Belege', icon: <DescriptionIcon /> },
  { to: '/admin', label: 'Admin & Regeln', icon: <SettingsIcon /> },
];

/** Pfad des Reiters, auf dem man sich befindet (Belegdetails zählen zu „Belege"); null im DA.M.B. */
function aktiverReiterPfad(pathname: string): string | null {
  const reiter = DAMB_REITER.find(
    (item) => matchPath({ path: item.to, end: item.end === true }, pathname) !== null,
  );
  return reiter?.to ?? null;
}

const RAIL_WIDTH = 220;
/** Eingeklappte Rail: nur Icons, Links behalten ihren Namen via aria-label. */
const RAIL_WIDTH_COLLAPSED = 64;
/** Höhe der DA.M.B-Zeile (12px Polster + 24px Icon + 12px) — der Pfeil sitzt mittig darin. */
const ROW_HEIGHT = 48;

/** Persistierter Shell-Zustand (Saved View): schmale Rail + offene DA.M.B-Gruppe. */
interface NavViewState {
  collapsed: boolean;
  reiterOffen: boolean;
}

/** Gespeicherter Zustand; auf einem Reiter startet die Gruppe immer offen. */
function initialNavState(aufReiter: boolean): NavViewState {
  // Optional-Chaining: ein gespeichertes JSON-`null` darf die Shell (und damit
  // ALLE Routen) nicht crashen — loadViewState prüft nur Parse-Fehler.
  const saved = loadViewState<Partial<NavViewState> | null>(NAV_VIEW_KEY, {});
  return {
    collapsed: saved?.collapsed === true,
    reiterOffen: aufReiter || saved?.reiterOffen === true,
  };
}

interface RailLinkProps {
  item: NavItem;
  collapsed: boolean;
  /** Reiter der DA.M.B-Gruppe: eingerückt (breit) bzw. kleineres Icon (schmal). */
  reiter?: boolean;
}

/** Polster eines Rail-Links; der Haupteintrag hält rechts Platz für den Ausklapp-Pfeil. */
function railPadding(collapsed: boolean, reiter: boolean): string {
  const y = reiter ? 8 : 12;
  if (collapsed) return reiter ? `${y}px 0` : `${y}px 24px ${y}px 0`;
  return reiter ? `${y}px 20px ${y}px 40px` : `${y}px 44px ${y}px 20px`;
}

/** Ein Nav-Link der Rail; schmal nur das Icon, der Name bleibt als aria-label + Tooltip. */
function RailLink({ item, collapsed, reiter = false }: RailLinkProps): JSX.Element {
  return (
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
          padding: railPadding(collapsed, reiter),
          color: '#fff',
          textDecoration: 'none',
          fontSize: reiter ? '0.9rem' : undefined,
          fontWeight: isActive ? 700 : 500,
          background: isActive ? 'rgba(255,255,255,0.16)' : 'transparent',
          borderLeft: isActive ? `4px solid ${ltColors.accent}` : '4px solid transparent',
        })}
      >
        <Box component="span" sx={{ display: 'flex', '& > svg': { fontSize: reiter ? 20 : 24 } }}>
          {item.icon}
        </Box>
        {!collapsed && item.label}
      </NavLink>
    </Tooltip>
  );
}

export function AppShell(): JSX.Element {
  const { pathname } = useLocation();
  const reiterPfad = aktiverReiterPfad(pathname);
  const [nav, setNav] = useState<NavViewState>(() => initialNavState(reiterPfad !== null));
  const { collapsed, reiterOffen } = nav;
  // Saved View: jede Änderung landet im localStorage — auch das automatische Aufklappen.
  useEffect(() => saveViewState<NavViewState>(NAV_VIEW_KEY, nav), [nav]);
  // Wechsel AUF einen Reiter (auch aus dem DA.M.B heraus, z. B. Belegdetails aus
  // der Matrix) klappt die Gruppe auf, damit der aktive Reiter sichtbar ist.
  // Belegliste ↔ Belegdetails ist kein Reiterwechsel; Einklappen bleibt danach
  // jederzeit möglich, und der Sprung ins DA.M.B lässt die Gruppe unangetastet.
  useEffect(() => {
    if (reiterPfad !== null)
      setNav((prev) => (prev.reiterOffen ? prev : { ...prev, reiterOffen: true }));
  }, [reiterPfad]);
  const toggleCollapsed = (): void => setNav((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  const toggleReiter = (): void => setNav((prev) => ({ ...prev, reiterOffen: !prev.reiterOffen }));
  const reiterLabel = reiterOffen ? 'Reiter einklappen' : 'Reiter ausklappen';
  // DA.M.B will die volle Fläche: Fenster bis in die Bildschirm-Ecken.
  const fullBleed = pathname.startsWith('/experiment');
  // Schnellaktionen-Popout: die Rail (sticky = eigener Stacking-Context) liegt
  // im Ruhezustand auf appBar-Höhe, damit der herausragende Trapez-Knopf nie
  // vom Seiteninhalt überdeckt wird (Dialog-Backdrops dimmen sie weiterhin);
  // GEÖFFNET hebt sie sich über ALLE Ebenen (inkl. Tooltips) — nichts darf das
  // Panel überlappen.
  const [schnellaktionenOffen, setSchnellaktionenOffen] = useState(false);

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
          zIndex: (t) => (schnellaktionenOffen ? t.zIndex.tooltip + 1 : t.zIndex.appBar),
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
          <Box component="li" sx={{ position: 'relative' }}>
            <RailLink item={DAMB} collapsed={collapsed} />
            {/* Eigener Pfeil-Knopf neben dem Link: klappt NUR die Gruppe, navigiert nie. */}
            <Tooltip title={reiterLabel} placement="right">
              <IconButton
                size="small"
                onClick={toggleReiter}
                aria-label={reiterLabel}
                aria-expanded={reiterOffen}
                sx={{
                  position: 'absolute',
                  top: (ROW_HEIGHT - 24) / 2,
                  right: collapsed ? 4 : 8,
                  p: 0.25,
                  color: '#fff',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                }}
              >
                {reiterOffen ? (
                  <ExpandLessIcon sx={{ fontSize: 20 }} />
                ) : (
                  <ExpandMoreIcon sx={{ fontSize: 20 }} />
                )}
              </IconButton>
            </Tooltip>
            {/* unmountOnExit: eingeklappt existieren die Reiter nicht — weder sichtbar noch per Tab. */}
            <Collapse in={reiterOffen} timeout={150} unmountOnExit>
              <Box
                component="ul"
                aria-label="DA.M.B-Reiter"
                sx={{ listStyle: 'none', m: 0, p: 0, py: 0.5, bgcolor: 'rgba(0,0,0,0.18)' }}
              >
                {DAMB_REITER.map((item) => (
                  <li key={item.to}>
                    <RailLink item={item} collapsed={collapsed} reiter />
                  </li>
                ))}
              </Box>
            </Collapse>
          </Box>
        </Box>
        {/* Absprung zur Mitarbeiter-App: Button direkt unter der Navigation
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
        <Box
          sx={{
            mt: 'auto',
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
            p: 1,
          }}
        >
          <IconButton
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'}
            sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}
            size="small"
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Box>
        {/* Trapez-Ausklapper (Außenkante, vertikale Mitte): zweite Sidebar mit
            den Schnellaktionen des Tagescockpits — rot, sobald Meldungen da sind. */}
        <SchnellaktionenFlyout onOpenChange={setSchnellaktionenOffen} />
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
