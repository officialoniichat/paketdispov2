/**
 * Beleg-Liste (§10.4 list view): the full operational pool from the live backend
 * (`GET /api/teamlead/cases`) in a dense, filterable, virtualizable TanStack
 * Table with saved views (§12.2 / Anhang E.6). Filtering/sorting/saved-views stay
 * client-side (pilot scale: one page of 200). Row click opens the Belegdetails.
 */
import { useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { CaseStatusChip, PriorityChip } from '@paket/ui';
import { fetchBelegeList, type BelegRow } from '../../data/belege.js';
import { formatMinutes } from '../../lib/format.js';
import { DataTable } from '../../components/DataTable.js';
import { SavedViews } from '../../components/SavedViews.js';
import type { SavedViewState } from '../../data/savedViews.js';

export function BelegListPage(): JSX.Element {
  const navigate = useNavigate();
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const query = useQuery<BelegRow[], Error>({
    queryKey: ['belege'],
    queryFn: fetchBelegeList,
  });
  const rows = query.data ?? [];

  const columns = useMemo<ColumnDef<BelegRow>[]>(
    () => [
      { accessorKey: 'weBelegNo', header: 'WE-Beleg' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (ctx) => <CaseStatusChip status={ctx.row.original.status} size="small" />,
      },
      {
        accessorKey: 'section',
        header: 'Abschnitt',
        cell: (ctx) => {
          const section = ctx.row.original.section;
          return section === null ? '–' : String(section);
        },
      },
      { accessorKey: 'goodsType', header: 'Warenart' },
      {
        id: 'prio',
        header: 'Prio',
        enableSorting: false,
        cell: (ctx) => (
          <Stack direction="row" gap={0.5}>
            {ctx.row.original.priorityFlags.map((f) => (
              <PriorityChip key={f} flag={f} size="small" />
            ))}
          </Stack>
        ),
      },
      { accessorKey: 'quantity', header: 'Menge' },
      { accessorKey: 'effortPoints', header: 'Punkte' },
      {
        accessorKey: 'minutes',
        header: 'Aufwand',
        cell: (ctx) => formatMinutes(ctx.getValue() as number),
      },
      { accessorKey: 'storageCode', header: 'Lagerplatz' },
      { accessorKey: 'assignedTo', header: 'Zugeteilt' },
    ],
    [],
  );

  const currentViewState: SavedViewState = { globalFilter, sorting };

  function applyView(state: SavedViewState): void {
    setGlobalFilter(typeof state.globalFilter === 'string' ? state.globalFilter : '');
    setSorting(Array.isArray(state.sorting) ? (state.sorting as SortingState) : []);
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        Belege ({rows.length})
      </Typography>

      {query.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void query.refetch()}>
              Erneut laden
            </Button>
          }
        >
          Belege konnten nicht geladen werden: {query.error.message}
        </Alert>
      )}

      <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center">
        <TextField
          size="small"
          label="Filter (WE-Nr, Status, Lagerplatz …)"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        <SavedViews scope="belege" currentState={currentViewState} onApply={applyView} />
      </Stack>

      {query.isLoading ? (
        <Stack spacing={1}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={44} />
          ))}
        </Stack>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          globalFilter={globalFilter}
          sorting={sorting}
          onSortingChange={setSorting}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/belege/${r.id}`)}
          maxHeight={560}
          emptyText="Keine Belege für diesen Filter."
        />
      )}
    </Stack>
  );
}
