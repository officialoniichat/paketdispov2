/**
 * PROCESS phase — the single per-Beleg work screen.
 *
 * The WE Beleg-Nr. is the hero (C1); the Kopf shows Kartons (C2 — multi-carton
 * shipments must be searched on the cart) and the Warenart wording instead of
 * Abschnitt numbers (C3). The Arbeitsanweisung is ordered Prüfung Wareneingang →
 * Rotpreis → Boxzettel (C4) with the Prüfstufe explained expandably (C5 —
 * "Nein" does NOT mean nothing is checked). Positions carry the Preisetikett
 * placement with the Sicherungsetikett pictogram (C6). The only gates are the
 * per-position check and "no open problem"; printing is upstream (vorgelagert),
 * Karton öffnen is no work step (C4). Boxing never gates.
 *
 * Positions show every Größe as its own line — EAN, EK/VK/VK-Etikett + Menge
 * like the WE-Beleg paper (D1) — with +/- Mehr-/Mindermengen capture per Größe
 * (D2, no Problem-screen detour for quantity deviations), Shop/WGR-Klartext/
 * Catman (D3) and the Online-Größen-Markierung rot/grün (D4). „Position
 * geprüft" is un-checkable (D5); the Teilabschluss dialog explains what happens
 * to the Beleg afterwards (D7).
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import { DEFAULT_WGR_CATALOG, type OnlineSizeMark } from '@paket/domain-types';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { apiBaseUrl } from '../data/api.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { canCompleteCase } from '../workflow/workflowModel.js';
import { TAGESSTART, problemPath } from '../routes/paths.js';

/**
 * Arbeitsanweisung points that are already performed via dedicated controls
 * ("Beleg erledigt" sets the ZST) or are upstream (printing is vorgelagert, C4)
 * — hidden from the read-only Arbeitsanweisung list.
 */
const ACTION_POINT_KEYS = new Set([
  'price_label_print', // upstream (vorgelagert) — no work step here (C4)
  'price_label_attach', // → per-position placement line
  'zst', // → "Beleg erledigt" sets the ZST
]);

/**
 * C4 display order (Feedback wörtlich: „1. Passt" = Sortieren bleibt vorn,
 * „2. Prüfung", „3. [Boxzettel] wandert an Position 5", „4. Rotpreis",
 * „5. Boxzettel"): Sortieren, Prüfung, Sicherungsetikett, Rotpreis, Boxzettel.
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

/** Boxzettel-Warenart in Klartext (interne Enum-Werte nie roh anzeigen). */
const BOX_GOODS_TYPE_LABEL: Record<string, string> = {
  vororder: 'Vororder',
  nachorder: 'Nachorder',
  sopo: 'Sonderposten',
  nos: 'NOS',
  extrabestellung: 'Extrabestellung',
  nos_nachorder: 'NOS-Nachorder',
  prio: 'Prio',
};

