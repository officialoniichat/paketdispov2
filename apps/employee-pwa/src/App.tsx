/**
 * Mitarbeiter-App router shell. Gates on a real employee session (see
 * `data/session.ts`/`data/auth.ts`): unauthenticated or expired sessions see
 * the `LoginScreen`; otherwise the one-screen bundle flow is routed — hub
 * (Ware holen + Bearbeiten) → Beleg → problem. Navigation is flat (§E.6);
 * back-navigation lives in the screens. Per-screen data loading (React Query)
 * replaces the former app-level bootstrap effect.
 */
import { useEffect, useState, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Box from '@mui/material/Box';
import { EinladungOverlay } from './components/EinladungOverlay.js';
import { NachrichtenBanner } from './components/NachrichtenBanner.js';
import { ProfileMenu } from './components/ProfileMenu.js';
import { OnScreenKeyboard } from './components/OnScreenKeyboard.js';
import { getSession, isSessionExpired, onSessionCleared, type Session } from './data/session.js';
import { useFocusRefresh } from './data/useFocusRefresh.js';
import { useLiveUpdates } from './data/useLiveUpdates.js';
import { NACHRICHTEN } from './routes/paths.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { BundleHomeScreen } from './screens/BundleHomeScreen.js';
import { BelegProcessScreen } from './screens/BelegProcessScreen.js';
import { NachrichtenScreen } from './screens/NachrichtenScreen.js';

export function App(): JSX.Element {
  const [session, setSessionState] = useState<Session | null>(() => {
    const existing = getSession();
    return existing && !isSessionExpired(existing) ? existing : null;
  });

  useEffect(() => {
    if (session && isSessionExpired(session)) {
      setSessionState(null);
    }
  }, [session]);

  // Session-cleared can originate from anywhere: an explicit logout
  // (ProfileMenu → data/auth.ts) or a 401 caught by data/apiErrorHandling.ts and
  // surfaced through the React Query cache (data/queryClient.ts). Either way,
  // fall back to LoginScreen.
  useEffect(() => onSessionCleared(() => setSessionState(null)), []);

  // Refresh the day's assignment whenever the app regains focus (cheap,
  // offline-safe stand-in for a future push channel — see useFocusRefresh.ts).
  useFocusRefresh();

  // Live push channel: SSE subscription against /api/me/stream. No-ops until
  // a session exists (see useLiveUpdates.ts), so it is safe to call
  // unconditionally here alongside the other top-level hooks.
  useLiveUpdates();

  if (!session) {
    return (
      <>
        <LoginScreen onLoggedIn={setSessionState} />
        <OnScreenKeyboard />
      </>
    );
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      {/* Keine Kopfzeile: nur der Profilkreis, fixiert über der rechten oberen Ecke. */}
      <ProfileMenu />
      {/* Teamlead-Nachricht (z. B. Vorverteilungs-Eingriff): anzeigen + quittieren. */}
      <NachrichtenBanner />
      {/* Einladung zum geteilten Beleg (31.08.2026): bleibt stehen, bis der
          Mitarbeiter mit Haken/Kreuz reagiert — auf jedem Screen sichtbar. */}
      <EinladungOverlay />

      <Routes>
        <Route path="/" element={<BundleHomeScreen />} />
        <Route path="/case/:caseId" element={<BelegProcessScreen />} />
        <Route path={NACHRICHTEN} element={<NachrichtenScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {/* Punkt 1: aufklappbare digitale Tastatur für Touchscreen-Monitore. */}
      <OnScreenKeyboard />
    </Box>
  );
}
