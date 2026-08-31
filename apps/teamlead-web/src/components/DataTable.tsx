/**
 * Generic dense table for teamlead surfaces (§12.2 TanStack Table/Virtualisierung,
 * Anhang E.6 "Filter, schnelle Tastaturbedienung und gespeicherte Views").
 *
 * Wraps @tanstack/react-table with sorting + global filter and optionally
 * row-virtualizes large pools via @tanstack/react-virtual. The table state is
 * lifted to the caller so it can be persisted as a saved view.
 */
import { useRef, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

/** Ein einzelnes sx-Objekt (kein Array) — das Element-Format des TableRow-sx-Arrays. */
type RowSx = Exclude<SxProps<Theme>, ReadonlyArray<unknown>>;

/**
 * Sprechender Spaltenname für Tooltip/aria-label. Nutzt die Kopf-Beschriftung, wenn
 * sie ein reiner Text ist (der Normalfall), sonst die Spalten-Id — ein gerenderter
 * React-Kopf lässt sich nicht in einen Satz einsetzen.
 */
export function columnLabel<T>(column: Column<T, unknown>): string {
  const header = column.columnDef.header;
  return typeof header === 'string' && header.length > 0 ? header : column.id;
}

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
  /**
   * Füll-Modus (Experiment-Pane/Vollbild): der Container nimmt die verfügbare
   * Höhe des Flex-Elters ein (flex:1, bis ganz unten) statt einer festen
   * maxHeight — Zeilen sind ebenfalls virtualisiert.
   */
  fillHeight?: boolean;
  rowHeight?: number;
  /**
   * Server mode: sorting/filtering/pagination happen on the backend — the table
   * renders `data` as-is and only REPORTS sorting intents via `onSortingChange`
   * (manualSorting/manualFiltering). Client mode (default) keeps the local
   * sorted/filtered row models for the other cockpit tables.
   */
  serverMode?: boolean;
  /**
   * Optionales Zeilen-Styling (z. B. Gruppen-Block-Markierung der Belege-Liste).
   * `index` ist die Position in der gerenderten Reihenfolge — bei serverMode
   * identisch mit der `data`-Reihenfolge.
   */
  getRowSx?: (row: T, index: number) => RowSx | undefined;
  /**
   * Rechtsklick auf eine Zeile (Kontextmenü). Der Aufrufer entscheidet, ob er das
   * Browser-Menü unterdrückt — die Tabelle reicht das Ereignis nur durch.
   */
  onRowContextMenu?: (row: T, event: ReactMouseEvent) => void;
  /**
   * Kompakte Dichte (Beleg-Liste): engere Zellen, kleinere Schrift, 20px-Chips —
   * damit alle Spalten ohne Horizontal-Scroll auf den Screen passen.
   */
  dense?: boolean;
  /**
   * Wenn gesetzt, trägt jeder ausblendbare Spaltenkopf ein eigenes Augen-Icon zum
   * Ausblenden (Kundenfeedback 07.08.2026). BEWUSST ein eigenes Bedienelement und
   * nicht der Kopf-Klick: der sortiert bereits — ein doppelt belegter Klick wäre
   * ein Bedienkonflikt. Wieder-Einblenden läuft über das „Spalten"-Menü des
   * Aufrufers, der auch den Zustand hält und persistiert.
   */
  onHideColumn?: (columnId: string) => void;
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
  fillHeight = false,
  rowHeight = 44,
  serverMode = false,
  getRowSx,
  onRowContextMenu,
  dense = false,
  onHideColumn,
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
  // Scroll-/Virtualisierungs-Modus: feste maxHeight ODER Füll-Modus (flex:1).
  const scrolls = maxHeight != null || fillHeight;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    enabled: scrolls,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = scrolls && virtualRows.length ? virtualRows[0]!.start : 0;
  const paddingBottom =
    scrolls && virtualRows.length
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
      : 0;
  const bodyRows = scrolls ? virtualRows.map((v) => rows[v.index]!) : rows;

  return (
    <Box
      ref={scrollRef}
      sx={[
        {
          ...(fillHeight ? { flex: 1, minHeight: 0 } : { maxHeight }),
          overflow: scrolls ? 'auto' : 'visible',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        },
        dense && {
          '& .MuiTableCell-root': { px: 0.75, py: 0.25, fontSize: '0.74rem' },
          '& .MuiTableCell-head': { py: 0.5, fontSize: '0.72rem' },
          '& .MuiChip-root': { height: 20, fontSize: '0.68rem' },
          '& .MuiChip-label': { px: 0.75 },
          // Aktionen-Zelle: Kebab/Buttons dürfen die Zeile nicht aufblähen.
          '& .MuiIconButton-root': { p: 0.25 },
          '& .MuiButton-root': { py: 0, minHeight: 24, fontSize: '0.68rem' },
        },
      ]}
    >
      <Table size="small" stickyHeader={scrolls}>
        <TableHead>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const hideable = onHideColumn !== undefined && header.column.getCanHide();
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
                    {hideable && (
                      <Tooltip title={`Spalte „${columnLabel(header.column)}" ausblenden`}>
                        <IconButton
                          size="small"
                          aria-label={`Spalte ${columnLabel(header.column)} ausblenden`}
                          onClick={() => onHideColumn(header.column.id)}
                          sx={{ ml: 0.25, opacity: 0.4, '&:hover': { opacity: 1 } }}
                        >
                          <VisibilityOffOutlinedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
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
              onContextMenu={
                onRowContextMenu ? (e) => onRowContextMenu(row.original, e) : undefined
              }
              sx={[
                { cursor: onRowClick ? 'pointer' : 'default' },
                getRowSx?.(row.original, row.index) ?? false,
              ]}
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
