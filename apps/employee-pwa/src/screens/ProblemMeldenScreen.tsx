/**
 * Problem melden (§9.7). Always reachable; the worker enters it from a concrete
 * entity — a position (per-position button) or the whole Beleg (footer) — so the
 * scope is pre-selected and the Teamlead knows exactly what is affected. Scope +
 * scopeId arrive as query params, are validated against the aggregate
 * (`resolveIssueTarget`) and can be narrowed from a position down to a single SKU
 * line. The issue is recorded as an `issue.created` event (local log → Teamlead
 * inbox). ONE clear continue path (D6): senden geht zurück zum Beleg, wo mit der
 * Restware weitergearbeitet wird. Mengenabweichungen (Mehr-/Minderlieferung)
 * werden NICHT hier gemeldet, sondern per +/- an der Position erfasst (D2).
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { IssueType } from '@paket/domain-types';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { parseScope, resolveIssueTarget } from '../workflow/issueTarget.js';

/** German labels for every domain IssueType (exhaustive — compile error if one is added). */
const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  missing_quantity: 'Minderlieferung',
  overdelivery: 'Mehrlieferung',
  wrong_article: 'falscher Artikel',
  wrong_color: 'falsche Farbe',
  wrong_size: 'falsche Größe',
  damaged_goods: 'beschädigt',
  missing_package: 'Paket fehlt',
  label_problem: 'Etikettenproblem',
  security_problem: 'Sicherungsproblem',
  printer_problem: 'Druckerproblem',
  other: 'Sonstiges',
};

/**
 * D2: Mengenabweichungen laufen über die +/- Erfassung an der Position — sie
 * sind hier bewusst nicht wählbar (kein Problem-Umweg für Mengen).
 */
const QUANTITY_TYPES: ReadonlySet<IssueType> = new Set(['missing_quantity', 'overdelivery']);

const ISSUE_TYPES = (Object.keys(ISSUE_TYPE_LABELS) as IssueType[]).filter(
  (t) => !QUANTITY_TYPES.has(t),
);

export function ProblemMeldenScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const flow = useCaseFlow(caseId);

  const [issueType, setIssueType] = useState<IssueType | ''>('');
  const [skuId, setSkuId] = useState<string>(''); // '' = ganze Position
  const [comment, setComment] = useState('');

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

  if (flow.loading || !flow.aggregate) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton />
      </Box>
    );
  }

  const aggregate = flow.aggregate;
  const target = resolveIssueTarget(
    aggregate,
    parseScope(searchParams.get('scope')),
    searchParams.get('scopeId') ?? undefined,
  );

  // For a position target, allow narrowing to a specific SKU line.
  const position =
    target.scope === 'position'
      ? aggregate.positions.find((p) => p.id === target.scopeId)
      : undefined;
  const skuLines = position?.skuLines ?? [];

  const send = async (): Promise<void> => {
    if (!issueType) return;
    const scoped =
      skuId !== ''
        ? { scope: 'sku_line' as const, scopeId: skuId }
        : { scope: target.scope, scopeId: target.scopeId };
    const ok = await flow.reportIssue({
      caseId,
      scope: scoped.scope,
      scopeId: scoped.scopeId,
      issueType,
      description: comment.trim() || undefined,
    });
    if (ok) navigate(-1);
  };

  return (
    <Box sx={{ p: 2, pb: 24 }}>
      <Button onClick={() => navigate(-1)} size="small" sx={{ ml: -1, mb: 0.5 }} aria-label="Zurück">
        ‹ Zurück
      </Button>
      <Typography variant="overline" color="text.secondary" display="block">
        Exception-first
      </Typography>
      <Typography variant="h1" gutterBottom>
        Problem melden
      </Typography>

      <Stack spacing={2} sx={{ mt: 1 }}>
        {/* Concrete target — what the problem is reported against. */}
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Betrifft:
          </Typography>
          <Chip color="primary" label={target.label} sx={{ maxWidth: '100%' }} />
        </Box>

        {/* Optional: narrow a position down to one SKU line. */}
        {skuLines.length > 1 ? (
          <TextField
            select
            label="Genauer (optional)"
            value={skuId}
            onChange={(e) => setSkuId(e.target.value)}
          >
            <MenuItem value="">Ganze Position</MenuItem>
            {skuLines.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                Größe {s.size} · EAN {s.ean}
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        <TextField
          select
          label="Problemart"
          value={issueType}
          onChange={(e) => setIssueType(e.target.value as IssueType)}
        >
          {ISSUE_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {ISSUE_TYPE_LABELS[t]}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Kommentar (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          multiline
          minRows={2}
        />
        <Typography variant="body2" color="text.secondary">
          Foto: optional
        </Typography>

        {/* Sending is now a plain awaited POST that throws on failure (no more
            best-effort/silent local-only fallback) — surfaced here (B4). */}
        {flow.actionError ? (
          <Alert severity="error" onClose={flow.clearActionError}>
            {flow.actionError} – bitte erneut senden.
          </Alert>
        ) : null}
      </Stack>

      <Stack
        spacing={1}
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          p: 2,
          bgcolor: 'background.paper',
          boxShadow: 8,
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Nach dem Senden arbeitest du direkt mit der Restware weiter.
        </Typography>
        <TouchButton emphasis="primary" onClick={send} disabled={!issueType}>
          An Teamlead senden
        </TouchButton>
      </Stack>
    </Box>
  );
}
