/**
 * Beleg-Liste (§10.4, A1–A7): the full case population, SERVER-driven — scope,
 * per-column filters, sorting and pagination are query params of
 * `GET /api/teamlead/cases`; the client renders exactly one page of 50.
 *
 * Scopes: Aktiv | Abgeschlossen | Archiv (completed+zst_done, mit Abschlussdatum
 * + DocuWare-Link, A6) | Topf (Aufmerksamkeit/blocked/needs_review, A7) | Alle.
 * Row click opens the Belegdetails; „Zuweisen" opens the A4 assign dialog.
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { CaseStatus } from '@paket/domain-types';
import { CaseStatusChip, PriorityChip } from '@paket/ui';
import {
  BELEGE_PAGE_LIMIT,
  casePhase,
  fetchBelegeList,
  PHASE_LABEL,
  releaseIntake,
  unflagAttention,
  type BelegeFilters,
  type BelegeListResult,
  type BelegeScope,
  type BelegeSortField,
  type BelegeViewState,
  type BelegRow,
} from '../../data/belege.js';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { DataTable } from '../../components/DataTable.js';
import { LieferungChip } from '../../components/LieferungChip.js';
import { CaseActions } from '../../components/CaseActions.js';
import type { CaseActionCtx } from '../../actions/caseActions.js';
import { useCockpitData } from '../../data/store.js';
import { fetchEmployees } from '../../data/employees.js';
import { useSplits } from '../split/SplitProvider.js';
import { SplitDialog, type SplitDialogBeleg, type SplitDialogEmployee } from '../split/SplitDialog.js';
import { AssignFromListDialog } from './AssignFromListDialog.js';

const SCOPES: BelegeScope[] = ['aktiv', 'abgeschlossen', 'archiv', 'topf', 'alle'];

const SCOPE_LABEL: Record<BelegeScope, string> = {
  aktiv: 'Aktiv',
  abgeschlossen: 'Abgeschlossen',
  archiv: 'Archiv',
  topf: 'Topf',
  alle: 'Alle',
};

/** Statuses offered in the column filter (all §7.1 states). */
const STATUS_OPTIONS: CaseStatus[] = [
  'needs_review',
  'blocked',
  'ready',
  'parked',
  'assigned',
  'in_progress',
  'issue_open',
  'partially_completed',
  'completed',
  'zst_done',
  'cancelled',
];

const SECTION_OPTIONS = [1, 2, 3, 4, 7, 8] as const;

/** Column ids that ARE server sort fields — everything else is unsortable. */
const SORTABLE_COLUMNS = new Set<BelegeSortField>([
  'weBelegNo',
  'bookingDate',
  'totalQuantity',
  'effortPoints',
  'status',
  'section',
  'branchNo',
  'primaryShopNo',
  'completedAt',
]);

