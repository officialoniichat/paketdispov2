/**
 * 9.8 Screen: Boxabschluss. One box at a time: Boxzettel drucken → verplomben →
 * aufs Förderband. Box label data comes from the routing target (§13.4); when
 * all boxes are done the worker moves to Abschluss.
 */
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { caseStepPath } from '../routes/paths.js';

export function BoxabschlussScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);

  if (!flow.aggregate || !flow.progress) {
    return <CaseCardSkeleton />;
  }

  const c = flow.aggregate.case;

  // Hängeware: no box / no Plombe / no Förderband. Etiketten + Hängeschild,
  // then onto the Hängewagen for the branch.
  if (c.storageLocation.type === 'haengebahn') {
    return (
      <StepScaffold
        caseId={caseId}
        where={`Beleg WE ${c.weBelegNo}`}
        title="Hängeware abschließen"
        subtitle="Keine Box, keine Plombe"
        primary={{
          label: 'Auf Hängewagen → Abschluss',
          onClick: () => navigate(caseStepPath(caseId, 'complete')),
        }}
      >
        <Stack spacing={2}>
          <Alert severity="info">
            Hängeware: Etiketten anbringen, Hängeschild an die Stange, dann auf den Hängewagen
            Richtung Filiale.
          </Alert>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={0.5}>
              <Typography>Teile: {c.totalQuantity}</Typography>
              <Typography>Lagerplatz: {c.storageLocation.code}</Typography>
            </Stack>
          </Paper>
        </Stack>
      </StepScaffold>
    );
  }

  const targets = flow.aggregate.boxTargets;
  const boxes = flow.progress.boxes;
  const total = boxes.length;
  const currentBox = boxes.find((b) => !(b.labelPrinted && b.sealed && b.onConveyor));
  const allDone = boxes.every((b) => b.labelPrinted && b.sealed && b.onConveyor);

  let primary: { label: string; onClick: () => void };
  if (!currentBox) {
    primary = {
      label: 'Beleg abschließen',
      onClick: () => navigate(caseStepPath(caseId, 'complete')),
    };
  } else if (!currentBox.labelPrinted) {
    primary = {
      label: `Box ${currentBox.boxNo}: Boxzettel drucken`,
      onClick: () => void flow.printBoxLabel(currentBox.boxNo),
    };
  } else if (!currentBox.sealed) {
    primary = {
      label: `Box ${currentBox.boxNo} verplomben`,
      onClick: () => void flow.sealBox(currentBox.boxNo),
    };
  } else {
    primary = {
      label: `Box ${currentBox.boxNo}: aufs Förderband`,
      onClick: () => void flow.putBoxOnConveyor(currentBox.boxNo),
    };
  }

  return (
    <StepScaffold
      caseId={caseId}
      where={`Beleg WE ${flow.aggregate.case.weBelegNo}`}
      title="Boxabschluss"
      subtitle={allDone ? 'Alle Boxen fertig' : `Box ${currentBox?.boxNo} von ${total}`}
      primary={primary}
    >
      <Stack spacing={2}>
        {boxes.map((box, i) => {
          const target = targets[i];
          return (
            <Paper key={box.boxNo} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1">
                  Box {box.boxNo} von {total}
                </Typography>
                <Stack direction="row" spacing={0.5}>
                  <Chip
                    size="small"
                    color={box.labelPrinted ? 'success' : 'default'}
                    label="Zettel"
                  />
                  <Chip size="small" color={box.sealed ? 'success' : 'default'} label="Plombe" />
                  <Chip size="small" color={box.onConveyor ? 'success' : 'default'} label="Band" />
                </Stack>
              </Stack>
              {target ? (
                <Stack spacing={0.25} sx={{ mt: 1 }}>
                  <Typography variant="body2">Shopbereich: {target.shopAreaNo}</Typography>
                  <Typography variant="body2">
                    Shop/HShop: {target.shopNo}
                    {target.hShopNo ? ` / ${target.hShopNo}` : ''}
                  </Typography>
                  {target.floor ? (
                    <Typography variant="body2">Etage: {target.floor}</Typography>
                  ) : null}
                  <Typography variant="body2">Ware: {target.goodsType}</Typography>
                  <Typography variant="body2">Menge: {target.plannedQuantity}</Typography>
                </Stack>
              ) : null}
            </Paper>
          );
        })}
      </Stack>
    </StepScaffold>
  );
}
