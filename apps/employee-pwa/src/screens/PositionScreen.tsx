/**
 * 9.6 Screen: Position und SKU-Zeilen. One position at a time (Progressive
 * Disclosure). The "Position korrekt" action is gated behind the minimum
 * quantity check (§G.1: even Prüfung = Nein requires a quantity control).
 */
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { currentPosition, requiresQuantityCheck } from '../workflow/workflowModel.js';
import { caseStepPath } from '../routes/paths.js';

function mark(value: boolean): string {
  return value ? '✓' : '✕';
}

export function PositionScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);

  if (!flow.aggregate || !flow.progress) {
    return <CaseCardSkeleton />;
  }

  const { positions, workInstruction } = flow.aggregate;
  const p = flow.progress;
  const pos = currentPosition(p, positions);
  const unconfirmed = positions.filter((x) => !p.confirmedPositionIds.includes(x.id));

  if (!pos || unconfirmed.length === 0) {
    navigate(caseStepPath(caseId, 'sort'));
    return <CaseCardSkeleton />;
  }

  const needQty = requiresQuantityCheck(workInstruction);
  const qtyChecked = p.quantityCheckedPositionIds.includes(pos.id);
  const totalQty = pos.skuLines.reduce((sum, line) => sum + line.expectedQuantity, 0);
  const isLast = unconfirmed.length <= 1;

  const onCorrect = async (): Promise<void> => {
    await flow.confirmPosition(pos.id);
    if (isLast) navigate(caseStepPath(caseId, 'sort'));
  };

  const primary =
    needQty && !qtyChecked
      ? { label: `Stückzahl prüfen (${totalQty})`, onClick: () => void flow.checkQuantity(pos.id) }
      : { label: 'Position korrekt', onClick: onCorrect };

  return (
    <StepScaffold
      caseId={caseId}
      where={`Beleg WE ${flow.aggregate.case.weBelegNo}`}
      title={`Position ${pos.positionNo}`}
      primary={primary}
    >
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography>Artikel: {pos.supplierArticleNo}</Typography>
            <Typography>Farbe: {pos.supplierColor}</Typography>
            <Typography>WGR: {pos.wgr}</Typography>
            <Typography>
              Shop/HShop: {pos.shopNo}
              {pos.hShopNo ? ` / ${pos.hShopNo}` : ''}
            </Typography>
            {pos.floor ? <Typography>Etage: {pos.floor}</Typography> : null}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Aktionen
          </Typography>
          <Typography>
            {mark(pos.instruction.priceLabelAttachRequired)} Preisetikett anbringen
          </Typography>
          <Typography>{mark(!pos.instruction.securityRequired)} Nicht sichern</Typography>
          <Typography>
            {mark(needQty)} Stückzahl prüfen{qtyChecked ? ' (erledigt)' : ''}
          </Typography>
        </Paper>

        <Paper variant="outlined">
          <Typography variant="subtitle2" sx={{ px: 2, pt: 2 }}>
            Größen
          </Typography>
          <List dense>
            {pos.skuLines.map((line) => (
              <ListItem key={line.id} divider>
                <ListItemText
                  primary={`EAN ${line.ean} · Größe ${line.size}`}
                  secondary={`Menge ${line.expectedQuantity}`}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Stack>
    </StepScaffold>
  );
}
