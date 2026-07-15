/**
 * PROCESS phase — the single per-Beleg work screen.
 *
 * The WE Beleg-Nr. is the hero (C1); the Kopf shows Kartons (C2) and the
 * Warenart wording instead of Abschnitt numbers (C3). The Arbeitsanweisung is
 * ordered Prüfung Wareneingang → Rotpreis → Boxzettel (C4); the Prüfstufe is
 * explained in a tooltip on an info icon (C5). Positions carry the Preisetikett
 * placement with the Sicherungsetikett pictogram (C6).
 *
 * Positions are ONE table with a STICKY column header (A1 + Kundenfeedback
 * 14.07.2026, Punkt 3), so every Größe-row carries its values at the same
 * x-position and EK/VK/VK-Etikett/Etikettpreis sit right-aligned at the right
 * edge. Each Größe is its own row with +/- Mehr-/Mindermengen capture (D2) and
 * the Etikettpreis input (Punkt 4). Die Positions-Kopfzelle stapelt unter der
 * Pos-Nr. die Kontextfelder (Nachtrag 15.07.2026): HS, Shop, CatMan-Termin,
 * Etage, Filiale, Shopbereich. Der frühere Boxzettel-Abschnitt entfällt — seine
 * Infos (Filiale, Shopbereich, Shop, Etage, Warenart) stehen jetzt an der
 * Position; die Ordernummer ist nur noch in der Teamlead-UX sichtbar.
 *
 * Probleme werden pro Position/Größe im Dialog erfasst (Punkt 5), lokal
 * gesammelt und farblich markiert (Punkt 9); der beleg-weite Problem-Einstieg
 * ist entfallen (Punkt 8). Eine Mehr-/Minderlieferung oder Preisabweichung ist
 * automatisch ein Problem (Punkt 7): „Beleg erledigt" ist dann gesperrt, nur der
 * Teilabschluss (mit gesammelten Problemen, Punkt 10) bleibt.
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { DEFAULT_WGR_CATALOG, type OnlineSizeMark } from '@paket/domain-types';
import { CaseCardSkeleton, touchTarget } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { ProblemDialog } from '../components/ProblemDialog.js';
import { TeilabschlussDialog } from '../components/TeilabschlussDialog.js';
import { apiBaseUrl } from '../data/api.js';
import type { PositionView } from '../domain/types.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { canCompleteCase } from '../workflow/workflowModel.js';
import { TAGESSTART } from '../routes/paths.js';

/**
 * Arbeitsanweisung points that are already performed via dedicated controls
 * ("Beleg erledigt" sets the ZST) or are upstream (printing is vorgelagert, C4)
 * — hidden from the read-only Arbeitsanweisung list.
 */
const ACTION_POINT_KEYS = new Set(['price_label_print', 'price_label_attach', 'zst']);

/**
 * C4 display order: Sortieren, Prüfung, Sicherungsetikett, Rotpreis, Boxzettel.
 * Unlisted keys (Online) sort last.
 */
const POINT_DISPLAY_ORDER: Record<string, number> = {
  sort: 0,
  goods_receipt_check: 1,
  security: 2,
  red_price: 3,
  box_label: 4,
  online_handling: 5,
};

/** German labels of the Sicherungstyp pictograms (mirrors the backend assets). */
const PICTOGRAM_LABEL: Record<string, string> = {
  'hard-tag': 'Hartetikett',
  'ink-tag': 'Farbetikett',
  'spider-wrap': 'Spinnensicherung',
  'safer-box': 'Safer-Box',
  'cable-lock': 'Kabelschloss',
};

/** WGR-Klartext (D3) — resolved from the same mock master data the backend uses. */
const WGR_DESCRIPTION = new Map(DEFAULT_WGR_CATALOG.map((e) => [e.wgr, e.description]));

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const CATMAN_DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Format a price, or empty when the mock ERP did not deliver one. */
function price(value: number | undefined): string | null {
  return typeof value === 'number' ? EUR.format(value) : null;
}

