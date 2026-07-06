/**
 * Generic dense table for teamlead surfaces (§12.2 TanStack Table/Virtualisierung,
 * Anhang E.6 "Filter, schnelle Tastaturbedienung und gespeicherte Views").
 *
 * Wraps @tanstack/react-table with sorting + global filter and optionally
 * row-virtualizes large pools via @tanstack/react-virtual. The table state is
 * lifted to the caller so it can be persisted as a saved view.
 */
import { useRef, type JSX } from 'react';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface DataTableProps<T> {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  globalFilter?: string;
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  columnVisibility?: VisibilityState;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  emptyText?: string;
  /** When set, the body scrolls within this height and rows are virtualized. */
  maxHeight?: number;
  rowHeight?: number;
  /**
   * Server mode: sorting/filtering/pagination happen on the backend — the table
   * renders `data` as-is and only REPORTS sorting intents via `onSortingChange`
   * (manualSorting/manualFiltering). Client mode (default) keeps the local
   * sorted/filtered row models for the other cockpit tables.
   */
  serverMode?: boolean;
}

export function DataTable<T>({
  data,
  columns,
  globalFilter,
  sorting,
  onSortingChange,
  columnVisibility,
  onRowClick,
  getRowId,
  emptyText = 'Keine Einträge.',
  maxHeight,
  rowHeight = 44,
  serverMode = false,
}: DataTableProps<T>): JSX.Element {
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, columnVisibility },
    onSortingChange: (updater) => {
      if (!onSortingChange) return;
      const next = typeof updater === 'function' ? updater(sorting ?? []) : updater;
      onSortingChange(next);
    },
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: serverMode,
    manualFiltering: serverMode,
    manualPagination: serverMode,
    ...(serverMode
      ? {}
      : {
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
        }),
    globalFilterFn: 'includesString',
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: maxHeight != null,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = maxHeight && virtualRows.length ? virtualRows[0]!.start : 0;
  const paddingBottom =
    maxHeight && virtualRows.length
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
      : 0;
  const bodyRows = maxHeight ? virtualRows.map((v) => rows[v.index]!) : rows;

  return (
    <Box
      ref={scrollRef}
      sx={{
        maxHeight,
        overflow: maxHeight ? 'auto' : 'visible',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
      }}
    >
      <Table size="small" stickyHeader={maxHeight != null}>
        <TableHead>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                return (
                  <TableCell
                    key={header.id}
                    sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' }}
                    sortDirection={header.column.getIsSorted() || false}
                  >
                    {canSort ? (
                      <TableSortLabel
                        active={Boolean(header.column.getIsSorted())}
                        direction={header.column.getIsSorted() === 'desc' ? 'desc' : 'asc'}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </TableSortLabel>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  {emptyText}
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {paddingTop > 0 && (
            <TableRow style={{ height: paddingTop }}>
              <TableCell colSpan={columns.length} sx={{ p: 0, border: 0 }} />
            </TableRow>
          )}
          {bodyRows.map((row) => (
            <TableRow
              key={row.id}
              hover
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} sx={{ whiteSpace: 'nowrap' }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {paddingBottom > 0 && (
            <TableRow style={{ height: paddingBottom }}>
              <TableCell colSpan={columns.length} sx={{ p: 0, border: 0 }} />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}