/** Debounce a value (text filters → one server query per pause, not per keypress). */
function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export function BelegListPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<BelegeScope>('aktiv');
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filters, setFilters] = useState<BelegeFilters>({});
  const debouncedFilters = useDebounced(filters);

  /** Every filter change restarts on page 1 — a filtered page 4 makes no sense. */
  const updateFilters = (patch: Partial<BelegeFilters>): void => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const sortBy =
    sorting[0] && SORTABLE_COLUMNS.has(sorting[0].id as BelegeSortField)
      ? (sorting[0].id as BelegeSortField)
      : null;
  const viewState: BelegeViewState = {
    scope,
    page,
    sortBy,
    sortDir: sorting[0]?.desc ? 'desc' : 'asc',
    filters: debouncedFilters,
  };

  const query = useQuery<BelegeListResult, Error>({
    queryKey: ['belege', viewState],
    queryFn: () => fetchBelegeList(viewState),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  // Topf badge count — always visible so the pot never goes unnoticed (A7).
  const topfCountQuery = useQuery<number, Error>({
    queryKey: ['belege', 'topf-count'],
    queryFn: async () => {
      const res = await fetchBelegeList({
        scope: 'topf',
        page: 1,
        sortBy: null,
        sortDir: 'asc',
        filters: {},
      });
      return res.total;
    },
  });

  const invalidateBelege = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['belege'] });
    void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
  };
  const releaseIntakeMutation = useMutation<CaseStatus, Error, string>({
    mutationFn: (caseId) => releaseIntake(caseId),
    onSettled: invalidateBelege,
  });
  const unflagMutation = useMutation<void, Error, string>({
    mutationFn: (caseId) => unflagAttention(caseId),
    onSettled: invalidateBelege,
  });
  const {
    exportZst,
    prioritiseCase,
    deprioritiseCase,
    parkCase,
    releaseCase,
    approveCase,
    reactivateCase,
    cancelCase,
    resolveIssue,
  } = useCockpitData();
  const store = useMemo<CaseActionCtx['store']>(
    () => ({
      prioritiseCase,
      deprioritiseCase,
      parkCase,
      releaseCase,
      approveCase,
      reactivateCase,
      cancelCase,
      resolveIssue,
    }),
    [
      prioritiseCase,
      deprioritiseCase,
      parkCase,
      releaseCase,
      approveCase,
      reactivateCase,
      cancelCase,
      resolveIssue,
    ],
  );

  // --- A4 Zuweisen aus der Liste ---
  const [assignBelegId, setAssignBelegId] = useState<string | null>(null);
  const assignBeleg = rows.find((r) => r.id === assignBelegId) ?? null;

  // --- Manual Beleg-Split (§8.4): pick the case, open the dialog, record the split ---
  const { recordSplit } = useSplits();
  const [splitCaseId, setSplitCaseId] = useState<string | null>(null);
  const [splitDone, setSplitDone] = useState<string | null>(null);
  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', 'split'],
    queryFn: () => fetchEmployees(),
    staleTime: 5 * 60 * 1000,
  });
  const splitEmployees = useMemo<SplitDialogEmployee[]>(
    () =>
      (employeesQuery.data?.employees ?? [])
        .filter((e) => e.active && e.netCapacityToday > 0)
        .map((e) => ({ id: e.id, name: e.displayName, ceilingMinutes: e.netCapacityToday })),
    [employeesQuery.data],
  );

  // §15.1 Tagesabschluss lives where finished work lives: the Abgeschlossen scope.
  const handleExport = async (): Promise<void> => {
    const res = await exportZst.mutateAsync();
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zst-export-${res.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<ColumnDef<BelegRow>[]>(() => {
    const defs: ColumnDef<BelegRow>[] = [
      { accessorKey: 'weBelegNo', header: 'WE-Beleg', id: 'weBelegNo' },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (r) => r.status,
        cell: (ctx) => (
          <Stack direction="row" gap={0.5} alignItems="center">
            <Chip size="small" label={PHASE_LABEL[casePhase(ctx.row.original.status)]} />
            <CaseStatusChip status={ctx.row.original.status} size="small" />
          </Stack>
        ),
      },
      {
        id: 'primaryShopNo',
        header: 'Shop',
        accessorFn: (r) => r.shopNos[0] ?? '–',
        cell: (ctx) => {
          const shops = ctx.row.original.shopNos;
          if (shops.length === 0) return '–';
          return (
            <Stack direction="row" gap={0.5} alignItems="center">
              <span>{shops[0]}</span>
              {shops.length > 1 && (
                <Tooltip title={`Alle Shops: ${shops.join(', ')}`}>
                  <Chip size="small" label={`+${shops.length - 1}`} />
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
      { accessorKey: 'branchNo', header: 'Filiale', id: 'branchNo' },
      {
        id: 'section',
        header: 'Abschnitt',
        accessorFn: (r) => r.section,
        cell: (ctx) => {
          const section = ctx.row.original.section;
          return section === null ? '–' : String(section);
        },
      },
      { accessorKey: 'goodsType', header: 'Warenart', enableSorting: false },
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
      { accessorKey: 'quantity', header: 'Menge (Teile)', id: 'totalQuantity' },
      { accessorKey: 'effortPoints', header: 'Punkte', id: 'effortPoints' },
      {
        id: 'labels',
        header: 'Etiketten',
        enableSorting: false,
        cell: (ctx) =>
          ctx.row.original.labelsRequired ? (
            <Chip size="small" color="info" variant="outlined" label="ja" />
          ) : (
            <Chip size="small" variant="outlined" label="nein" />
          ),
      },
      {
        id: 'bookingDate',
        header: 'Buchungsdatum',
        accessorFn: (r) => r.bookingDate,
        cell: (ctx) => formatDate(ctx.row.original.bookingDate),
      },
      { accessorKey: 'storageCode', header: 'Lagerplatz', enableSorting: false },
      {
        id: 'lieferung',
        header: 'Lieferung',
        enableSorting: false,
        cell: (ctx) => <LieferungChip group={ctx.row.original.deliveryGroup} />,
      },
      {
        id: 'assignedTo',
        header: 'Zugeteilt',
        enableSorting: false,
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <Stack direction="row" gap={0.5} alignItems="center">
              <span>{r.assignedTo}</span>
              {r.bundleQueue && !r.bundleQueue.started && (
                <Tooltip title="Bündel noch nicht gestartet — der Beleg liegt vorbereitet in der Reihenfolge.">
                  <Chip size="small" variant="outlined" label={`vorbereitet · Pos ${r.bundleQueue.position}`} />
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
    ];

    if (scope === 'archiv') {
      defs.push(
        {
          id: 'completedAt',
          header: 'Abschlussdatum',
          accessorFn: (r) => r.completedAt ?? '',
          cell: (ctx) => {
            const at = ctx.row.original.completedAt;
            return at ? formatDateTime(at) : '–';
          },
        },
        {
          id: 'docuware',
          header: 'DocuWare',
          enableSorting: false,
          cell: (ctx) => {
            const url = ctx.row.original.docuWareUrl;
            if (!url) return '–';
            return (
              <Tooltip title="Im DocuWare-Langzeitarchiv öffnen">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(url, '_blank', 'noopener');
                  }}
                >
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            );
          },
        },
      );
    }

    if (scope === 'topf') {
      defs.push({
        id: 'hinweis',
        header: 'Hinweis',
        enableSorting: false,
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <Stack direction="row" gap={0.5} alignItems="center" flexWrap="wrap">
              {r.missingFields.map((f) => (
                <Chip key={f} size="small" color="error" variant="outlined" label={`fehlt: ${f}`} />
              ))}
              {r.attentionFlag && (
                <Tooltip title={r.attentionNote ?? ''}>
                  <Chip size="small" color="warning" variant="outlined" label="Aufmerksamkeit" />
                </Tooltip>
              )}
              {r.attentionNote && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 220 }}>
                  „{r.attentionNote}"
                </Typography>
              )}
            </Stack>
          );
        },
      });
    }

    defs.push({
      id: 'actions',
      header: '',
      enableSorting: false,
      // Row click navigates to the detail; stop propagation so an action click
      // never doubles as "open Beleg".
      cell: (ctx) => {
        const r = ctx.row.original;
        const assignable = r.status === 'ready' && r.assignedTo === '–';
        return (
          <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'inline-flex', gap: 0.5 }}>
            {assignable && (
              <Button size="small" variant="outlined" onClick={() => setAssignBelegId(r.id)}>
                Zuweisen
              </Button>
            )}
            {scope === 'topf' && r.status === 'blocked' && (
              <Button
                size="small"
                variant="outlined"
                disabled={releaseIntakeMutation.isPending}
                onClick={() => releaseIntakeMutation.mutate(r.id)}
              >
                Freigeben (an Automatik)
              </Button>
            )}
            {scope === 'topf' && r.attentionFlag && (
              <Button
                size="small"
                variant="outlined"
                disabled={unflagMutation.isPending}
                onClick={() => unflagMutation.mutate(r.id)}
              >
                Aus Topf entlassen
              </Button>
            )}
            <CaseActions
              variant="row"
              case={{ status: r.status, priorityFlags: r.priorityFlags }}
              weBelegNo={r.weBelegNo}
              ctx={{ caseId: r.id, store }}
              onSplit={(caseId) => setSplitCaseId(caseId)}
            />
          </Box>
        );
      },
    });

    return defs;
  }, [scope, store, releaseIntakeMutation, unflagMutation]);

  const splitBeleg = useMemo<SplitDialogBeleg | null>(() => {
    const row = rows.find((r) => r.id === splitCaseId);
    if (!row) return null;
    return {
      caseId: row.id,
      weBelegNo: row.weBelegNo,
      totalQuantity: row.quantity,
      effortPoints: row.effortPoints,
      estimatedMinutes: row.minutes,
    };
  }, [rows, splitCaseId]);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        Belege ({total})
      </Typography>

      {splitDone && (
        <Alert
          severity="success"
          onClose={() => setSplitDone(null)}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/aufteilungen')}>
              Zur Leistung
            </Button>
          }
        >
          Beleg {splitDone} aufgeteilt — Leistung je Anteil unter „Aufteilungen".
        </Alert>
      )}

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
        <ToggleButtonGroup
          size="small"
          exclusive
          value={scope}
          onChange={(_e, next) => {
            if (next !== null) {
              setScope(next as BelegeScope);
              setPage(1);
            }
          }}
          aria-label="Lebenszyklus-Scope"
        >
          {SCOPES.map((s) => (
            <ToggleButton key={s} value={s}>
              {SCOPE_LABEL[s]}
              {s === 'topf' && topfCountQuery.data !== undefined
                ? ` (${topfCountQuery.data})`
                : ''}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {scope === 'abgeschlossen' && (
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={exportZst.isPending || total === 0}
            onClick={() => void handleExport()}
          >
            {exportZst.isPending ? 'Export läuft …' : 'Tagesabschluss / ZST-Export'}
          </Button>
        )}
      </Stack>

      {scope === 'archiv' && (
        <Alert severity="info" variant="outlined">
          Belege bleiben im System erhalten; DocuWare ist das Langzeitarchiv.
        </Alert>
      )}
      {scope === 'topf' && (
        <Alert severity="info" variant="outlined">
          Topf: Belege mit „Besonderer Aufmerksamkeit" (Bucherinnen-Hinweis) sowie blockierte /
          zu prüfende Belege — hier zuweisen, freigeben oder entlassen.
        </Alert>
      )}

      {/* Compact per-column filter row — every field sets a SERVER query param (A2). */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField
          size="small"
          label="WE-Nr / Lagerplatz / Lieferschein"
          value={filters.q ?? ''}
          onChange={(e) => updateFilters({ q: e.target.value || undefined })}
          sx={{ minWidth: 220 }}
        />
        <TextField
          size="small"
          select
          label="Status"
          value={filters.status ?? ''}
          onChange={(e) =>
            updateFilters({ status: (e.target.value || undefined) as CaseStatus | undefined })
          }
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">Alle</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Shop"
          value={filters.shopNo ?? ''}
          onChange={(e) => updateFilters({ shopNo: e.target.value || undefined })}
          sx={{ width: 110 }}
        />
        <TextField
          size="small"
          label="Filiale"
          value={filters.branchNo ?? ''}
          onChange={(e) => updateFilters({ branchNo: e.target.value || undefined })}
          sx={{ width: 110 }}
        />
        <TextField
          size="small"
          select
          label="Abschnitt"
          value={filters.section ?? ''}
          onChange={(e) =>
            updateFilters({
              section: e.target.value === '' ? undefined : (Number(e.target.value) as BelegeFilters['section']),
            })
          }
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">Alle</MenuItem>
          {SECTION_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Etiketten"
          value={filters.labels ?? ''}
          onChange={(e) =>
            updateFilters({ labels: (e.target.value || undefined) as BelegeFilters['labels'] })
          }
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">Alle</MenuItem>
          <MenuItem value="yes">ja</MenuItem>
          <MenuItem value="no">nein</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="Zugeteilt"
          value={filters.assigned ?? ''}
          onChange={(e) =>
            updateFilters({ assigned: (e.target.value || undefined) as BelegeFilters['assigned'] })
          }
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="">Alle</MenuItem>
          <MenuItem value="yes">ja</MenuItem>
          <MenuItem value="no">nein</MenuItem>
        </TextField>
        <TextField
          size="small"
          type="date"
          label="Buchung ab"
          value={filters.bookingFrom ?? ''}
          onChange={(e) => updateFilters({ bookingFrom: e.target.value || undefined })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />
        <TextField
          size="small"
          type="date"
          label="Buchung bis"
          value={filters.bookingTo ?? ''}
          onChange={(e) => updateFilters({ bookingTo: e.target.value || undefined })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />
      </Stack>

      {query.isLoading ? (
        <Stack spacing={1}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={44} />
          ))}
        </Stack>
      ) : (
        <>
          <DataTable
            data={rows}
            columns={columns}
            serverMode
            sorting={sorting}
            onSortingChange={(next) => {
              setSorting(next);
              setPage(1);
            }}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/belege/${r.id}`)}
            maxHeight={560}
            emptyText="Keine Belege in diesem Scope."
          />
          <TablePagination
            component="div"
            count={total}
            page={page - 1}
            onPageChange={(_e, next) => setPage(next + 1)}
            rowsPerPage={BELEGE_PAGE_LIMIT}
            rowsPerPageOptions={[BELEGE_PAGE_LIMIT]}
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} von ${count}`}
          />
        </>
      )}

      <AssignFromListDialog
        open={assignBeleg !== null}
        beleg={assignBeleg}
        onClose={() => setAssignBelegId(null)}
      />

      <SplitDialog
        open={splitBeleg !== null}
        beleg={splitBeleg}
        employees={splitEmployees}
        onConfirm={(input) => {
          recordSplit(input);
          setSplitDone(input.weBelegNo);
        }}
        onClose={() => setSplitCaseId(null)}
      />
    </Stack>
  );
}
