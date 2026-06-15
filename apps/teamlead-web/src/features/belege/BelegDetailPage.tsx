/**
 * Belegdetails (§10.4): Kopf, Priorität, Aufwand, Positionen+SKU, Boxen,
 * Historie (alle Events / manuelle Eingriffe / ZST / Issues) und
 * Originaldokumente. Teamlead actions (Priorisieren/Parken) are audited (§8.4).
 */
import { useState, type JSX, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { CaseStatusChip, PriorityChip, ProblemChip } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import {
  getBoxesForCase,
  getCaseById,
  getDocumentsForCase,
  getHistoryForCase,
  getIssuesForCase,
  getPositionsForCase,
} from '../../data/selectors.js';
import { formatDate, formatDateTime, formatMinutes } from '../../lib/format.js';
import { ReasonDialog } from '../../components/ReasonDialog.js';

const TABS = ['Kopf', 'Priorität', 'Aufwand', 'Positionen', 'Boxen', 'Historie', 'Dokumente'];

export function BelegDetailPage(): JSX.Element {
  const { caseId = '' } = useParams();
  const { dataset, prioritiseCase, parkCase } = useCockpitData();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [pending, setPending] = useState<{ title: string; run: (r: string) => void } | null>(null);

  const c = getCaseById(dataset, caseId);
  if (!c) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5">Beleg nicht gefunden</Typography>
        <Button onClick={() => navigate('/belege')}>Zur Belegliste</Button>
      </Stack>
    );
  }

  const positions = getPositionsForCase(dataset, caseId);
  const boxes = getBoxesForCase(dataset, caseId);
  const history = getHistoryForCase(dataset, caseId);
  const documents = getDocumentsForCase(dataset, caseId);
  const issues = getIssuesForCase(dataset, caseId);

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={1}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {c.weBelegNo}
          </Typography>
          <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <CaseStatusChip status={c.status} size="small" />
            {c.priorityFlags.map((f) => (
              <PriorityChip key={f} flag={f} size="small" />
            ))}
            {issues.some((i) => i.status === 'open' || i.status === 'in_review') && (
              <ProblemChip status="open" size="small" />
            )}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() =>
              setPending({
                title: `Beleg ${c.weBelegNo} priorisieren`,
                run: (r) => prioritiseCase(c.id, r),
              })
            }
          >
            Priorisieren
          </Button>
          <Button
            variant="outlined"
            color="warning"
            onClick={() =>
              setPending({ title: `Beleg ${c.weBelegNo} parken`, run: (r) => parkCase(c.id, r) })
            }
          >
            Parken
          </Button>
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {TABS.map((t) => (
          <Tab key={t} label={t} />
        ))}
      </Tabs>

      <Paper variant="outlined" sx={{ p: 2 }}>
        {tab === 0 && (
          <FieldGrid
            rows={[
              ['WE-Belegnummer', c.weBelegNo],
              ['Lieferschein', c.deliveryNoteNo ?? '–'],
              ['Buchungsdatum', formatDate(c.bookingDate)],
              ['Lagerplatz', c.storageLocation.code],
              ['Shopbereich', c.primaryShopAreaNo ?? '–'],
              ['Etage', c.primaryFloor ?? '–'],
              ['Belegmenge', String(c.totalQuantity)],
            ]}
          />
        )}
        {tab === 1 && (
          <FieldGrid
            rows={[
              ['Abschnitt', c.section === null ? '– (Prio ist kein Abschnitt)' : String(c.section)],
              ['Prio-Flags', c.priorityFlags.join(', ') || '–'],
              ['CatMan-Datum', formatDate(c.catManDate)],
              ['Verladetag', formatDate(c.loadPlanDate)],
              ['Warenart', c.goodsTypeText ?? '–'],
            ]}
          />
        )}
        {tab === 2 && (
          <FieldGrid
            rows={[
              ['Aufwandspunkte', String(c.effortPoints)],
              ['Geschätzte Minuten', formatMinutes(c.estimatedMinutes)],
              ['Menge (Aufwandstreiber)', String(c.totalQuantity)],
              [
                'Preisetikett-Positionen',
                String(positions.filter((p) => p.instruction.priceLabelRequired).length),
              ],
              [
                'Sicherungs-Positionen',
                String(positions.filter((p) => p.instruction.securityRequired).length),
              ],
              [
                'Online-Positionen',
                String(positions.filter((p) => p.instruction.onlineHandlingRequired).length),
              ],
            ]}
          />
        )}
        {tab === 3 && <PositionsTab positions={positions} />}
        {tab === 4 && <BoxesTab boxes={boxes} />}
        {tab === 5 && <HistoryTab history={history} />}
        {tab === 6 && <DocumentsTab documents={documents} />}
      </Paper>

      <ReasonDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        onConfirm={(reason) => pending?.run(reason)}
        onClose={() => setPending(null)}
      />
    </Stack>
  );
}

