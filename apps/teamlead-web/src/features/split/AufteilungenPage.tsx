/**
 * Aufteilungen / Leistung (UX mockup #3). Lists the manual splits committed this
 * session with the combined Beleg figure plus each employee's share (getrennt vs.
 * anteilig), and offers the per-share CSV export. Persistence + measured ZST are
 * deferred to the backend; this is the planned-split view.
 */
import { useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import { formatMinutes, formatNumber } from '../../lib/format.js';
import { useSplits, type RecordedSplit } from './SplitProvider.js';
import type { CaptureMode } from './splitMath.js';
import { splitsToCsv } from './splitCsv.js';

/** Wie der Anteil eines Mitarbeiters an einem geteilten Beleg erfasst wurde. */
const CAPTURE_MODE_LABELS: Record<CaptureMode, string> = {
  getrennt: 'getrennt erfasst',
  anteilig: 'anteilig angerechnet',
};

function downloadCsv(splits: readonly RecordedSplit[]): void {
  const csv = splitsToCsv(splits);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'beleg-splits.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function AufteilungenPage(): JSX.Element {
  const { splits } = useSplits();
  const [downloaded, setDownloaded] = useState(false);

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Aufteilungen &amp; Leistung
          </Typography>
          <Typography color="text.secondary">
            Manuell auf mehrere Mitarbeitende verteilte Belege — Leistung je Anteil.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          disabled={splits.length === 0}
          onClick={() => {
            downloadCsv(splits);
            setDownloaded(true);
          }}
        >
          ZST-/CSV-Export
        </Button>
      </Stack>

      {downloaded && splits.length > 0 && (
        <Alert severity="success" onClose={() => setDownloaded(false)}>
          CSV exportiert — eine Zeile je Anteil plus Beleg-Summenzeile (Aggregat).
        </Alert>
      )}

      {splits.length === 0 ? (
        <Alert severity="info">
          Noch keine Aufteilungen. Im Tab <strong>Belege</strong> einen Beleg über „Aufteilen …" auf
          mehrere Mitarbeitende verteilen.
        </Alert>
      ) : (
        splits.map((split) => <SplitLeistungCard key={split.id} split={split} />)
      )}
    </Stack>
  );
}

function SplitLeistungCard({ split }: { split: RecordedSplit }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Stack
        direction="row"
        alignItems="center"
        gap={1.5}
        flexWrap="wrap"
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', color: 'primary.main' }}>
          {split.weBelegNo}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatNumber(split.totalQuantity)} Teile · {split.shares.length} Anteile ·{' '}
          {CAPTURE_MODE_LABELS[split.captureMode]}
        </Typography>
        <Box sx={{ ml: 'auto' }}>
          <Chip
            size="small"
            color={split.isComplete ? 'success' : 'warning'}
            label={split.isComplete ? '✓ vollständig aufgeteilt' : 'Teil-Aufteilung · Rest offen'}
          />
        </Box>
      </Stack>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Mitarbeiter:in</TableCell>
            <TableCell>Erfassung</TableCell>
            <TableCell align="right">Menge</TableCell>
            <TableCell align="right">Anteil</TableCell>
            <TableCell align="right">Aufwandspunkte</TableCell>
            <TableCell align="right">Dauer</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {split.shares.map((s) => (
            <TableRow key={s.employeeId}>
              <TableCell sx={{ fontWeight: 600 }}>{s.employeeName}</TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" label={CAPTURE_MODE_LABELS[split.captureMode]} />
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(s.quantity)}
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {s.sharePct.toLocaleString('de-DE')} %
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {s.effortPoints.toLocaleString('de-DE')}
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatMinutes(s.estimatedMinutes)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow
            sx={{
              '& td': {
                fontWeight: 800,
                bgcolor: 'action.hover',
                borderTop: '2px solid',
                borderColor: 'primary.main',
              },
            }}
          >
            <TableCell>Beleg gesamt (Aggregat)</TableCell>
            <TableCell />
            <TableCell align="right">{formatNumber(split.totalQuantity)}</TableCell>
            <TableCell align="right">100 %</TableCell>
            <TableCell align="right">{split.effortPoints.toLocaleString('de-DE')}</TableCell>
            <TableCell align="right">{formatMinutes(split.estimatedMinutes)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 1 }}>
        Grund: „{split.reason}"
      </Typography>
    </Paper>
  );
}
