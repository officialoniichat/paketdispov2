/**
 * MUI theme for the L&T design system (§12.2 "MUI mit L&T Theme").
 *
 * Encodes the warehouse-first defaults from Anhang E.3/E.6: large tap targets,
 * comfortable spacing, high-contrast surfaces, no hairline controls.
 */
import { createTheme, type Theme } from '@mui/material/styles';
import { ltColors, spacing, touchTarget } from './tokens.js';

export const ltTheme: Theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: ltColors.brand, light: ltColors.brandLight, contrastText: '#ffffff' },
    secondary: { main: ltColors.accent, contrastText: ltColors.textPrimary },
    error: { main: ltColors.danger },
    warning: { main: ltColors.warning },
    success: { main: ltColors.success },
    info: { main: ltColors.info },
    background: { default: ltColors.surface, paper: ltColors.surfaceRaised },
    text: { primary: ltColors.textPrimary, secondary: ltColors.textSecondary },
    divider: ltColors.border,
  },
  shape: { borderRadius: 12 },
  spacing: spacing.sm,
  typography: {
    fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
    button: { textTransform: 'none', fontWeight: 700, fontSize: '1rem' },
    h1: { fontSize: '1.75rem', fontWeight: 700 },
    h2: { fontSize: '1.4rem', fontWeight: 700 },
    body1: { fontSize: '1rem' },
  },
  components: {
    // MUI's built-in strings default to English; the UI language is German (§12.2).
    MuiAlert: {
      defaultProps: { closeText: 'Schließen' },
    },
    MuiButton: {
      defaultProps: { variant: 'contained', disableElevation: true },
      styleOverrides: {
        root: { minHeight: touchTarget.min, paddingInline: spacing.md, borderRadius: 12 },
        sizeLarge: { minHeight: touchTarget.primary, fontSize: '1.15rem' },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 700 } },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true, variant: 'outlined' },
    },
  },
});