/** WGR-Klartext (D3) — resolved from the same mock master data the backend uses. */
const WGR_DESCRIPTION = new Map(DEFAULT_WGR_CATALOG.map((e) => [e.wgr, e.description]));

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** Format a price, or empty when the mock ERP did not deliver one. */
function price(value: number | undefined): string | null {
  return typeof value === 'number' ? EUR.format(value) : null;
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

export function BelegProcessScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);
  const [partialOpen, setPartialOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [inspectionOpen, setInspectionOpen] = useState(false);

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
  // TODO(task-13+): there is no dedicated open-issue count endpoint yet — the
  // former Dexie-backed local event log this used to count `issue.created`
  // events is gone. The case's own live status already flips to `issue_open`
  // once a problem is reported (see persist.ts's reportIssue → §7.1), so that
  // is used as the (0 | 1) gate signal instead.
  const openIssues = aggregate.case.status === 'issue_open' ? 1 : 0;
  const gate = canCompleteCase(progress, aggregate, openIssues);
  const checked = new Set(progress.quantityCheckedPositionIds);
  const infoPoints = [...aggregate.instructionPoints]
    .filter((p) => !ACTION_POINT_KEYS.has(p.key))
    .sort(
      (a, b) => (POINT_DISPLAY_ORDER[a.key] ?? 99) - (POINT_DISPLAY_ORDER[b.key] ?? 99),
    );
  const positionsById = new Map(aggregate.positions.map((p) => [p.id, p]));
  // C3: Abschnitt-Zahlen durch Warenart-Wording ersetzt (Vororder/Nachorder …).
  const c = aggregate.case;
  // Warenart je Position: NOS ist positions-getrieben (nosFlag), sonst gilt der Beleg-Kopf.
  const positionWarenart = (pos: (typeof aggregate.positions)[number]): string | undefined =>
    pos.nosFlag ? 'NOS' : (c.goodsTypeText ?? undefined);

  const finish = async (): Promise<void> => {
    const ok = await flow.complete();
    if (ok) navigate(TAGESSTART);
  };

  const confirmPartial = async (): Promise<void> => {
    const ok = await flow.partialComplete(reason.trim() || 'Teilabschluss');
    if (ok) {
      setPartialOpen(false);
      navigate(TAGESSTART);
    }
  };

  return (
    <StepScaffold
      caseId={caseId}
      where={aggregate.case.storageLocation?.code ?? '—'}
      title={`WE ${aggregate.case.weBelegNo}`}
      subtitle={
        c.inboundCartonCount != null
          ? `📦 ${c.inboundCartonCount} Karton${c.inboundCartonCount === 1 ? '' : 's'} – alle auf dem Karren suchen!`
          : undefined
      }
      onBack={() => navigate(TAGESSTART)}
      primary={{ label: 'Beleg erledigt', onClick: finish, disabled: !gate.ok }}
      secondary={{ label: 'Teilabschluss', onClick: () => setPartialOpen(true) }}
    >
      <Stack spacing={2}>
        {/* Beleg-Kopf: Warenart PROMINENT (Selbst-Priorisierung, leicht zu übersehen war
            gestern das Feedback) + Beleg-Menge. */}
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
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {point.label}
                        {isInspection && aggregate.inspectionLevelLabel
                          ? ` · ${aggregate.inspectionLevelLabel}`
                          : ''}
                      </Typography>
                      {/* Wert nicht doppeln, wenn er bereits im Titel steht (Prüfstufe). */}
                      {!(isInspection && aggregate.inspectionLevelLabel === point.value) ? (
                        <Typography variant="body2" color="text.secondary">
                          {point.value}
                        </Typography>
                      ) : null}
                      {/* C5: die Prüfstufe erklärt — „Nein“ heißt NICHT: nichts prüfen. */}
                      {isInspection && aggregate.inspectionDescription ? (
                        <>
                          <Button
                            size="small"
                            sx={{ px: 0, minWidth: 0 }}
                            onClick={() => setInspectionOpen((open) => !open)}
                          >
                            {inspectionOpen ? 'Weniger' : 'Was heißt das?'}
                          </Button>
                          <Collapse in={inspectionOpen}>
                            <Typography variant="body2" color="text.secondary">
                              {aggregate.inspectionDescription}
                            </Typography>
                          </Collapse>
                        </>
                      ) : null}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        ) : null}

        {/* Full position list at a glance with flags + Soll/Ist + position check. */}
        <Typography variant="subtitle2">Positionen</Typography>
        {wi.goodsReceiptCheckMode === 'quantity_only' ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
            Jede Position prüfen – auch bei Prüfung Wareneingang = „Nein".
          </Typography>
        ) : null}
        {/* TODO(task-13+): "Position geprüft"/Mengen-Fortschritt is client-only
            cache state while working the Beleg (no live per-action backend
            endpoint yet, see useCaseFlow.ts) — it does not survive a reload
            mid-Beleg. "Beleg erledigt"/"Teilabschluss" DOES transfer the
            recorded Mengen to the backend (completedQuantity), so this caption
            is literally accurate, not just a disclaimer. */}
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
          Dieser Fortschritt geht beim Neuladen der Seite verloren – erst „Beleg erledigt" sichert
          ihn dauerhaft.
        </Typography>
        {aggregate.positions.map((pos) => {
          const soll = pos.skuLines.reduce((sum, s) => sum + s.expectedQuantity, 0);
          const isChecked = checked.has(pos.id);
          const flags = FLAG_CHIPS.filter(
            (f) => (pos.instruction as Record<string, unknown>)[f.key] === true,
          );
          const i = pos.instruction;
          const instructionLines = [
            i.priceLabelAttachLocation ? `Etikett anbringen: ${i.priceLabelAttachLocation}` : null,
            i.securityRequired && i.securityLocation ? `Sichern: ${i.securityLocation}` : null,
            i.onlineHandlingRequired && i.onlineHandlingLocation
              ? `Online: ${i.onlineHandlingLocation}`
              : null,
            i.notes ? `Hinweis: ${i.notes}` : null,
          ].filter((line): line is string => line !== null);
          return (
            <Paper key={pos.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box sx={{ minWidth: 0, pr: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>Pos {pos.positionNo}</Typography>
                  {/* D3: Artikel-Nr. direkt unter 'Pos N'; Farbe in derselben Schriftgröße. */}
                  <Typography noWrap>{pos.supplierArticleNo}</Typography>
                  <Typography noWrap>{pos.supplierColor}</Typography>
                  {/* Warenbezeichnung = Artikel-Identität: WGR mit Klartext (+ Saison) + Shop. */}
                  <Typography variant="body2" color="text.secondary" noWrap>
                    WGR {pos.wgr}
                    {WGR_DESCRIPTION.get(pos.wgr) ? ` ${WGR_DESCRIPTION.get(pos.wgr)}` : ''}
                    {pos.season ? ` · Saison ${pos.season}` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    Shop {pos.shopNo}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Soll {soll}</Typography>
              </Stack>

              {flags.length > 0 || pos.nosFlag || pos.catMan || positionWarenart(pos) ? (
                <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                  {pos.nosFlag ? <Chip size="small" color="success" label="♻️ NOS" /> : null}
                  {/* Warenart je Position (NOS hat schon sein Badge). */}
                  {!pos.nosFlag && positionWarenart(pos) ? (
                    <Chip size="small" color="secondary" variant="outlined" label={positionWarenart(pos)} />
                  ) : null}
                  {pos.catMan ? <Chip size="small" variant="outlined" label="Catman" /> : null}
                  {flags.map((f) => (
                    <Chip key={f.key} size="small" color={f.color} label={f.label} />
                  ))}
                </Stack>
              ) : null}

              {instructionLines.length > 0 ? (
                <Stack spacing={0.25} sx={{ mt: 1 }}>
                  {instructionLines.map((line) => (
                    <Typography key={line} variant="body2" color="text.secondary">
                      {line}
                    </Typography>
                  ))}
                </Stack>
              ) : null}

              {/* C6: Sicherungstyp als Piktogramm (Backend-Asset) neben der Etikett-Platzierung. */}
              {i.securityRequired && i.securityTypeCode ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
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

              {/* D1: jede Größe als eigene Zeile — EAN, EK/VK/VK-Etikett + Menge wie
                  auf dem WE-Beleg-Papier. D2: +/- Mehr-/Mindermengen direkt hier.
                  D4: Rot/Grün-Markierung der Online-Größen. */}
              <Stack spacing={0.75} sx={{ mt: 1 }}>
                {pos.skuLines.map((s) => {
                  const ist = progress.confirmedQuantities[s.id] ?? s.expectedQuantity;
                  const deviates = ist !== s.expectedQuantity;
                  const mark = aggregate.onlineMarks[s.id];
                  const prices = [
                    price(s.ekPrice) ? `EK ${price(s.ekPrice)}` : null,
                    price(s.vkPrice) ? `VK ${price(s.vkPrice)}` : null,
                    price(s.vkLabelPrice) ? `VK-Etikett ${price(s.vkLabelPrice)}` : null,
                  ]
                    .filter((x): x is string => x !== null)
                    .join(' · ');
                  return (
                    <Box
                      key={s.id}
                      sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 0.75 }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          Größe {s.size}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          EAN {s.ean}
                        </Typography>
                        {mark ? (
                          <Chip size="small" color={ONLINE_MARK[mark].color} label={ONLINE_MARK[mark].label} />
                        ) : null}
                      </Stack>
                      {prices ? (
                        <Typography variant="body2" color="text.secondary">
                          {prices}
                        </Typography>
                      ) : null}
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                        <Typography variant="body2">Soll {s.expectedQuantity}</Typography>
                        <IconButton
                          size="small"
                          aria-label={`Größe ${s.size}: Menge verringern`}
                          onClick={() =>
                            void flow.setSkuQuantity(s.id, ist - 1, s.expectedQuantity)
                          }
                        >
                          −
                        </IconButton>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, color: deviates ? 'error.main' : 'text.primary' }}
                        >
                          Ist {ist}
                        </Typography>
                        <IconButton
                          size="small"
                          aria-label={`Größe ${s.size}: Menge erhöhen`}
                          onClick={() =>
                            void flow.setSkuQuantity(s.id, ist + 1, s.expectedQuantity)
                          }
                        >
                          +
                        </IconButton>
                        {deviates ? (
                          <Chip
                            size="small"
                            color="warning"
                            label={ist > s.expectedQuantity ? 'Mehrmenge' : 'Mindermenge'}
                          />
                        ) : null}
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                {/* D5: 'Position geprüft' — wieder abwählbar (Toggle). */}
                {isChecked ? (
                  <Chip
                    color="success"
                    size="small"
                    label="Position geprüft ✓"
                    onClick={() => void flow.togglePositionChecked(pos.id)}
                  />
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void flow.togglePositionChecked(pos.id)}
                  >
                    Position geprüft
                  </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <Button
                  color="error"
                  variant="text"
                  size="small"
                  onClick={() =>
                    navigate(problemPath(caseId, { scope: 'position', scopeId: pos.id }))
                  }
                >
                  Problem
                </Button>
              </Stack>
            </Paper>
          );
        })}

        {/* Boxzettel (§G.1 Punkt 9) — what goes on each box label. Info only, no gate. */}
        {aggregate.boxTargets.length > 0 ? (
          <>
            <Divider />
            <Typography variant="subtitle2">Boxzettel</Typography>
            {aggregate.boxTargets.map((t, i) => {
              const boxPositions = t.positionIds
                .map((id) => positionsById.get(id))
                .filter((p): p is (typeof aggregate.positions)[number] => Boolean(p));
              const posNos = boxPositions.map((p) => p.positionNo).sort((a, b) => a - b);
              // Warenart nie als rohes 'mixed'/„Gemischt“ verkürzen: bei gemischten Boxen
              // die enthaltenen Warenarten aufschlüsseln (aus den Positionen der Box).
              const warenartLabel = (() => {
                if (!t.goodsType) return null;
                if (t.goodsType !== 'mixed') return BOX_GOODS_TYPE_LABEL[t.goodsType] ?? t.goodsType;
                const parts = [
                  ...new Set(
                    boxPositions
                      .map((p) => positionWarenart(p))
                      .filter((w): w is string => Boolean(w)),
                  ),
                ];
                return parts.length > 0 ? `Gemischt: ${parts.join(' + ')}` : 'Gemischt';
              })();
              const shopLine = [
                `Filiale ${t.branchNo}`,
                `Shopbereich ${t.shopAreaNo}`,
                t.shopNo ? `Shop ${t.shopNo}` : null,
                t.floor ? `Etage ${t.floor}` : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Paper key={t.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography sx={{ fontWeight: 700 }}>Box {i + 1}</Typography>
                    <Chip size="small" label={`${t.plannedQuantity} Teile`} />
                  </Stack>
                  <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                    <Typography variant="body2">{shopLine}</Typography>
                    {warenartLabel ? (
                      <Typography variant="body2" color="text.secondary">
                        Warenart: {warenartLabel}
                      </Typography>
                    ) : null}
                    {posNos.length > 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Positionen: {posNos.join(', ')}
                      </Typography>
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}
          </>
        ) : null}

        {/* Why the close is blocked, if it is. */}
        {!gate.ok ? <Alert severity="info">Noch offen: {gate.reasons.join(' · ')}</Alert> : null}

        {/* A milestone POST (Beleg erledigt/Teilabschluss/Start) failed — never
            swallowed (B4): surfaced here. The action itself stayed unset, so
            pressing the same button again (below) is the retry. */}
        {flow.actionError ? (
          <Alert severity="error" onClose={flow.clearActionError}>
            {flow.actionError} – bitte erneut versuchen.
          </Alert>
        ) : null}
      </Stack>

      <Dialog open={partialOpen} onClose={() => setPartialOpen(false)} fullWidth>
        <DialogTitle>Teilabschluss</DialogTitle>
        <DialogContent>
          {/* D7: erklären, was der Teilabschluss tut und was mit dem Beleg passiert. */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Du schließt nur den bearbeiteten Teil ab. Der Beleg geht mit deinem Grund an die
            Teamleitung und kommt mit der Restware zurück in die Planung (in der Regel am
            nächsten Tag). In deiner Liste zählt er nicht als „Fertig“, sondern als
            „Teilabschluss“.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Grund"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPartialOpen(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={confirmPartial}>
            Teil abschließen
          </Button>
        </DialogActions>
      </Dialog>
    </StepScaffold>
  );
}