function FieldGrid({ rows }: { rows: [string, ReactNode][] }): JSX.Element {
  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 2 }}
    >
      {rows.map(([label, value]) => (
        <Box key={label}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function PositionsTab({
  positions,
}: {
  positions: ReturnType<typeof getPositionsForCase>;
}): JSX.Element {
  if (positions.length === 0) return <Empty text="Keine Positionen erfasst." />;
  return (
    <Stack spacing={2}>
      {positions.map((p) => (
        <Box key={p.id}>
          <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap">
            <Typography sx={{ fontWeight: 700 }}>
              Position {p.positionNo} · WGR {p.wgr} · {p.supplierColor}
            </Typography>
            {p.instruction.priceLabelRequired && <Chip size="small" label="Etikett" />}
            {p.instruction.securityRequired && (
              <Chip size="small" color="warning" label="Sichern" />
            )}
            {p.instruction.onlineHandlingRequired && <Chip size="small" label="Online" />}
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>EAN</TableCell>
                <TableCell>Größe</TableCell>
                <TableCell align="right">Soll</TableCell>
                <TableCell align="right">Ist</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {p.skuLines.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.ean}</TableCell>
                  <TableCell>{s.size}</TableCell>
                  <TableCell align="right">{s.expectedQuantity}</TableCell>
                  <TableCell align="right">{s.confirmedQuantity ?? '–'}</TableCell>
                  <TableCell>{s.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ))}
    </Stack>
  );
}

function BoxesTab({ boxes }: { boxes: ReturnType<typeof getBoxesForCase> }): JSX.Element {
  if (boxes.length === 0) return <Empty text="Noch keine Transportboxen berechnet." />;
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Box</TableCell>
          <TableCell>Shopbereich</TableCell>
          <TableCell>Etage</TableCell>
          <TableCell align="right">Menge</TableCell>
          <TableCell>Boxzettel</TableCell>
          <TableCell>Plombe</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {boxes.map((b) => (
          <TableRow key={b.id}>
            <TableCell>#{b.boxNo}</TableCell>
            <TableCell>{b.shopAreaNo}</TableCell>
            <TableCell>{b.floor ?? '–'}</TableCell>
            <TableCell align="right">{b.quantity}</TableCell>
            <TableCell>{b.labelPrinted ? 'Gedruckt' : 'Offen'}</TableCell>
            <TableCell>{b.sealed ? 'Versiegelt' : 'Offen'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HistoryTab({ history }: { history: ReturnType<typeof getHistoryForCase> }): JSX.Element {
  if (history.length === 0) return <Empty text="Keine Ereignisse." />;
  return (
    <Stack spacing={0.5}>
      {history.map((e) => {
        const payload = e.payload as { reason?: string } | undefined;
        return (
          <Typography key={e.id} variant="body2">
            <strong>{formatDateTime(e.timestamp)}</strong> · {e.eventType} · {e.actorType}
            {payload?.reason ? ` – „${payload.reason}"` : ''}
          </Typography>
        );
      })}
    </Stack>
  );
}

function DocumentsTab({
  documents,
}: {
  documents: ReturnType<typeof getDocumentsForCase>;
}): JSX.Element {
  if (documents.length === 0) return <Empty text="Keine Originaldokumente verknüpft." />;
  const labels: Record<string, string> = {
    work_instruction: 'Arbeitsanweisung',
    goods_receipt: 'WE-Beleg',
    delivery_note: 'Lieferschein',
  };
  return (
    <Stack spacing={1}>
      {documents.map((d) => (
        <Stack key={d.id} direction="row" spacing={1} alignItems="center">
          <Chip size="small" label={labels[d.kind] ?? d.kind} />
          <Link href={d.url}>{d.fileName}</Link>
        </Stack>
      ))}
    </Stack>
  );
}

function Empty({ text }: { text: string }): JSX.Element {
  return (
    <Typography color="text.secondary" sx={{ py: 1 }}>
      {text}
    </Typography>
  );
}
