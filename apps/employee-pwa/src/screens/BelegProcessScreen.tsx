/**
 * PROCESS phase — the single per-Beleg work screen.
 *
 * One Beleg, the whole picture at a glance: a Beleg-level §G.2 guardrail (print
 * price labels → open carton), then ALL positions as a full list with their
 * Arbeitsanweisung flags (Preisetikett / Sicherung / Online / Rotpreis) and
 * Soll/Ist, the engine's box targets as info, and finally the per-Beleg erledigt
 * → ZST. The only gates are §G.2, the minimum-quantity check (every position,
 * even "Prüfung = Nein") and "no open problem". Boxing never gates.
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
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { db } from '../db/db.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { canCompleteCase, canOpenCarton } from '../workflow/workflowModel.js';
import { TAGESSTART } from '../routes/paths.js';

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
  const cartonAllowed = canOpenCarton(progress, wi);
  const gate = canCompleteCase(progress, aggregate, openIssues ?? 0);
  const checked = new Set(progress.quantityCheckedPositionIds);

  const checkModeLabel =
    wi.goodsReceiptCheckMode === 'full_check'
      ? 'Vollprüfung'
      : wi.goodsReceiptCheckMode === 'percentage_check'
        ? 'Stichprobe'
        : 'Mindest-Stückzahl';

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
      where={`WE ${aggregate.case.weBelegNo} · ${aggregate.case.storageLocation.code}`}
      title="Beleg bearbeiten"
      subtitle={`${aggregate.positions.length} Positionen · Prüfung: ${checkModeLabel}`}
      onBack={() => navigate(TAGESSTART)}
      primary={{ label: 'Beleg erledigt', onClick: finish, disabled: !gate.ok }}
      secondary={{ label: 'Teilabschluss', onClick: () => setPartialOpen(true) }}
    >
      <Stack spacing={2}>
        {/* §G.2 guardrail: print labels BEFORE opening the carton (Beleg-level). */}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Vorbereitung (§G.2: erst Etiketten, dann Karton)
          </Typography>
          <Stack spacing={1}>
            {progress.labelsPrinted ? (
              <Chip color="success" label="Preisetiketten gedruckt ✓" />
            ) : (
              <TouchButton emphasis="primary" onClick={() => void flow.printLabels()}>
                Preisetiketten drucken
              </TouchButton>
            )}
            {progress.cartonOpened ? (
              <Chip color="success" label="Karton geöffnet ✓" />
            ) : (
              <Button
                variant="outlined"
                size="large"
                fullWidth
                disabled={!cartonAllowed}
                onClick={() => void flow.openCarton()}
              >
                Karton geöffnet
              </Button>
            )}
          </Stack>
        </Paper>

        {/* Full position list at a glance with flags + Soll/Ist + min-qty check. */}
        <Typography variant="subtitle2">Positionen</Typography>
        {aggregate.positions.map((pos) => {
          const soll = pos.skuLines.reduce((sum, s) => sum + s.expectedQuantity, 0);
          const isChecked = checked.has(pos.id);
          const flags = FLAG_CHIPS.filter(
            (f) => (pos.instruction as Record<string, unknown>)[f.key] === true,
          );
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
                </Box>
                <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Soll {soll}</Typography>
              </Stack>

              {flags.length > 0 ? (
                <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                  {flags.map((f) => (
                    <Chip key={f.key} size="small" color={f.color} label={f.label} />
                  ))}
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

              <Box sx={{ mt: 1 }}>
                {isChecked ? (
                  <Chip color="success" size="small" label="Stückzahl geprüft ✓" />
                ) : (
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => void flow.checkQuantity(pos.id)}
                  >
                    Stückzahl geprüft
                  </Button>
                )}
              </Box>
            </Paper>
          );
        })}

        {/* Box targets — info only, never a gate. */}
        {aggregate.boxTargets.length > 0 ? (
          <>
            <Divider />
            <Typography variant="subtitle2">Boxen (Info)</Typography>
            {aggregate.boxTargets.map((t, i) => (
              <Typography key={t.id} variant="body2" color="text.secondary">
                Box {i + 1} → Shopbereich {t.shopAreaNo} · {t.plannedQuantity} Teile
              </Typography>
            ))}
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