/** Format an ISO day as a German date, or null when absent. */
function catManDateLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : CATMAN_DATE.format(d);
}

/** D4: chip colour + wording of the Online-Größen-Markierung. */
const ONLINE_MARK: Record<OnlineSizeMark, { label: string; color: 'success' | 'error' }> = {
  green: { label: 'Onlineartikel-Highlight', color: 'success' },
  red: { label: 'Onlineartikel', color: 'error' },
};

/** Pictogram asset URL (backend-served); undefined in offline-demo mode. */
function pictogramUrl(code: string): string | undefined {
  return apiBaseUrl ? `${apiBaseUrl}/static/pictograms/${code}.svg` : undefined;
}

const FLAG_CHIPS = [
  { key: 'priceLabelRequired', label: '🏷️ Etikett', color: 'default' as const },
  { key: 'securityRequired', label: '🔒 Sicherung', color: 'warning' as const },
  { key: 'onlineHandlingRequired', label: '🌐 Online', color: 'info' as const },
  { key: 'redPriceRequired', label: '🔴 Rotpreis', color: 'error' as const },
] as const;

/** Eine Spalte der Positionen-Tabelle; `weight` wird zur Prozentbreite normalisiert. */
interface PositionColumn {
  key: string;
  label: string;
  align?: 'right' | 'center';
  weight: number;
}

/**
 * Feste Spalten der Positionen-Tabelle (A1). Die Online-Spalte entfällt, wenn der
 * Beleg keine online-relevante Position hat — innerhalb eines Belegs bleibt die
 * Geometrie damit konstant. „Etikettpreis" steht direkt hinter „VK-Etikett".
 */
function positionColumns(hasOnlineMarks: boolean): PositionColumn[] {
  const columns: PositionColumn[] = [
    { key: 'pos', label: 'Pos', weight: 7 },
    { key: 'ean', label: 'EAN', weight: 12 },
    { key: 'size', label: 'Größe', weight: 6 },
    { key: 'expected', label: 'Soll', align: 'right', weight: 5 },
    { key: 'actual', label: 'Ist', align: 'center', weight: 13 },
    { key: 'deviation', label: 'Mehr-/Mindermenge', weight: 13 },
    { key: 'ek', label: 'EK', align: 'right', weight: 9 },
    { key: 'vk', label: 'VK', align: 'right', weight: 9 },
    { key: 'vkLabel', label: 'VK-Etikett', align: 'right', weight: 10 },
    { key: 'vkCorrected', label: 'Etikettpreis', align: 'right', weight: 13 },
  ];
  if (hasOnlineMarks) columns.splice(3, 0, { key: 'online', label: 'Online', weight: 11 });
  return columns;
}

/** Ziffern in Zahlenspalten laufen einspurig, sonst wandert das Komma je Zeile. */
const NUMERIC_CELL = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

/** Die Tabelle wird dichter, die Touch-Ziele nicht: bedient wird ggf. mit Handschuhen. */
const TOUCH_TARGET_MIN = touchTarget.min;

const STEPPER_BUTTON = {
  width: TOUCH_TARGET_MIN,
  height: TOUCH_TARGET_MIN,
  fontSize: '1.5rem',
  fontWeight: 700,
  border: '1px solid',
  borderColor: 'divider',
} as const;

