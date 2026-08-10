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
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ColumnDef, SortingState, VisibilityState } from '@tanstack/react-table';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import type { CaseStatus } from '@paket/domain-types';
import { caseStatusMeta, CaseStatusChip, PriorityChip } from '@paket/ui';
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
import { BELEGE_VIEW_KEY, loadViewState, saveViewState } from '../../lib/viewState.js';
import { ColumnVisibilityMenu, type ColumnOption } from '../../components/ColumnVisibilityMenu.js';
import { DataTable } from '../../components/DataTable.js';
import { LieferungChip, buildGroupColorMap } from '../../components/LieferungChip.js';
import { CaseActionMenu } from '../../components/CaseActionMenu.js';
import { InstructionsDialog } from '../../components/InstructionsDialog.js';
import { ForwardDialog } from '../../components/ForwardDialog.js';
import { AttentionDialog } from '../../components/AttentionDialog.js';
import type { CaseActionCtx } from '../../actions/caseActions.js';
import { useCockpitData } from '../../data/store.js';
import { fetchEmployees } from '../../data/employees.js';
import { useSplitCase } from '../split/useSplitCase.js';
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
  'problem_resolved',
  'completed',
  'zst_done',
  'cancelled',
  'split_container',
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

/** Persisted list view state (C2, `paket.view.belege`): scope + sorting + filters. */
interface BelegeSavedView {
  scope: BelegeScope;
  sorting: SortingState;
  filters: BelegeFilters;
  /** UI-Zustand des einklappbaren Filterblocks (ab „Status" abwärts). */
  filtersOpen?: boolean;
  /**
   * Ausgeblendete Spalten (Kundenfeedback 07.08.2026), TanStack-Konvention:
   * fehlender Eintrag = sichtbar. Hängt am `viewStateKey`, ist also je Ansicht
   * getrennt — der Basis-Reiter und die DA.M.B-Kombi konfigurieren sich einzeln.
   */
  columnVisibility?: VisibilityState;
}

const DEFAULT_SAVED_VIEW: BelegeSavedView = { scope: 'aktiv', sorting: [], filters: {} };

export interface BelegListPageProps {
  /**
   * localStorage-Key der Saved View. Default ist der Basis-Tab-Key; eingebettete
   * Instanzen (Experiment DA.M.B) übergeben einen eigenen Key, damit sie den
   * Basis-Tab /belege nicht umkonfigurieren.
   */
  viewStateKey?: string;
  /** Experiment DA.M.B: Tabelle füllt die verfügbare Höhe (Pane/Vollbild) bis ganz unten. */
  fill?: boolean;
}

