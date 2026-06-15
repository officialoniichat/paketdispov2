/**
 * Beleg-Liste (§10.4 list view): the full pool in a dense, filterable,
 * virtualizable TanStack Table with saved views (§12.2 / Anhang E.6). Row click
 * opens the Belegdetails.
 */
import { useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { CaseStatusChip, PriorityChip } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import { formatMinutes } from '../../lib/format.js';
import { DataTable } from '../../components/DataTable.js';
import { SavedViews } from '../../components/SavedViews.js';
import type { SavedViewState } from '../../data/savedViews.js';

interface BelegRow {
  id: string;
  weBelegNo: string;
  status: string;
  section: string;
  goodsType: string;
  quantity: number;
  effortPoints: number;
  minutes: number;
  storageCode: string;
  assignedTo: string;
}

export function BelegListPage(): JSX.Element {
  const { dataset } = useCockpitData();
  const navigate = useNavigate();
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const rows: BelegRow[] = useMemo(
    () =>
      dataset.cases.map((c) => {
        const bundle = dataset.bundles.find((b) => b.caseIds.includes(c.id));
        const emp = bundle && dataset.employees.find((e) => e.id === bundle.employeeId);
        return {
          id: c.id,
          weBelegNo: c.weBelegNo,
          status: c.status,
          section: c.section === null ? '–' : String(c.section),
          goodsType: c.goodsTypeText ?? '–',
          quantity: c.totalQuantity,
          effortPoints: c.effortPoints,
          minutes: c.estimatedMinutes,
          storageCode: c.storageLocation.code,
          assignedTo: emp?.displayName ?? '–',
        };
      }),
    [dataset],
  );

  const columns = useMemo<ColumnDef<BelegRow>[]>(
    () => [
      { accessorKey: 'weBelegNo', header: 'WE-Beleg' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (ctx) => <CaseStatusChip status={ctx.getValue() as never} size="small" />,
      },
      { accessorKey: 'section', header: 'Abschnitt' },
      { accessorKey: 'goodsType', header: 'Warenart' },
      {
        id: 'prio',
        header: 'Prio',
        enableSorting: false,
        cell: (ctx) => {
          const c = dataset.cases.find((x) => x.id === ctx.row.original.id);
          return (
            <Stack direction="row" gap={0.5}>
              {c?.priorityFlags.map((f) => (
                <PriorityChip key={f} flag={f} size="small" />
              ))}
            </Stack>
          );
        },
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
    [dataset.cases],
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
    </Stack>
  );
}
