/**
 * Browse/filter panel inside AssignDialog (B1/B2/B3): a filterable, checkbox
 * multi-select list over the assignable pool, feeding the SAME selection tray
 * the live-search dropdown writes to. Collapsed by default so the dialog stays
 * compact; only expands when the teamlead opens it.
 */
import { useMemo, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { BelegSearchResultRow } from './BelegSearchResultRow.js';
import { isManualOnlyTier } from './TierChip.js';
import { searchAssignableCases, type CaseSearchResult } from '../data/belege.js';
import { formatMinutes } from '../lib/format.js';
import type { BoardRow } from '../data/types.js';

type SortMode = 'teile' | 'prio' | 'oldest';

const SORT_LABELS: Record<SortMode, string> = {
  teile: 'Teile ↓',
  prio: 'Priorität',
  oldest: 'Ältestes zuerst',
};

export interface AssignBrowseDrawerProps {
  open: boolean;
  row: BoardRow;
  /** Belege already in the shared tray — excluded so they can't be double-added. */
  excludeCaseIds: string[];
  onBulkAdd: (results: CaseSearchResult[]) => void;
}

export function AssignBrowseDrawer({
  open,
  row,
  excludeCaseIds,
  onBulkAdd,
}: AssignBrowseDrawerProps): JSX.Element | null {
  const [shopNo, setShopNo] = useState('');
  const [branchNo, setBranchNo] = useState('');
  const [allBereiche, setAllBereiche] = useState(false);
  const [bereicheFilter, setBereicheFilter] = useState<Set<string>>(() => new Set(row.bereiche));
  const [sortMode, setSortMode] = useState<SortMode>('teile');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const query = useQuery<CaseSearchResult[], Error>({
    queryKey: ['case-search-browse', shopNo, branchNo],
    queryFn: () =>
      searchAssignableCases({
        shopNo: shopNo.trim() || undefined,
        branchNo: branchNo.trim() || undefined,
        limit: 50,
      }),
    enabled: open,
  });

  const excludeSet = useMemo(() => new Set(excludeCaseIds), [excludeCaseIds]);
  const visible = useMemo(() => {
    const rows = (query.data ?? []).filter((r) => !excludeSet.has(r.caseId));
    const bereichFiltered = allBereiche
      ? rows
      : rows.filter((r) => r.bereich === null || bereicheFilter.has(r.bereich));
    const sorted = [...bereichFiltered];
    if (sortMode === 'teile') sorted.sort((a, b) => b.teile - a.teile);
    else if (sortMode === 'prio') {
      sorted.sort((a, b) => Number(b.priorityFlags.length > 0) - Number(a.priorityFlags.length > 0));
    }
    // 'oldest' is already the endpoint's natural order (bookingDate ascending).
    return sorted;
  }, [query.data, excludeSet, allBereiche, bereicheFilter, sortMode]);

  const checked = visible.filter((r) => checkedIds.has(r.caseId));
  const freeMinutes = Math.max(0, row.netCapacityMinutes - row.assignedMinutes);
  const checkedTeile = checked.reduce((sum, r) => sum + r.teile, 0);

  function toggleBereich(b: string): void {
    setBereicheFilter((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  function toggleChecked(caseId: string, isChecked: boolean): void {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(caseId);
      else next.delete(caseId);
      return next;
    });
  }

  function handleBulkAdd(): void {
    if (checked.length === 0) return;
    onBulkAdd(checked);
    setCheckedIds(new Set());
  }

  if (!open) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {row.displayName} · {formatMinutes(freeMinutes)} frei
          </Typography>
          {isManualOnlyTier(row.skillTier) && (
            <Chip size="small" variant="outlined" label="manuelle Zuteilung passend" />
          )}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          {row.bereiche.map((b) => (
            <Chip
              key={b}
              size="small"
              variant={!allBereiche && bereicheFilter.has(b) ? 'filled' : 'outlined'}
              color="primary"
              label={b}
              onClick={() => toggleBereich(b)}
              disabled={allBereiche}
            />
          ))}
          <Chip
            size="small"
            variant={allBereiche ? 'filled' : 'outlined'}
            label="alle Bereiche"
            onClick={() => setAllBereiche((v) => !v)}
          />
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          <TextField
            size="small"
            label="Shop"
            value={shopNo}
            onChange={(e) => setShopNo(e.target.value)}
          />
          <TextField
            size="small"
            label="Filiale"
            value={branchNo}
            onChange={(e) => setBranchNo(e.target.value)}
          />
          <Stack direction="row" spacing={0.5}>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <Chip
                key={mode}
                size="small"
                variant={sortMode === mode ? 'filled' : 'outlined'}
                label={SORT_LABELS[mode]}
                onClick={() => setSortMode(mode)}
              />
            ))}
          </Stack>
        </Stack>

        {query.isLoading && <CircularProgress size={20} />}
        {query.isError && (
          <Alert severity="error" variant="outlined">
            Suche fehlgeschlagen: {query.error.message}
          </Alert>
        )}
        {!query.isLoading && !query.isError && visible.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Keine passenden Belege für die aktuellen Filter.
          </Typography>
        )}

        {visible.length > 0 && (
          <Stack sx={{ maxHeight: 320, overflowY: 'auto' }}>
            {visible.slice(0, 20).map((r) => (
              <BelegSearchResultRow
                key={r.caseId}
                result={r}
                checkbox={{
                  checked: checkedIds.has(r.caseId),
                  onChange: (isChecked) => toggleChecked(r.caseId, isChecked),
                }}
              />
            ))}
          </Stack>
        )}
        {visible.length > 20 && (
          <Typography variant="caption" color="text.secondary">
            Weitere Treffer vorhanden — Filter verfeinern.
          </Typography>
        )}

        <Stack direction="row" spacing={2} alignItems="center" sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2">
            {checked.length} ausgewählt · {checkedTeile} Teile
          </Typography>
          <Button
            size="small"
            variant="contained"
            disabled={checked.length === 0}
            onClick={handleBulkAdd}
            sx={{ ml: 'auto' }}
          >
            Auswahl übernehmen
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
