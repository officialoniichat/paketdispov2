/** L&T theme tokens. Colour is always paired with text/icon, never colour alone (E.6). */
export const statusColor: Record<string, string> = {
  needs_review: '#b26a00',
  ready: '#1f7a1f',
  parked: '#6b6b6b',
  assigned: '#1565c0',
  issue_open: '#c62828',
  completed: '#2e7d32',
  zst_done: '#00695c',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