export function BelegListPage({
  viewStateKey = BELEGE_VIEW_KEY,
  fill = false,
}: BelegListPageProps = {}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Saved view (C2): scope/sorting/filters survive reloads via localStorage.
  const [savedView] = useState<BelegeSavedView>(() =>
    loadViewState<BelegeSavedView>(viewStateKey, DEFAULT_SAVED_VIEW),
  );
  const [scope, setScope] = useState<BelegeScope>(savedView.scope);
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>(savedView.sorting);
  const [filters, setFilters] = useState<BelegeFilters>(savedView.filters);
  // Platzsparende Filterleiste: Volltextsuche als Lupe neben den Scopes,
  // Spaltenfilter (ab „Status" abwärts) einklappbar.
  const [filtersOpen, setFiltersOpen] = useState<boolean>(savedView.filtersOpen === true);
  const [searchOpen, setSearchOpen] = useState<boolean>(() => Boolean(savedView.filters.q));
  // Ausgeblendete Spalten (07.08.2026) — überlebt den Reload, je Ansicht getrennt.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    savedView.columnVisibility ?? {},
  );
  const debouncedFilters = useDebounced(filters);

  useEffect(() => {
    saveViewState<BelegeSavedView>(viewStateKey, {
      scope,
      sorting,
      filters: debouncedFilters,
      filtersOpen,
      columnVisibility,
    });
  }, [viewStateKey, scope, sorting, debouncedFilters, filtersOpen, columnVisibility]);

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
    cancelCase,
    sendInstruction,
    forwardCase,
    unforwardCase,
    flagAttention,
    unflagAttention: unflagAttentionAction,
  } = useCockpitData();
  const store = useMemo<CaseActionCtx['store']>(
    () => ({
      prioritiseCase,
      deprioritiseCase,
      parkCase,
      releaseCase,
      approveCase,
      cancelCase,
      sendInstruction,
      forwardCase,
      unforwardCase,
      flagAttention,
      unflagAttention: unflagAttentionAction,
    }),
    [
      prioritiseCase,
      deprioritiseCase,
      parkCase,
      releaseCase,
      approveCase,
      cancelCase,
      sendInstruction,
      forwardCase,
      unforwardCase,
      flagAttention,
      unflagAttentionAction,
    ],
  );

  // --- A4 Zuweisen aus der Liste ---
  const [assignBelegId, setAssignBelegId] = useState<string | null>(null);
  const assignBeleg = rows.find((r) => r.id === assignBelegId) ?? null;

  // --- Weiterleiten + Besondere Aufmerksamkeit (shared CaseActionMenu custom actions) ---
  const [instructionsCaseId, setInstructionsCaseId] = useState<string | null>(null);
  const instructionsBeleg = rows.find((r) => r.id === instructionsCaseId) ?? null;
  const [forwardCaseId, setForwardCaseId] = useState<string | null>(null);
  const forwardBeleg = rows.find((r) => r.id === forwardCaseId) ?? null;
  const [attentionCaseId, setAttentionCaseId] = useState<string | null>(null);
  const attentionBeleg = rows.find((r) => r.id === attentionCaseId) ?? null;

  // --- Beleg aufteilen (§8.4): Beleg waehlen, Dialog oeffnen, Teil-Belege anlegen lassen ---
  const [splitCaseId, setSplitCaseId] = useState<string | null>(null);
  const [splitDone, setSplitDone] = useState<string | null>(null);
  const split = useSplitCase((result) => {
    setSplitDone(`${result.containerWeBelegNo} · ${result.parts.length} Teile`);
    setSplitCaseId(null);
  });
  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', 'split'],
    queryFn: () => fetchEmployees(),
    staleTime: 5 * 60 * 1000,
  });
  const splitEmployees = useMemo<SplitDialogEmployee[]>(
    () =>
      (employeesQuery.data?.employees ?? [])
        .filter((e) => e.active && e.netCapacityToday > 0)
        .map((e) => ({
          id: e.id,
          employeeNo: e.employeeNo,
          name: e.displayName,
          ceilingMinutes: e.netCapacityToday,
        })),
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

  // Frage 8: Gruppen-Id → Kennfarbe für die aktuell sichtbare Seite (stabil in
  // Zeilenreihenfolge). Reine Darstellung — die Gruppen-Identität kommt vom Server.
  const groupColorById = useMemo(
    () =>
      buildGroupColorMap(
        rows.map((r) =>
          r.deliveryGroup && r.deliveryGroup.presentSize >= 2 ? r.deliveryGroup.id : null,
        ),
      ),
    [rows],
  );

  // Frage 8: zusammenhängende Gruppen-Zeilen (der Server liefert Mitglieder adjazent)
  // werden als Block markiert — farbige Kante + dezenter Tint in der Kennfarbe. Ein
  // einzeln sichtbares Mitglied (Rest außerhalb von Filter/Seite) bekommt nur die Kante.
  const groupRowSx = (r: BelegRow, index: number) => {
    const group = r.deliveryGroup;
    if (!group || group.presentSize < 2) return undefined;
    const color = groupColorById.get(group.id);
    if (!color) return undefined;
    const inBlock =
      rows[index - 1]?.deliveryGroup?.id === group.id ||
      rows[index + 1]?.deliveryGroup?.id === group.id;
    return {
      '& > td:first-of-type': { borderLeft: `3px solid ${color}` },
      ...(inBlock ? { backgroundColor: alpha(color, 0.05) } : {}),
    };
  };

  // Anzahl aktiver Spaltenfilter (ohne Volltextsuche) — Zähler auf dem Filter-Button.
  const advancedCount = [
    filters.status,
    filters.shopNo,
    filters.branchNo,
    filters.section,
    filters.labels,
    filters.digiTags,
    filters.security,
    filters.assigned,
    filters.monster,
    filters.bookingFrom,
    filters.bookingTo,
  ].filter((v) => v !== undefined && v !== '').length;

  const columns = useMemo<ColumnDef<BelegRow>[]>(() => {
    const defs: ColumnDef<BelegRow>[] = [
      {
        accessorKey: 'weBelegNo',
        header: 'WE-Beleg',
        id: 'weBelegNo',
        // Teil-Belege stehen eingerückt unter ihrem Original (der Server hält die
        // Familie zusammen), das Original zeigt, in wie viele Teile es zerfallen ist.
        cell: (ctx) => {
          const r = ctx.row.original;
          return (
            <Stack
              direction="row"
              gap={0.75}
              alignItems="center"
              sx={{ pl: r.parentCaseId ? 3 : 0 }}
            >
              {r.parentCaseId && (
                <Typography component="span" color="text.disabled" aria-hidden>
                  └
                </Typography>
              )}
              <span>{r.weBelegNo}</span>
              {r.partCount > 0 && (
                <Tooltip title="Dieser Beleg wurde aufgeteilt; die Arbeit liegt in seinen Teilen.">
                  <Chip size="small" variant="outlined" label={`${r.partCount} Teile`} />
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
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
      { accessorKey: 'goodsType', header: 'Warenart', id: 'goodsType', enableSorting: false },
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
      {
        accessorKey: 'quantity',
        header: 'Teile',
        id: 'totalQuantity',
        // Der Monster-Chip steht bewusst IN der Teile-Spalte: die Menge ist der Grund,
        // und die Teamlead-Frage lautet „in welcher Spalte finde ich die?" (C6).
        cell: (ctx) => (
          <Stack direction="row" gap={0.5} alignItems="center">
            <span>{ctx.row.original.quantity}</span>
            {ctx.row.original.isMonster && (
              <Tooltip title="Monster-Beleg: über der Teile-Schwelle aus der Regelpflege — wird nicht automatisch verteilt und wartet auf eine Teamlead-Entscheidung.">
                <Chip size="small" color="error" label="Monster" />
              </Tooltip>
            )}
          </Stack>
        ),
      },
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
        header: 'Buchung',
        accessorFn: (r) => r.bookingDate,
        cell: (ctx) => formatDate(ctx.row.original.bookingDate),
      },
      { accessorKey: 'storageCode', header: 'Lagerplatz', id: 'storageCode', enableSorting: false },
      {
        id: 'lieferung',
        header: 'Lieferung',
        enableSorting: false,
        cell: (ctx) => {
          const group = ctx.row.original.deliveryGroup;
          return (
            <LieferungChip
              group={group}
              identityColor={group ? groupColorById.get(group.id) : undefined}
            />
          );
        },
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
      // Das Kebab-Menü ist der Zugang zu allen Beleg-Aktionen — es darf nicht
      // ausblendbar sein, sonst wäre die Zeile nicht mehr bedienbar.
      enableHiding: false,
      // Row click navigates to the detail; stop propagation so an action click
      // never doubles as "open Beleg".
      cell: (ctx) => {
        const r = ctx.row.original;
        return (
          <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'inline-flex', gap: 0.5 }}>
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
            <CaseActionMenu
              density="compact"
              case={{
                status: r.status,
                priorityFlags: r.priorityFlags,
                assignedTo: r.assignedTo === '–' ? null : r.assignedTo,
                forwardedTo: r.forwardedTo,
                attentionFlag: r.attentionFlag,
              }}
              weBelegNo={r.weBelegNo}
              ctx={{ caseId: r.id, store }}
              onSplit={(caseId) => setSplitCaseId(caseId)}
              onAssign={(caseId) => setAssignBelegId(caseId)}
              onForward={(caseId) => setForwardCaseId(caseId)}
              onAttention={(caseId) => setAttentionCaseId(caseId)}
              onInstructions={(caseId) => setInstructionsCaseId(caseId)}
            />
          </Box>
        );
      },
    });

    return defs;
  }, [scope, store, releaseIntakeMutation, unflagMutation, groupColorById]);

  // Auswahlliste des „Spalten"-Menüs: jede ausblendbare Spalte mit ihrer
  // Kopf-Beschriftung. Folgt automatisch dem Scope (Archiv/Topf bringen eigene
  // Spalten mit), deshalb aus derselben Definition abgeleitet statt gepflegt.
  const columnOptions = useMemo<ColumnOption[]>(
    () =>
      columns.flatMap((c) =>
        c.id !== undefined &&
        c.enableHiding !== false &&
        typeof c.header === 'string' &&
        c.header !== ''
          ? [{ id: c.id, label: c.header }]
          : [],
      ),
    [columns],
  );

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
    <Stack spacing={2} sx={fill ? { height: '100%', minHeight: 0 } : undefined}>
      {/* Kopfzeile: Titel, Scopes, Lupe (Volltextsuche) und Filter-Umschalter in
          EINER Zeile — die frühere zweite Zeile entfällt (Platz für die Tabelle). */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Belege ({total})
        </Typography>
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
        {searchOpen || (filters.q ?? '') !== '' ? (
          <TextField
            size="small"
            autoFocus={searchOpen && !filters.q}
            placeholder="WE-Nr / Lagerplatz / Lieferschein"
            value={filters.q ?? ''}
            onChange={(e) => updateFilters({ q: e.target.value || undefined })}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Suche leeren und schließen"
                      onClick={() => {
                        updateFilters({ q: undefined });
                        setSearchOpen(false);
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: 250 }}
          />
        ) : (
          <Tooltip title="Suchen: WE-Nr / Lagerplatz / Lieferschein">
            <IconButton
              size="small"
              aria-label="Suche öffnen (WE-Nr / Lagerplatz / Lieferschein)"
              onClick={() => setSearchOpen(true)}
            >
              <SearchIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Button
          size="small"
          color={advancedCount > 0 ? 'primary' : 'inherit'}
          startIcon={<FilterListIcon />}
          endIcon={filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          Filter{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </Button>
        {/* Spalten ein-/ausblenden (07.08.2026): der sichtbare Rückweg zu einer
            über ihr Kopf-Icon ausgeblendeten Spalte. */}
        <ColumnVisibilityMenu
          columns={columnOptions}
          visibility={columnVisibility}
          onChange={setColumnVisibility}
        />
        {scope === 'abgeschlossen' && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            disabled={exportZst.isPending || total === 0}
            onClick={() => void handleExport()}
          >
            {exportZst.isPending ? 'Export läuft …' : 'Tagesabschluss / ZST-Export'}
          </Button>
        )}
      </Stack>

      {splitDone && (
        <Alert severity="success" onClose={() => setSplitDone(null)}>
          Beleg aufgeteilt: {splitDone}. Die Teile stehen als eigene Belege direkt unter dem
          Original in dieser Liste.
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

      {/* Einklappbare Spaltenfilter (ab „Status" abwärts); jedes Feld setzt einen
          SERVER-Query-Param (A2). Die Volltextsuche sitzt oben als Lupe neben den Scopes. */}
      <Collapse in={filtersOpen} timeout={150}>
        <Stack direction="row" spacing={1} rowGap={1} flexWrap="wrap" useFlexGap alignItems="center">
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
              {caseStatusMeta[s].label}
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
        {/* Digi Tags / Sichern (07.08.2026): dieselbe Positions-Ableitung wie die
            Chips auf Karte und Zeile — der Server filtert, nicht die Anzeige. */}
        <TextField
          size="small"
          select
          label="Digi Tags"
          value={filters.digiTags ?? ''}
          onChange={(e) =>
            updateFilters({ digiTags: (e.target.value || undefined) as BelegeFilters['digiTags'] })
          }
          sx={{ minWidth: 130 }}
        >
          <MenuItem value="">Alle</MenuItem>
          <MenuItem value="yes">ja</MenuItem>
          <MenuItem value="no">nein</MenuItem>
        </TextField>
        <TextField
          size="small"
          select
          label="Sichern"
          value={filters.security ?? ''}
          onChange={(e) =>
            updateFilters({ security: (e.target.value || undefined) as BelegeFilters['security'] })
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
          select
          label="Monster"
          value={filters.monster ?? ''}
          onChange={(e) =>
            updateFilters({ monster: (e.target.value || undefined) as BelegeFilters['monster'] })
          }
          sx={{ minWidth: 140 }}
          helperText="Teile ≥ Schwelle"
        >
          <MenuItem value="">Alle</MenuItem>
          <MenuItem value="yes">nur Monster</MenuItem>
          <MenuItem value="no">ohne Monster</MenuItem>
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
      </Collapse>

      {query.isLoading ? (
        <Stack spacing={1}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={32} />
          ))}
        </Stack>
      ) : (
        // Füll-Modus (Experiment): Tabelle nimmt die Resthöhe bis ganz unten ein,
        // die Paginierung bleibt darunter sichtbar.
        <Box
          sx={
            fill
              ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
              : undefined
          }
        >
          <DataTable
            data={rows}
            columns={columns}
            serverMode
            dense
            rowHeight={30}
            getRowSx={groupRowSx}
            columnVisibility={columnVisibility}
            onHideColumn={(id) => setColumnVisibility((prev) => ({ ...prev, [id]: false }))}
            sorting={sorting}
            onSortingChange={(next) => {
              setSorting(next);
              setPage(1);
            }}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/belege/${r.id}`)}
            maxHeight={fill ? undefined : 560}
            fillHeight={fill}
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
            sx={fill ? { flexShrink: 0 } : undefined}
          />
        </Box>
      )}

      <AssignFromListDialog
        open={assignBeleg !== null}
        beleg={assignBeleg}
        onClose={() => setAssignBelegId(null)}
      />

      <ForwardDialog
        open={forwardBeleg !== null}
        weBelegNo={forwardBeleg?.weBelegNo ?? ''}
        onConfirm={(recipient) => {
          if (forwardBeleg) forwardCase(forwardBeleg.id, recipient);
        }}
        onClose={() => setForwardCaseId(null)}
      />

      <AttentionDialog
        open={attentionBeleg !== null}
        weBelegNo={attentionBeleg?.weBelegNo ?? ''}
        onConfirm={(note) => {
          if (attentionBeleg) flagAttention(attentionBeleg.id, note);
        }}
        onClose={() => setAttentionCaseId(null)}
      />

      {/* Instruktions-Loop (04.08.2026): je Meldung ein Pflichttext, einzeln absendbar. */}
      <InstructionsDialog
        open={instructionsBeleg !== null}
        weBelegNo={instructionsBeleg?.weBelegNo ?? ''}
        issues={instructionsBeleg?.issues ?? []}
        onSend={(issueId, text) => {
          if (instructionsBeleg) sendInstruction(instructionsBeleg.id, issueId, text);
        }}
        onClose={() => setInstructionsCaseId(null)}
      />

      <SplitDialog
        open={splitBeleg !== null}
        beleg={splitBeleg}
        employees={splitEmployees}
        pending={split.pending}
        error={split.error}
        onConfirm={split.submit}
        onClose={() => {
          split.clearError();
          setSplitCaseId(null);
        }}
      />
    </Stack>
  );
}
