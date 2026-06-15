import type { JSX, ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ltTheme } from './theme.js';

export interface LtThemeProviderProps {
  children: ReactNode;
}

/** Applies the L&T MUI theme + CSS baseline. Wrap each app root once. */
export function LtThemeProvider({ children }: LtThemeProviderProps): JSX.Element {
  return (
    <ThemeProvider theme={ltTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
