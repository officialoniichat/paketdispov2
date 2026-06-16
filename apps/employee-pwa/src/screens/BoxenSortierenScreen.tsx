/** Screen: Boxen sortieren. The engine proposes the position→box mapping; the
 *  worker confirms it (single-source fachlogik: engine decides, UI displays). */
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { CaseCardSkeleton } from '@paket/ui';
import { StepScaffold } from '../components/StepScaffold.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { caseStepPath } from '../routes/paths.js';

export function BoxenSortierenScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);

  if (!flow.aggregate || !flow.progress) {
    return <CaseCardSkeleton />;
  }

  const targets = flow.aggregate.boxTargets;
  const positionsById = new Map(flow.aggregate.positions.map((p) => [p.id, p]));

  const confirm = async (): Promise<void> => {
    await flow.confirmBoxAssignment();
    navigate(caseStepPath(caseId, 'boxing'));
  };

  return (
    <StepScaffold
      caseId={caseId}
      where={`Beleg WE ${flow.aggregate.case.weBelegNo}`}
      title="Boxen sortieren"
      subtitle="Welcher Artikel kommt in welche Box?"
      primary={{ label: `Sortierung übernehmen → ${targets.length} Box(en)`, onClick: confirm }}
    >
      <Stack spacing={2}>
        <Alert severity="info">
          Vorschlag nach Shopbereich. Beim Abschluss kannst du Abweichungen melden.
        </Alert>
        {targets.map((t, i) => (
          <Paper key={t.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle1">Box {i + 1}</Typography>
              <Chip size="small" color="info" label={`Shopbereich ${t.shopAreaNo}`} />
            </Stack>
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              {t.positionIds.map((pid) => {
                const p = positionsById.get(pid);
                return (
                  <Typography key={pid} variant="body2">
                    {p ? `${p.supplierArticleNo} ${p.supplierColor}` : pid}
                  </Typography>
                );
              })}
              <Typography variant="body2" color="text.secondary">
                Menge: {t.plannedQuantity}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </StepScaffold>
  );
}
