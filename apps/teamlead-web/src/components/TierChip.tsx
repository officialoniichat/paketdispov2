/**
 * Skill-Stufen-Chip (B5): one small, reusable badge for the 5-stufige Skill-Leiter
 * (profi → dummy). Starter/Dummy-Mitarbeiter werden von der Automatik nicht beplant
 * und erhalten nur manuelle Zuteilung — {@link isManualOnlyTier} markiert das.
 */
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { JSX } from 'react';
import type { SkillTier } from '@paket/domain-types';

const TIER_META: Record<
  SkillTier,
  { label: string; color: 'success' | 'info' | 'primary' | 'warning' | 'default' }
> = {
  profi: { label: 'Profi', color: 'success' },
  fortgeschritten: { label: 'Fortgeschritten', color: 'info' },
  basis: { label: 'Basis', color: 'primary' },
  starter: { label: 'Starter', color: 'warning' },
  dummy: { label: 'Dummy', color: 'default' },
};

/** Starter/Dummy erhalten keine automatische Verteilung — nur manuelle Zuteilung. */
export function isManualOnlyTier(tier: SkillTier): boolean {
  return tier === 'starter' || tier === 'dummy';
}

export interface TierChipProps {
  tier: SkillTier;
  size?: 'small' | 'medium';
}

export function TierChip({ tier, size = 'small' }: TierChipProps): JSX.Element {
  const meta = TIER_META[tier];
  return (
    <Tooltip title={`Skill-Stufe: ${meta.label}`}>
      <Chip size={size} color={meta.color} variant="outlined" label={meta.label} />
    </Tooltip>
  );
}
