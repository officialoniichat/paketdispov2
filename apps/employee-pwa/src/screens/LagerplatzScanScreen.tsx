/**
 * 9.4 Screen: Lagerplatzscan. Scan-first (§E.3): hardware wedge via useScanner,
 * ScanField as fallback. Immediate local confirmation, then advance to
 * Vorbereitung.
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { ScanField } from '../scanner/ScanField.js';
import { useScanner } from '../scanner/useScanner.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { caseStepPath, problemPath } from '../routes/paths.js';

export function LagerplatzScanScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);
  const [scanned, setScanned] = useState<string | null>(null);

  useScanner({ onScan: (code) => setScanned(code) });

  if (!flow.aggregate) {
    return <CaseCardSkeleton />;
  }

  const c = flow.aggregate.case;

  const confirmFound = async (): Promise<void> => {
    await flow.confirmPickup(scanned ?? undefined);
    navigate(caseStepPath(caseId, 'prepare'));
  };

  return (
    <StepScaffold
      caseId={caseId}
      where={`Beleg WE ${c.weBelegNo}`}
      title="Lagerplatzscan"
      primary={{ label: 'Paket gefunden', onClick: confirmFound }}
    >
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography>Nächster Lagerplatz: {c.storageLocation.code}</Typography>
            <Typography>Beleg: WE {c.weBelegNo}</Typography>
            <Typography>Belegmenge: {c.totalQuantity}</Typography>
          </Stack>
        </Paper>
        <ScanField
          label="Barcode/Lagerplatz scannen"
          hint={`Erwartet: ${c.storageLocation.code}`}
          onSubmit={(code) => setScanned(code)}
        />
        {scanned ? <Alert severity="success">Gescannt: {scanned}</Alert> : null}
        <Button color="error" variant="text" onClick={() => navigate(problemPath(caseId))}>
          Paket nicht gefunden
        </Button>
      </Stack>
    </StepScaffold>
  );
}
