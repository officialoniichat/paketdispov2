/**
 * Digitale Ablagen — globale Filterleiste (Modell A, docs/concept/ablage-filter).
 *
 * Additive (AND) Filter über allen Lanes gleichzeitig, plus ein optionales
 * "Gruppieren nach" für die Sub-Header innerhalb jeder Lane. Die Lane-Achse
 * selbst (Status/Fachlogik) bleibt unangetastet — siehe README §3/§4 für die
 * Abwägung gegen ein volles Re-Grouping.
 */
import { useState, type JSX } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import { BEREICHE, goodsTypeTextSchema, type Bereich, type GoodsTypeText } from '@paket/domain-types';
import {
  activeFilterChips,
  isFilterActive,
  removeFilterChip,
  type AblagenFilterState,
  type AblagenGroupBy,
  type DeliveryGroupFilter,
} from './ablagenFilters.js';

const GOODS_TYPES: readonly GoodsTypeText[] = goodsTypeTextSchema.options;

const GROUP_BY_LABEL: Record<AblagenGroupBy, string> = {
  none: '— keine —',
  bereich: 'Bereich',
  assignedTo: 'Zugeteilter Mitarbeiter',
};

export interface AblagenFilterBarProps {
  filter: AblagenFilterState;
  onChange: (next: AblagenFilterState) => void;
}

