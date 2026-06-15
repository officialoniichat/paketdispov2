/**
 * LocationMaster-Pflege (§11.2). A simple Lagerplatzliste with codes and an
 * optional manual sort order – no routing graph or meter data in the MVP.
 *
 * Loaded from / saved to the real backend (`/api/admin/locations`) via
 * {@link ../../data/admin}. Save replaces the whole list (upsert by code); a
 * location still referenced by a case is rejected by the backend with a 409,
 * surfaced here as an error alert.
 */
import { useEffect, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
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
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { LocationKind, LocationMaster } from '@paket/domain-types';
import { fetchLocations, saveLocations } from '../../data/admin.js';

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

const LOCATIONS_QUERY_KEY = ['admin', 'locations'] as const;

export function LocationMasterEditor(): JSX.Element {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<LocationMaster[]>([]);

  const query = useQuery<LocationMaster[], Error>({
    queryKey: LOCATIONS_QUERY_KEY,
    queryFn: fetchLocations,
  });

  // Seed the editable rows from the loaded list once it arrives (and on refetch).
  useEffect(() => {
    if (query.data) setRows(query.data);
  }, [query.data]);

  const mutation = useMutation<LocationMaster[], Error, LocationMaster[]>({
    mutationFn: saveLocations,
    onSuccess: (saved) => {
      queryClient.setQueryData(LOCATIONS_QUERY_KEY, saved);
      setRows(saved);
    },
  });

  function update(id: string, patch: Partial<LocationMaster>): void {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    mutation.reset();
  }

  function remove(id: string): void {
    setRows((rs) => rs.filter((r) => r.id !== id));
    mutation.reset();
  }

  function addRow(): void {
    setRows((rs) => [
      ...rs,
      { id: `loc-new-${rs.length + 1}`, code: '', displayName: '', kind: 'regal', active: true },
    ]);
    mutation.reset();
  }

  function save(): void {
    mutation.mutate(rows);
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Lagerplätze ({rows.length})</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addRow}>
          Neuer Lagerplatz
        </Button>
      </Stack>

      {query.isLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Lagerplätze werden geladen…
          </Typography>
        </Stack>
      )}
      {query.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Lagerplätze konnten nicht geladen werden: {query.error.message}
        </Alert>
      )}
      {mutation.isSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => mutation.reset()}>
          Lagerplätze gespeichert.
        </Alert>
      )}
      {mutation.error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => mutation.reset()}>
          Speichern fehlgeschlagen: {mutation.error.message}
        </Alert>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Code</TableCell>
            <TableCell>Bezeichnung</TableCell>
            <TableCell>Art</TableCell>
            <TableCell>Zone</TableCell>
            <TableCell>
              <Stack component="span" direction="row" spacing={0.5} alignItems="center" useFlexGap>
                <span>Sortier-Index</span>
                <Tooltip
                  title="Reihenfolge innerhalb der Zone beim Abfahren (kleiner = früher)."
                  arrow
                  enterTouchDelay={0}
                >
                  <InfoOutlinedIcon
                    fontSize="inherit"
                    color="action"
                    sx={{ cursor: 'help', fontSize: '1rem', verticalAlign: 'middle', opacity: 0.7 }}
                  />
                </Tooltip>
              </Stack>
            </TableCell>
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
      <Button variant="contained" sx={{ mt: 2 }} onClick={save} disabled={mutation.isPending}>
        Lagerplätze speichern
      </Button>
    </Paper>
  );
}
