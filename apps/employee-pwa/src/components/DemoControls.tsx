/**
 * Offline-demo controls: switch the active Belegset (demo scenario) and reset
 * the local data. Only rendered in demo mode (no backend). Picking a scenario or
 * hitting "Zurücksetzen" wipes Dexie and reseeds; the live queries refresh the
 * home view automatically.
 */
import { useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DEMO_SCENARIOS } from '../demo/scenarios.js';
import { getSelectedScenarioId, resetToScenario } from '../db/seed.js';

export function DemoControls(): JSX.Element {
  const [scenarioId, setScenarioId] = useState<string>(() => getSelectedScenarioId());
  const [busy, setBusy] = useState(false);

  const apply = async (id: string): Promise<void> => {
    setScenarioId(id);
    setBusy(true);
    try {
      await resetToScenario(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderStyle: 'dashed' }}>
      <Typography variant="overline" color="text.secondary">
        Demo · Belegset
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          select
          size="small"
          label="Szenario"
          value={scenarioId}
          onChange={(e) => void apply(e.target.value)}
          disabled={busy}
          sx={{ flex: 1 }}
        >
          {DEMO_SCENARIOS.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() => void apply(scenarioId)}
        >
          Zurücksetzen
        </Button>
      </Stack>
    </Paper>
  );
}
