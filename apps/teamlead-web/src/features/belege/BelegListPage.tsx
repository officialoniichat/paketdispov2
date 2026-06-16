/**
 * Beleg-Liste (§10.4 list view): the full case population from the live backend
 * (`GET /api/teamlead/cases`) in a dense, filterable, virtualizable TanStack Table.
 *
 * The list is segmented by **lifecycle scope** (see
 * docs/concept/beleg-lifecycle-completion-concept.md): Aktiv (Pool/In Arbeit) is
 * the default; Abgeschlossen heute and Archiv give completed/terminal
 * Belege a home instead of burying them in one flat status dump. Filtering/sorting
 * stay client-side (pilot scale: one page of 200). Row click opens the Belegdetails.
 */
import { useMemo, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import DownloadIcon from '@mui/icons-material/Download';
import { CaseStatusChip, PriorityChip } from '@paket/ui';
import {
  casePhase,
  fetchBelegeList,
  PHASE_LABEL,
  type BelegRow,
  type CasePhase,
} from '../../data/belege.js';
import { formatMinutes } from '../../lib/format.js';
import { DataTable } from '../../components/DataTable.js';
import { CaseActions } from '../../components/CaseActions.js';
import type { CaseActionCtx } from '../../actions/caseActions.js';
import { useCockpitData } from '../../data/store.js';

/** A lifecycle scope = a named set of phases the list can be narrowed to. */
type Scope = 'aktiv' | 'abgeschlossen' | 'archiv' | 'alle';

const SCOPE_PHASES: Record<Scope, CasePhase[] | null> = {
  aktiv: ['pool', 'arbeit'],
  abgeschlossen: ['abgeschlossen'],
  archiv: ['erledigt'],
  alle: null, // no phase filter
};

const SCOPE_LABEL: Record<Scope, string> = {
  aktiv: 'Aktiv',
  abgeschlossen: 'Abgeschlossen',
  archiv: 'Archiv',
  alle: 'Alle',
};

export function BelegListPage(): JSX.Element {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('aktiv');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

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
  const query = useQuery<BelegRow[], Error>({
    queryKey: ['belege'],
    queryFn: fetchBelegeList,
  });
  const allRows = query.data ?? [];

  // §15.1 Tagesabschluss lives where finished work lives: the Abgeschlossen scope.
  // Exports all completed cases (→ zst_done) and downloads the ZST CSV.
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

  // Per-scope counts for the toggle badges, and the rows for the active scope.
  const countByScope = useMemo<Record<Scope, number>>(() => {
    const counts: Record<Scope, number> = {
      aktiv: 0,
      abgeschlossen: 0,
      archiv: 0,
      alle: allRows.length,
    };
    for (const row of allRows) {
      const phase = casePhase(row.status);
      if (SCOPE_PHASES.aktiv?.includes(phase)) counts.aktiv += 1;
      if (SCOPE_PHASES.abgeschlossen?.includes(phase)) counts.abgeschlossen += 1;
      if (SCOPE_PHASES.archiv?.includes(phase)) counts.archiv += 1;
    }
    return counts;
  }, [allRows]);

  const rows = useMemo(() => {
    const phases = SCOPE_PHASES[scope];
    if (phases === null) return allRows;
    return allRows.filter((r) => phases.includes(casePhase(r.status)));
  }, [allRows, scope]);

  const columns = useMemo<ColumnDef<BelegRow>[]>(
    () => [
      { accessorKey: 'weBelegNo', header: 'WE-Beleg' },
      {
        id: 'phase',
        header: 'Phase',
        accessorFn: (r) => PHASE_LABEL[casePhase(r.status)],
        cell: (ctx) => (
          <Stack direction="row" gap={0.5} alignItems="center">
            <Chip size="small" label={PHASE_LABEL[casePhase(ctx.row.original.status)]} />
            <CaseStatusChip status={ctx.row.original.status} size="small" />
          </Stack>
        ),
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
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        // Row click navigates to the detail; stop propagation so an action click
        // never doubles as "open Beleg".
        cell: (ctx) => (
          <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'inline-flex' }}>
            <CaseActions
              variant="row"
              case={{
                status: ctx.row.original.status,
                priorityFlags: ctx.row.original.priorityFlags,
              }}
              weBelegNo={ctx.row.original.weBelegNo}
              ctx={{ caseId: ctx.row.original.id, store }}
            />
          </Box>
        ),
      },
    ],
    [store],
  );

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
        <ToggleButtonGroup
          size="small"
          exclusive
          value={scope}
          onChange={(_e, next) => {
            if (next !== null) setScope(next as Scope);
          }}
          aria-label="Lebenszyklus-Scope"
        >
          {(Object.keys(SCOPE_PHASES) as Scope[]).map((s) => (
            <ToggleButton key={s} value={s}>
              {SCOPE_LABEL[s]} ({countByScope[s]})
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          size="small"
          label="Filter (WE-Nr, Status, Lagerplatz …)"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          sx={{ minWidth: 280 }}
        />
        {scope === 'abgeschlossen' && (
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={exportZst.isPending || countByScope.abgeschlossen === 0}
            onClick={() => void handleExport()}
          >
            {exportZst.isPending ? 'Export läuft …' : 'Tagesabschluss / ZST-Export'}
          </Button>
        )}
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
          emptyText="Keine Belege in diesem Scope."
        />
      )}
    </Stack>
  );
}