export function AblagenFilterBar({ filter, onChange }: AblagenFilterBarProps): JSX.Element {
  const [advancedAnchor, setAdvancedAnchor] = useState<HTMLElement | null>(null);
  const advancedOpen = advancedAnchor !== null;

  const toggleBereich = (bereich: Bereich): void => {
    const bereiche = filter.bereiche.includes(bereich)
      ? filter.bereiche.filter((b) => b !== bereich)
      : [...filter.bereiche, bereich];
    onChange({ ...filter, bereiche });
  };

  const toggleGoodsType = (goodsType: GoodsTypeText): void => {
    const goodsTypes = filter.goodsTypes.includes(goodsType)
      ? filter.goodsTypes.filter((g) => g !== goodsType)
      : [...filter.goodsTypes, goodsType];
    onChange({ ...filter, goodsTypes });
  };

  const advancedActiveCount =
    filter.bereiche.length +
    filter.goodsTypes.length +
    (filter.deliveryGroup !== 'any' ? 1 : 0) +
    (filter.minQuantity !== null ? 1 : 0) +
    (filter.maxQuantity !== null ? 1 : 0);

  const chips = activeFilterChips(filter);

  return (
    <Stack spacing={1} sx={{ mb: 1.5 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 1,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: 'background.paper',
        }}
      >
        <TextField
          size="small"
          placeholder="WE-Nr, Bereich, Mitarbeiter suchen…"
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          sx={{ flex: '1 1 220px', minWidth: 160 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />

        <QuickChip
          label="Frei"
          active={filter.onlyFree}
          onClick={() => onChange({ ...filter, onlyFree: !filter.onlyFree })}
        />
        <QuickChip
          label="Braucht Entscheidung"
          active={filter.onlyNeedsDecision}
          color="error"
          onClick={() => onChange({ ...filter, onlyNeedsDecision: !filter.onlyNeedsDecision })}
        />
        <QuickChip
          label="Prio"
          active={filter.onlyPrio}
          color="warning"
          onClick={() => onChange({ ...filter, onlyPrio: !filter.onlyPrio })}
        />

        <Badge badgeContent={advancedActiveCount} color="primary" invisible={advancedActiveCount === 0}>
          <Button
            size="small"
            variant={advancedOpen ? 'contained' : 'outlined'}
            startIcon={<TuneIcon fontSize="small" />}
            onClick={(e) => setAdvancedAnchor(advancedOpen ? null : e.currentTarget)}
          >
            Weitere Filter
          </Button>
        </Badge>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            Gruppieren nach
          </Typography>
          <Select
            size="small"
            value={filter.groupBy}
            onChange={(e: SelectChangeEvent) => onChange({ ...filter, groupBy: e.target.value as AblagenGroupBy })}
            sx={{ minWidth: 170 }}
          >
            {(Object.keys(GROUP_BY_LABEL) as AblagenGroupBy[]).map((key) => (
              <MenuItem key={key} value={key}>
                {GROUP_BY_LABEL[key]}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Paper>

      <Popover
        open={advancedOpen}
        anchorEl={advancedAnchor}
        onClose={() => setAdvancedAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack spacing={2} sx={{ p: 2, minWidth: 320, maxWidth: 420 }}>
          <FilterField label="Bereich">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {BEREICHE.map((bereich) => (
                <Chip
                  key={bereich}
                  size="small"
                  label={bereich}
                  color={filter.bereiche.includes(bereich) ? 'primary' : undefined}
                  onClick={() => toggleBereich(bereich)}
                />
              ))}
            </Stack>
          </FilterField>

          <FilterField label="Warenart">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {GOODS_TYPES.map((goodsType) => (
                <Chip
                  key={goodsType}
                  size="small"
                  label={goodsType}
                  color={filter.goodsTypes.includes(goodsType) ? 'primary' : undefined}
                  onClick={() => toggleGoodsType(goodsType)}
                />
              ))}
            </Stack>
          </FilterField>

          <FilterField label="Lieferungs-Gruppe">
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {(
                [
                  { value: 'any', label: 'Alle' },
                  { value: 'only_grouped', label: 'Nur Gruppen' },
                  { value: 'only_single', label: 'Nur Einzel-Belege' },
                ] satisfies { value: DeliveryGroupFilter; label: string }[]
              ).map((opt) => (
                <Chip
                  key={opt.value}
                  size="small"
                  label={opt.label}
                  color={filter.deliveryGroup === opt.value ? 'primary' : undefined}
                  onClick={() => onChange({ ...filter, deliveryGroup: opt.value })}
                />
              ))}
            </Stack>
          </FilterField>

          <FilterField label="Teile-Anzahl">
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                type="number"
                label="Min"
                value={filter.minQuantity ?? ''}
                onChange={(e) => onChange({ ...filter, minQuantity: parseOptionalInt(e.target.value) })}
                sx={{ width: 100 }}
              />
              <TextField
                size="small"
                type="number"
                label="Max"
                value={filter.maxQuantity ?? ''}
                onChange={(e) => onChange({ ...filter, maxQuantity: parseOptionalInt(e.target.value) })}
                sx={{ width: 100 }}
              />
            </Stack>
          </FilterField>
        </Stack>
      </Popover>

      {isFilterActive(filter) && (
        <Stack direction="row" flexWrap="wrap" alignItems="center" gap={0.75}>
          <Typography variant="caption" color="text.secondary">
            Aktive Filter:
          </Typography>
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              size="small"
              label={chip.label}
              onDelete={() => onChange(removeFilterChip(filter, chip.key))}
              deleteIcon={<CloseIcon fontSize="small" />}
            />
          ))}
          <Button size="small" onClick={() => onChange({ ...filter, ...CLEARED_FIELDS })}>
            Alle zurücksetzen
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

/** The subset of {@link AblagenFilterState} that "Alle zurücksetzen" clears — groupBy is a display preference, not a filter, and survives a reset. */
const CLEARED_FIELDS: Omit<AblagenFilterState, 'groupBy'> = {
  search: '',
  onlyFree: false,
  onlyNeedsDecision: false,
  onlyPrio: false,
  bereiche: [],
  goodsTypes: [],
  deliveryGroup: 'any',
  minQuantity: null,
  maxQuantity: null,
};

function parseOptionalInt(raw: string): number | null {
  if (raw.trim() === '') return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : Math.max(0, parsed);
}

function QuickChip({
  label,
  active,
  onClick,
  color = 'primary',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: 'primary' | 'warning' | 'error';
}): JSX.Element {
  return (
    <Chip
      size="small"
      label={label}
      color={active ? color : undefined}
      variant={active ? 'filled' : 'outlined'}
      onClick={onClick}
      sx={{ fontWeight: 600 }}
    />
  );
}

function FilterField({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      {children}
    </Stack>
  );
}
