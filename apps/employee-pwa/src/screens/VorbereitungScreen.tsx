/**
 * 9.5 Screen: Vorbereitung. Enforces label printing BEFORE unpacking (§9.5,
 * §G.2 Punkt 1): the primary action is "Etiketten drucken" until labels are
 * printed, only then "Sortierung fertig".
 */
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { caseStepPath } from '../routes/paths.js';

const CHECK_LABEL: Record<string, string> = {
  full_check: 'Vollprüfung',
  percentage_check: 'Stichprobenprüfung',
  quantity_only: 'Mindest-Stückzahlkontrolle',
};

export function VorbereitungScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);

  if (!flow.aggregate || !flow.progress) {
    return <CaseCardSkeleton />;
  }

  const wi = flow.aggregate.workInstruction;
  const p = flow.progress;
  const noSecurity = flow.aggregate.positions.every((pos) => !pos.instruction.securityRequired);

  const finishSort = async (): Promise<void> => {
    await flow.markPrepared();
    navigate(caseStepPath(caseId, 'positions'));
  };

  const primary = !p.labelsPrinted
    ? { label: 'Etiketten drucken', onClick: () => void flow.printLabels() }
    : { label: 'Sortierung fertig', onClick: finishSort };

  return (
    <StepScaffold
      caseId={caseId}
      where={`Beleg WE ${flow.aggregate.case.weBelegNo}`}
      title="Vorbereitung"
      primary={primary}
    >
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography>
              Preisetikettendruck: {wi.priceLabelPrintRequired ? 'JA' : 'NEIN'}
            </Typography>
            <Typography>
              Sortieren nach Artikel/Farbe/Größe: {wi.sortByArticleColorSizeRequired ? 'JA' : 'NEIN'}
            </Typography>
            <Typography>
              Prüfung Wareneingang:{' '}
              {CHECK_LABEL[wi.goodsReceiptCheckMode] ?? wi.goodsReceiptCheckMode}
            </Typography>
            <Typography>Boxzettel: {wi.boxLabelRequired ? 'JA' : 'NEIN'}</Typography>
            <Typography>Sicherung: {noSecurity ? 'Nicht sichern' : 'Sichern erforderlich'}</Typography>
          </Stack>
        </Paper>

        {!p.labelsPrinted ? (
          <Alert severity="info">Erst Etiketten drucken, dann Karton öffnen.</Alert>
        ) : null}

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack>
            <FormControlLabel
              control={<Checkbox checked={p.labelsPrinted} readOnly />}
              label="Etiketten drucken"
            />
            <FormControlLabel
              control={<Checkbox checked={p.labelsPrinted} readOnly />}
              label="Karton öffnen"
              disabled={!p.labelsPrinted}
            />
            <FormControlLabel
              control={<Checkbox checked={p.labelsPrinted} readOnly />}
              label="Füllmaterial entfernen"
              disabled={!p.labelsPrinted}
            />
            <FormControlLabel
              control={<Checkbox checked={p.prepared} readOnly />}
              label="Ware nach Artikel/Farbe/Größe sortieren"
              disabled={!p.labelsPrinted}
            />
          </Stack>
        </Paper>
      </Stack>
    </StepScaffold>
  );
}
