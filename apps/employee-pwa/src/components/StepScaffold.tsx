/**
 * Per-screen layout that answers the three §E.6 questions on every screen:
 * "Wo bin ich?" (where), "Was ist der nächste Schritt?" (primary action) and
 * "Was mache ich bei Problem?" (always-present Problem button, exception-first).
 */
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { TouchButton } from '@paket/ui';
import { problemPath } from '../routes/paths.js';

export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface StepScaffoldProps {
  caseId: string;
  /** "Wo bin ich?" – location/context line. */
  where: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  primary?: PrimaryAction;
  /** Optional secondary action (e.g. Teilabschluss), rendered below the primary. */
  secondary?: PrimaryAction;
  /** When set, a back affordance is shown so the worker can revise within the bundle. */
  onBack?: () => void;
  hideProblem?: boolean;
}

export function StepScaffold({
  caseId,
  where,
  title,
  subtitle,
  children,
  primary,
  secondary,
  onBack,
  hideProblem,
}: StepScaffoldProps): JSX.Element {
  const navigate = useNavigate();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%', pb: 18 }}>
      <Box sx={{ px: 2, pt: 2 }}>
        {onBack ? (
          <Button
            onClick={onBack}
            size="small"
            sx={{ ml: -1, mb: 0.5, minWidth: 0 }}
            aria-label="Zurück"
          >
            ‹ Zurück
          </Button>
        ) : null}
        <Typography variant="overline" color="text.secondary" display="block">
          {where}
        </Typography>
        <Typography variant="h1" sx={{ mb: subtitle ? 0.5 : 2 }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      <Box sx={{ px: 2, flex: 1 }}>{children}</Box>
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
        {primary ? (
          <TouchButton emphasis="primary" onClick={primary.onClick} disabled={primary.disabled}>
            {primary.label}
          </TouchButton>
        ) : null}
        {secondary ? (
          <Button
            variant="outlined"
            size="large"
            fullWidth
            onClick={secondary.onClick}
            disabled={secondary.disabled}
          >
            {secondary.label}
          </Button>
        ) : null}
        {hideProblem ? null : (
          <Button
            color="error"
            variant="outlined"
            size="large"
            fullWidth
            onClick={() => navigate(problemPath(caseId))}
          >
            Problem melden
          </Button>
        )}
      </Stack>
    </Box>
  );
}
