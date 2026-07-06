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
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
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
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { apiBaseUrl } from '../data/api.js';
import { db } from '../db/db.js';
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
 * C4 display order: Prüfung Wareneingang, Rotpreis, Boxzettel first, then the
 * remaining points (Sortieren, Sicherungsetikett, Online). Unlisted keys sort last.
 */
const POINT_DISPLAY_ORDER: Record<string, number> = {
  goods_receipt_check: 0,
  red_price: 1,
  box_label: 2,
  sort: 3,
  security: 4,
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

  const openIssues = useLiveQuery(
    async () =>
      (await db.events.toArray()).filter(
        (e) => e.eventType === 'issue.created' && e.entityId === caseId,
      ).length,
    [caseId],
    0,
  );

  if (flow.loading || !flow.aggregate || !flow.progress) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton />
      </Box>
    );
  }

  const { aggregate, progress } = flow;
  const wi = aggregate.workInstruction;
  const gate = canCompleteCase(progress, aggregate, openIssues ?? 0);
  const checked = new Set(progress.quantityCheckedPositionIds);
  const infoPoints = [...aggregate.instructionPoints]
    .filter((p) => !ACTION_POINT_KEYS.has(p.key))
    .sort(
      (a, b) => (POINT_DISPLAY_ORDER[a.key] ?? 99) - (POINT_DISPLAY_ORDER[b.key] ?? 99),
    );
  const positionsById = new Map(aggregate.positions.map((p) => [p.id, p]));
  // C3: Abschnitt-Zahlen durch Warenart-Wording ersetzt (Vororder/Nachorder …).
  const c = aggregate.case;
  const kopf = [c.goodsTypeText ?? null, `${c.totalQuantity} Teile`]
    .filter((x): x is string => x !== null)
    .join(' · ');

  const finish = async (): Promise<void> => {
    await flow.complete();
    navigate(TAGESSTART);
  };

  const confirmPartial = async (): Promise<void> => {
    await flow.partialComplete(reason.trim() || 'Teilabschluss');
    setPartialOpen(false);
    navigate(TAGESSTART);
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
        {/* Beleg-Kopf (Abschnitt · Warenart · Beleg-Menge) — work-relevant subset. */}
        <Typography variant="body2" color="text.secondary">
          {kopf}
        </Typography>

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
                      <Typography variant="body2" color="text.secondary">
                        {point.value}
                      </Typography>
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
            Mindestmenge immer zählen – auch bei Prüfung Wareneingang = „Nein“.
          </Typography>
        ) : null}
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
                  <Typography sx={{ fontWeight: 700 }}>
                    Pos {pos.positionNo} · {pos.supplierArticleNo}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {pos.supplierColor}
                  </Typography>
                  {/* Warenbezeichnung = Artikel-Identität: WGR (+ Saison). */}
                  <Typography variant="body2" color="text.secondary" noWrap>
                    WGR {pos.wgr}
                    {pos.season ? ` · Saison ${pos.season}` : ''}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Soll {soll}</Typography>
              </Stack>

              {flags.length > 0 || pos.nosFlag ? (
                <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                  {pos.nosFlag ? <Chip size="small" color="success" label="♻️ NOS" /> : null}
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

              {pos.skuLines.length > 1 ? (
                <Stack spacing={0.25} sx={{ mt: 1 }}>
                  {pos.skuLines.map((s) => (
                    <Typography key={s.id} variant="body2" color="text.secondary">
                      Größe {s.size} · {s.expectedQuantity} Stk
                    </Typography>
                  ))}
                </Stack>
              ) : null}

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                {isChecked ? (
                  <Chip
                    color="success"
                    size="small"
                    label="Mindestmenge geprüft ✓"
                    onClick={() => void flow.togglePositionChecked(pos.id)}
                  />
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void flow.togglePositionChecked(pos.id)}
                  >
                    Mindestmenge geprüft
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
              const posNos = t.positionIds
                .map((id) => positionsById.get(id)?.positionNo)
                .filter((n): n is number => typeof n === 'number')
                .sort((a, b) => a - b);
              const shopLine = [
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
                    {t.goodsType ? (
                      <Typography variant="body2" color="text.secondary">
                        Warenart: {t.goodsType}
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
      </Stack>

      <Dialog open={partialOpen} onClose={() => setPartialOpen(false)} fullWidth>
        <DialogTitle>Teilabschluss</DialogTitle>
        <DialogContent>
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
