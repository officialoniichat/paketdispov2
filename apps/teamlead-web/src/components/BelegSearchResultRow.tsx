/**
 * One compact result row shared by AssignDialog's live-search dropdown and its
 * "Durchsuchen" browse drawer (A1/A2/B1) — one visual so both entry points render
 * search/browse hits identically.
 */
import type { JSX } from 'react';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { BelegInfoChips } from './BelegInfoChips.js';
import { LieferungChip } from './LieferungChip.js';
import type { CaseSearchResult } from '../data/belege.js';

export interface BelegSearchResultRowProps {
  result: CaseSearchResult;
  /** Present in the autocomplete dropdown: click/Enter adds this row directly. */
  onSelect?: () => void;
  /** Highlighted via keyboard navigation (dropdown only). */
  highlighted?: boolean;
  /** Present in the browse drawer: a checkbox instead of click-to-add. */
  checkbox?: { checked: boolean; onChange: (checked: boolean) => void };
}

export function BelegSearchResultRow({
  result,
  onSelect,
  highlighted = false,
  checkbox,
}: BelegSearchResultRowProps): JSX.Element {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="flex-start"
      onClick={onSelect}
      sx={{
        p: 1,
        cursor: onSelect ? 'pointer' : 'default',
        bgcolor: highlighted ? 'action.selected' : undefined,
        '&:hover': onSelect ? { bgcolor: 'action.hover' } : undefined,
      }}
    >
      {checkbox && (
        <Checkbox
          size="small"
          sx={{ p: 0.25 }}
          checked={checkbox.checked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => checkbox.onChange(e.target.checked)}
          inputProps={{ 'aria-label': `${result.weBelegNo} auswählen` }}
        />
      )}
      <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography sx={{ fontWeight: 700 }}>{result.weBelegNo}</Typography>
          {result.bereich && <Chip size="small" variant="outlined" label={result.bereich} />}
          <Chip size="small" variant="outlined" label={`${result.teile} Teile`} />
          <LieferungChip group={result.deliveryGroup} />
          {result.priorityFlags.length > 0 && (
            <Chip size="small" color="warning" variant="outlined" label="Prio" />
          )}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {result.storageLocationCode ?? '–'}
          </Typography>
        </Stack>
        {/* Zeilen-Infos (Kundenfeedback 07.08.2026): dieselbe Komponente und damit
            dieselbe Optik wie auf den Karten der Digitalen Ablage. */}
        <BelegInfoChips
          branchNo={result.branchNo}
          shopNos={result.shopNos}
          labelPrintVariants={result.labelPrintVariants}
          securityRequired={result.securityRequired}
        />
      </Stack>
    </Stack>
  );
}
