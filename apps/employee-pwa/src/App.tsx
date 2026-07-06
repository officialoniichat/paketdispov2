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
import { AppHeader } from './components/AppHeader.js';
import { getSession, isSessionExpired, type Session } from './data/session.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { BundleHomeScreen } from './screens/BundleHomeScreen.js';
import { BelegProcessScreen } from './screens/BelegProcessScreen.js';
import { ProblemMeldenScreen } from './screens/ProblemMeldenScreen.js';

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

  if (!session) {
    return <LoginScreen onLoggedIn={setSessionState} />;
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <AppHeader />
      <Routes>
        <Route path="/" element={<BundleHomeScreen />} />
        <Route path="/case/:caseId" element={<BelegProcessScreen />} />
        <Route path="/case/:caseId/problem" element={<ProblemMeldenScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Box>
  );
}