export function BelegProcessScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);
  const [partialOpen, setPartialOpen] = useState(false);
  const [problemTarget, setProblemTarget] = useState<PositionView | null>(null);

  if (flow.isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={flow.refetch}>
              Erneut versuchen
            </Button>
          }
        >
          Verbindung fehlgeschlagen. Bitte erneut versuchen.
        </Alert>
      </Box>
    );
  }

  if (flow.loading || !flow.aggregate || !flow.progress) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton />
      </Box>
    );
  }

  const { aggregate, progress } = flow;
  const wi = aggregate.workInstruction;
  const gate = canCompleteCase(progress, aggregate);
  // Teilabschluss ist nur möglich, wenn mindestens ein Problem vorliegt (das
  // Backend würde sonst ablehnen). Ein Problem = manuell erfasst ODER implizit
  // (Mengen-/Preisabweichung).
  const problemCount =
    progress.problems.length +
    Object.keys(progress.confirmedQuantities).length +
    Object.keys(progress.correctedVkPrices).length;
  const checked = new Set(progress.quantityCheckedPositionIds);
  const infoPoints = [...aggregate.instructionPoints]
    .filter((p) => !ACTION_POINT_KEYS.has(p.key))
    .sort((a, b) => (POINT_DISPLAY_ORDER[a.key] ?? 99) - (POINT_DISPLAY_ORDER[b.key] ?? 99));
  const c = aggregate.case;
  const positionWarenart = (pos: PositionView): string | undefined =>
    pos.nosFlag ? 'NOS' : (c.goodsTypeText ?? undefined);
  // Manuell erfasste Probleme je Position (für die farbliche Markierung, Punkt 9).
  const manualByPosition = new Map<string, typeof progress.problems>();
  for (const problem of progress.problems) {
    manualByPosition.set(problem.positionId, [
      ...(manualByPosition.get(problem.positionId) ?? []),
      problem,
    ]);
  }

  const hasOnlineMarks = aggregate.positions.some((pos) =>
    pos.skuLines.some((s) => aggregate.onlineMarks[s.id]),
  );
  const columns = positionColumns(hasOnlineMarks);
  const totalWeight = columns.reduce((sum, col) => sum + col.weight, 0);
  const widthOf = (col: PositionColumn): string =>
    `${((col.weight / totalWeight) * 100).toFixed(3)}%`;

  const finish = async (): Promise<void> => {
    const ok = await flow.complete();
    if (ok) navigate(TAGESSTART);
  };

  const confirmPartial = async (): Promise<void> => {
    const ok = await flow.partialComplete();
    if (ok) {
      setPartialOpen(false);
      navigate(TAGESSTART);
    }
  };

  return (
    <StepScaffold
      where={aggregate.case.storageLocation?.code ?? '—'}
      title={`WE ${aggregate.case.weBelegNo}`}
      subtitle={
        c.inboundCartonCount != null
          ? `📦 ${c.inboundCartonCount} Karton${c.inboundCartonCount === 1 ? '' : 's'} – alle auf dem Karren suchen!`
          : undefined
      }
      onBack={() => navigate(TAGESSTART)}
      primary={{ label: 'Beleg erledigt', onClick: finish, disabled: !gate.ok }}
      secondary={{
        label: 'Teilabschluss (Problem melden)',
        onClick: () => setPartialOpen(true),
        disabled: problemCount === 0,
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          {c.goodsTypeText ? (
            <Chip color="secondary" sx={{ fontWeight: 700 }} label={c.goodsTypeText} />
          ) : null}
          <Typography sx={{ fontWeight: 600 }}>{c.totalQuantity} Teile</Typography>
        </Stack>

        {/* Arbeitsanweisung — faithful ordered points minus the upstream/ZST ones. */}
        {infoPoints.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Arbeitsanweisung
            </Typography>
            <Stack spacing={0.75}>
              {infoPoints.map((point, index) => {
                const isInspection = point.key === 'goods_receipt_check';
                return (
                  <Box key={point.key} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, minWidth: 22, color: 'text.secondary' }}
                    >
                      {index + 1}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        {point.label}
                        {isInspection && aggregate.inspectionLevelLabel
                          ? ` · ${aggregate.inspectionLevelLabel}`
                          : ''}
                        {isInspection && aggregate.inspectionDescription ? (
                          <Tooltip
                            title={aggregate.inspectionDescription}
                            arrow
                            enterTouchDelay={0}
                            leaveTouchDelay={8000}
                          >
                            <InfoOutlinedIcon
                              fontSize="small"
                              tabIndex={0}
                              aria-label={`Was heißt das? ${aggregate.inspectionDescription}`}
                              sx={{ color: 'text.secondary', cursor: 'help', p: '6px', boxSizing: 'content-box' }}
                            />
                          </Tooltip>
                        ) : null}
                      </Typography>
                      {!(isInspection && aggregate.inspectionLevelLabel === point.value) ? (
                        <Typography variant="body2" color="text.secondary">
                          {point.value}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        ) : null}

        <Typography variant="subtitle2">Positionen</Typography>
        {wi.goodsReceiptCheckMode === 'quantity_only' ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
            Jede Position prüfen – auch bei Prüfung Wareneingang = „Nein".
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
          Dieser Fortschritt geht beim Neuladen der Seite verloren – erst „Beleg erledigt" oder der
          Teilabschluss sichert ihn dauerhaft.
        </Typography>
        {/* A1: EINE Tabelle über alle Positionen mit STICKY Kopfzeile (Punkt 3). Die
            Tabelle scrollt vertikal in ihrem Container; die Spaltenüberschriften
            bleiben oben stehen. EK/VK/VK-Etikett/Etikettpreis stehen rechts. */}
        <Paper variant="outlined">
          <TableContainer sx={{ overflowX: 'auto', maxHeight: 'calc(100dvh - 340px)' }}>
            <Table
              stickyHeader
              aria-label="Positionen"
              sx={{
                tableLayout: 'fixed',
                minWidth: 1440,
                '& .MuiTableCell-root': { fontSize: '1.0625rem', py: 1 },
              }}
            >
              <colgroup>
                {columns.map((col) => (
                  <col key={col.key} style={{ width: widthOf(col) }} />
                ))}
              </colgroup>
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align}
                      sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              {aggregate.positions.map((pos) => {
                const soll = pos.skuLines.reduce((sum, s) => sum + s.expectedQuantity, 0);
                const isChecked = checked.has(pos.id);
                const flags = FLAG_CHIPS.filter(
                  (f) => (pos.instruction as Record<string, unknown>)[f.key] === true,
                );
                const i = pos.instruction;
                const manualProblems = manualByPosition.get(pos.id) ?? [];
                const catManLabel = catManDateLabel(pos.catManDate);
                // Positions-Kontext als horizontale Meta-Zeile unter dem Artikeltitel
                // (Nachtrag 15.07.2026): HS · Shop · Etage · Filiale · Bereich, CatMan als Chip.
                const metaText = [
                  pos.hShopNo ? `HS ${pos.hShopNo}` : null,
                  `Shop ${pos.shopNo}`,
                  pos.floor ? `Etage ${pos.floor}` : null,
                  pos.branchNo ? `Filiale ${pos.branchNo}` : null,
                  c.primaryShopAreaNo ? `Bereich ${c.primaryShopAreaNo}` : null,
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ');
                const catManChipLabel = catManLabel ?? (pos.catMan ? 'Termin' : null);
                const instructionLines = [
                  i.priceLabelAttachLocation ? `Etikett anbringen: ${i.priceLabelAttachLocation}` : null,
                  i.securityRequired && i.securityLocation ? `Sichern: ${i.securityLocation}` : null,
                  i.onlineHandlingRequired && i.onlineHandlingLocation
                    ? `Online: ${i.onlineHandlingLocation}`
                    : null,
                  i.notes ? `Hinweis: ${i.notes}` : null,
                ].filter((line): line is string => line !== null);
                return (
                  <TableBody key={pos.id}>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.15 }}>
                          Pos {pos.positionNo}
                        </Typography>
                      </TableCell>
                      <TableCell colSpan={columns.length - 1} sx={{ verticalAlign: 'top' }}>
                        <Stack
                          direction="row"
                          spacing={2}
                          justifyContent="space-between"
                          alignItems="flex-start"
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                              {/* D3: Artikel-Nr. + Farbe in derselben Schriftgröße. */}
                              <Typography sx={{ fontWeight: 700 }}>
                                {pos.supplierArticleNo} · {pos.supplierColor}
                              </Typography>
                              {pos.nosFlag ? <Chip size="small" color="success" label="♻️ NOS" /> : null}
                              {!pos.nosFlag && positionWarenart(pos) ? (
                                <Chip
                                  size="small"
                                  color="secondary"
                                  variant="outlined"
                                  label={positionWarenart(pos)}
                                />
                              ) : null}
                              {flags.map((f) => (
                                <Chip key={f.key} size="small" color={f.color} label={f.label} />
                              ))}
                            </Stack>

                            {/* Warenbezeichnung: WGR mit Klartext (+ Saison). */}
                            <Typography variant="body2" color="text.secondary">
                              WGR {pos.wgr}
                              {WGR_DESCRIPTION.get(pos.wgr) ? ` ${WGR_DESCRIPTION.get(pos.wgr)}` : ''}
                              {pos.season ? ` · Saison ${pos.season}` : ''}
                            </Typography>

                            {/* Nachtrag 15.07.2026: Positions-Kontext als horizontale
                                Meta-Zeile — HS · Shop · Etage · Filiale · Bereich, CatMan als Chip. */}
                            <Stack
                              direction="row"
                              alignItems="center"
                              sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.75 }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {metaText}
                              </Typography>
                              {catManChipLabel ? (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  label={`📅 ${catManChipLabel}`}
                                  sx={{ height: 22, '& .MuiChip-label': { px: 0.75 } }}
                                />
                              ) : null}
                            </Stack>

                            {instructionLines.length > 0 || (i.securityRequired && i.securityTypeCode) ? (
                              <Stack
                                direction="row"
                                alignItems="center"
                                sx={{ mt: 0.5, flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}
                              >
                                {i.securityRequired && i.securityTypeCode ? (
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    {pictogramUrl(i.securityTypeCode) ? (
                                      <Box
                                        component="img"
                                        src={pictogramUrl(i.securityTypeCode)}
                                        alt={PICTOGRAM_LABEL[i.securityTypeCode] ?? i.securityTypeCode}
                                        sx={{ width: 40, height: 40 }}
                                      />
                                    ) : null}
                                    <Typography variant="body2" color="text.secondary">
                                      Sicherungstyp: {PICTOGRAM_LABEL[i.securityTypeCode] ?? i.securityTypeCode}
                                    </Typography>
                                  </Stack>
                                ) : null}
                                {instructionLines.map((line) => (
                                  <Typography key={line} variant="body2" color="text.secondary">
                                    {line}
                                  </Typography>
                                ))}
                              </Stack>
                            ) : null}

                            {/* Punkt 9: farbliche Markierung der erfassten manuellen Probleme. */}
                            {manualProblems.length > 0 ? (
                              <Stack direction="row" sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                                {manualProblems.map((problem) => (
                                  <Chip
                                    key={problem.id}
                                    size="small"
                                    color="error"
                                    variant="filled"
                                    label={problem.note ? `${problem.reasonLabel}: ${problem.note}` : problem.reasonLabel}
                                    onDelete={() => flow.removeProblem(problem.id)}
                                  />
                                ))}
                              </Stack>
                            ) : null}
                          </Box>

                          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                            <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                              Soll gesamt {soll}
                            </Typography>
                            {isChecked ? (
                              <Chip
                                color="success"
                                label="Position geprüft ✓"
                                onClick={() => void flow.togglePositionChecked(pos.id)}
                                sx={{ height: TOUCH_TARGET_MIN, fontSize: '1rem', px: 0.5 }}
                              />
                            ) : (
                              <Button variant="contained" onClick={() => void flow.togglePositionChecked(pos.id)}>
                                Position geprüft
                              </Button>
                            )}
                            <Button color="error" variant="text" onClick={() => setProblemTarget(pos)}>
                              Problem
                            </Button>
                          </Stack>
                        </Stack>
                      </TableCell>
                    </TableRow>

                    {pos.skuLines.map((s) => {
                      const ist = progress.confirmedQuantities[s.id] ?? s.expectedQuantity;
                      const delta = ist - s.expectedQuantity;
                      const mark = aggregate.onlineMarks[s.id];
                      const corrected = progress.correctedVkPrices[s.id];
                      const hasPriceProblem = corrected !== undefined;
                      // Punkt 9: Zeile mit Abweichung/Preisproblem rot hinterlegen.
                      const rowProblem = delta !== 0 || hasPriceProblem;
                      return (
                        <TableRow
                          key={s.id}
                          hover
                          sx={
                            rowProblem
                              ? {
                                  bgcolor: 'rgba(211, 47, 47, 0.08)',
                                  borderLeft: '3px solid',
                                  borderLeftColor: 'error.main',
                                }
                              : undefined
                          }
                        >
                          <TableCell />
                          <TableCell sx={NUMERIC_CELL}>{s.ean}</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{s.size}</TableCell>
                          {hasOnlineMarks ? (
                            <TableCell>
                              {mark ? (
                                <Chip size="small" color={ONLINE_MARK[mark].color} label={ONLINE_MARK[mark].label} />
                              ) : null}
                            </TableCell>
                          ) : null}
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {s.expectedQuantity}
                          </TableCell>
                          <TableCell align="center">
                            <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                              <IconButton
                                sx={STEPPER_BUTTON}
                                aria-label={`Größe ${s.size}: Menge verringern`}
                                onClick={() => void flow.setSkuQuantity(s.id, ist - 1, s.expectedQuantity)}
                              >
                                −
                              </IconButton>
                              <Typography
                                sx={{
                                  ...NUMERIC_CELL,
                                  minWidth: 36,
                                  fontWeight: 700,
                                  fontSize: '1.0625rem',
                                  color: delta !== 0 ? 'error.main' : 'text.primary',
                                }}
                              >
                                {ist}
                              </Typography>
                              <IconButton
                                sx={STEPPER_BUTTON}
                                aria-label={`Größe ${s.size}: Menge erhöhen`}
                                onClick={() => void flow.setSkuQuantity(s.id, ist + 1, s.expectedQuantity)}
                              >
                                +
                              </IconButton>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {delta !== 0 ? (
                              <Chip
                                size="small"
                                color="warning"
                                label={delta > 0 ? `+${delta} Mehrmenge` : `−${Math.abs(delta)} Mindermenge`}
                              />
                            ) : null}
                          </TableCell>
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {price(s.ekPrice) ?? '—'}
                          </TableCell>
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {price(s.vkPrice) ?? '—'}
                          </TableCell>
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {price(s.vkLabelPrice) ?? '—'}
                          </TableCell>
                          {/* Punkt 4: Etikettpreis-Eingabe direkt hinter der VK-Etikett-Spalte. */}
                          <TableCell align="right">
                            <TextField
                              size="small"
                              type="number"
                              placeholder="Preis"
                              value={corrected ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                flow.setCorrectedVkPrice(
                                  s.id,
                                  raw === '' ? undefined : Number(raw),
                                  s.vkLabelPrice,
                                );
                              }}
                              inputProps={{
                                min: 0,
                                step: '0.01',
                                inputMode: 'decimal',
                                'aria-label': `Größe ${s.size}: Etikettpreis erfassen`,
                                style: { textAlign: 'right' },
                              }}
                              sx={{ width: 120 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                );
              })}
            </Table>
          </TableContainer>
        </Paper>

        {/* Why the close is blocked, if it is. */}
        {!gate.ok ? (
          <Alert severity="info">
            {gate.reasons.join(' · ')}
            {problemCount > 0
              ? ' – über „Teilabschluss (Problem melden)" an die Teamleitung senden.'
              : ''}
          </Alert>
        ) : null}

        {flow.actionError ? (
          <Alert severity="error" onClose={flow.clearActionError}>
            {flow.actionError} – bitte erneut versuchen.
          </Alert>
        ) : null}
      </Stack>

      <ProblemDialog
        open={problemTarget !== null}
        position={problemTarget}
        onClose={() => setProblemTarget(null)}
        onSave={(problem) => flow.addProblem(problem)}
      />

      <TeilabschlussDialog
        open={partialOpen}
        progress={progress}
        aggregate={aggregate}
        onClose={() => setPartialOpen(false)}
        onConfirm={confirmPartial}
      />
    </StepScaffold>
  );
}
