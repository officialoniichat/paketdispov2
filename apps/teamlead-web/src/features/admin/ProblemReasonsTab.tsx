/**
 * Problemarten-Katalog-Pflege (Kundenfeedback 14.07.2026, Punkt 5). Die
 * Problemarten sind frei definierbar und nachträglich editierbar; die
 * Mitarbeiter-App lädt die aktiven Gründe dynamisch.
 *
 * Geladen von / gespeichert nach `/api/admin/problem-reasons` (Replace-all-Upsert
 * wie der Lagerplatz-Master). Ein Grund, der noch von Problemmeldungen
 * referenziert wird, wird beim Entfernen nur deaktiviert statt gelöscht.
 */
import { useEffect, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
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
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  fetchProblemReasons,
  saveProblemReasons,
  type ProblemReasonRow,
} from '../../data/admin.js';

const REASONS_QUERY_KEY = ['admin', 'problem-reasons'] as const;

/** Re-sequences `sortOrder` to 10,20,30… so moved rows keep a stable order. */
function resequence(rows: ProblemReasonRow[]): ProblemReasonRow[] {
  return rows.map((r, idx) => ({ ...r, sortOrder: (idx + 1) * 10 }));
}

export function ProblemReasonsTab(): JSX.Element {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ProblemReasonRow[]>([]);

  const query = useQuery<ProblemReasonRow[], Error>({
    queryKey: REASONS_QUERY_KEY,
    queryFn: fetchProblemReasons,
  });

  useEffect(() => {
    if (query.data) setRows([...query.data].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [query.data]);

  const mutation = useMutation<ProblemReasonRow[], Error, ProblemReasonRow[]>({
    mutationFn: saveProblemReasons,
    onSuccess: (saved) => {
      queryClient.setQueryData(REASONS_QUERY_KEY, saved);
      // Auch der PWA-Katalog (aktive Gründe) ist damit veraltet.
      void queryClient.invalidateQueries({ queryKey: ['problem-reasons'] });
      setRows([...saved].sort((a, b) => a.sortOrder - b.sortOrder));
    },
  });

  const setLabel = (idx: number, label: string): void =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, label } : r)));
  const setActive = (idx: number, active: boolean): void =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, active } : r)));
  const remove = (idx: number): void =>
    setRows((rs) => resequence(rs.filter((_, i) => i !== idx)));
  const move = (idx: number, dir: -1 | 1): void =>
    setRows((rs) => {
      const to = idx + dir;
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item!);
      return resequence(next);
    });
  const add = (): void =>
    setRows((rs) => resequence([...rs, { label: '', active: true, sortOrder: 0 }]));

  const canSave = rows.every((r) => r.label.trim().length > 0);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Problemarten
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Frei definierbare Gründe, die der Mitarbeiter beim Melden eines Positions-Problems auswählen
        kann. Inaktive Gründe sind in der App nicht wählbar. Bereits gemeldete Probleme behalten
        ihren Grund-Text, auch wenn er später geändert wird.
      </Typography>

      {query.isLoading && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Problemarten werden geladen…
          </Typography>
        </Stack>
      )}
      {query.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Problemarten konnten nicht geladen werden: {query.error.message}
        </Alert>
      )}
      {mutation.isSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => mutation.reset()}>
          Problemarten gespeichert.
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
            <TableCell>Reihenfolge</TableCell>
            <TableCell>Bezeichnung</TableCell>
            <TableCell>Aktiv</TableCell>
            <TableCell align="right">Aktion</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, idx) => (
            <TableRow key={r.id ?? `new-${idx}`}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <IconButton size="small" aria-label="Nach oben" disabled={idx === 0} onClick={() => move(idx, -1)}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label="Nach unten"
                  disabled={idx === rows.length - 1}
                  onClick={() => move(idx, 1)}
                >
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </TableCell>
              <TableCell>
                <TextField
                  fullWidth
                  size="small"
                  value={r.label}
                  placeholder="Problemart"
                  error={r.label.trim().length === 0}
                  onChange={(e) => setLabel(idx, e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Switch checked={r.active} onChange={(e) => setActive(idx, e.target.checked)} />
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" aria-label="Entfernen" onClick={() => remove(idx)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && !query.isLoading && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography variant="body2" color="text.secondary">
                  Noch keine Problemarten. „Neue Problemart" anlegen.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button startIcon={<AddIcon />} onClick={add}>
          Neue Problemart
        </Button>
        <Button
          variant="contained"
          onClick={() => mutation.mutate(rows)}
          disabled={!canSave || mutation.isPending}
        >
          Speichern
        </Button>
      </Stack>
      {!canSave && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
          Jede Problemart braucht eine Bezeichnung.
        </Typography>
      )}
    </Paper>
  );
}
