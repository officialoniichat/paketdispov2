/**
 * LocationMaster-Pflege (§11.2). A simple Lagerplatzliste with codes and an
 * optional manual sort order – no routing graph or meter data in the MVP.
 */
import { useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { LocationKind, LocationMaster } from '@paket/domain-types';
import { useCockpitData } from '../../data/store.js';

const KINDS: LocationKind[] = [
  'regal',
  'palette_a',
  'palette_b',
  'palette_c',
  'palette_e',
  'haengebahn',
  'lagerplatz_d',
  'workstation',
  'printer',
  'conveyor_packages',
  'conveyor_finished_goods',
];

export function LocationMasterEditor(): JSX.Element {
  const { dataset, setLocations } = useCockpitData();
  const [rows, setRows] = useState<LocationMaster[]>(dataset.locations);
  const [saved, setSaved] = useState(false);

  function update(id: string, patch: Partial<LocationMaster>): void {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function remove(id: string): void {
    setRows((rs) => rs.filter((r) => r.id !== id));
    setSaved(false);
  }

  function addRow(): void {
    const id = `loc-new-${rows.length + 1}`;
    setRows((rs) => [...rs, { id, code: '', displayName: '', kind: 'regal', active: true }]);
    setSaved(false);
  }

  function save(): void {
    setLocations(rows);
    setSaved(true);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Lagerplätze ({rows.length})</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addRow}>
          Neuer Lagerplatz
        </Button>
      </Stack>
      {saved && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaved(false)}>
          Lagerplätze gespeichert.
        </Alert>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Code</TableCell>
            <TableCell>Bezeichnung</TableCell>
            <TableCell>Art</TableCell>
            <TableCell>Zone</TableCell>
            <TableCell>Sortier-Index</TableCell>
            <TableCell>Aktiv</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <TextField
                  size="small"
                  variant="standard"
                  value={r.code}
                  onChange={(e) => update(r.id, { code: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  variant="standard"
                  value={r.displayName}
                  onChange={(e) => update(r.id, { displayName: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <TextField
                  select
                  size="small"
                  variant="standard"
                  value={r.kind}
                  onChange={(e) => update(r.id, { kind: e.target.value as LocationKind })}
                  sx={{ minWidth: 140 }}
                >
                  {KINDS.map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </TextField>
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  variant="standard"
                  value={r.zone ?? ''}
                  onChange={(e) => update(r.id, { zone: e.target.value || undefined })}
                />
              </TableCell>
              <TableCell>
                <TextField
                  type="number"
                  size="small"
                  variant="standard"
                  value={r.sequenceIndex ?? ''}
                  onChange={(e) =>
                    update(r.id, {
                      sequenceIndex: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  sx={{ width: 90 }}
                />
              </TableCell>
              <TableCell>
                <Switch
                  size="small"
                  checked={r.active}
                  onChange={(e) => update(r.id, { active: e.target.checked })}
                />
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  aria-label="Lagerplatz löschen"
                  onClick={() => remove(r.id)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="contained" sx={{ mt: 2 }} onClick={save}>
        Lagerplätze speichern
      </Button>
    </Paper>
  );
}
