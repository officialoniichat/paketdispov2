/**
 * Reusable Bereich/Skill catalog — the admin-managed list of Bereiche from the
 * Regelpflege (RuleConfig.bereiche). Employees and Lagerplätze pick from THIS list
 * (no free text, no hardcoded enum). One cached source for every picker.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchRuleConfig } from './admin.js';

/** The editable Bereich catalog (labels). Empty while loading / if none configured. */
export function useBereichCatalog(): string[] {
  const { data } = useQuery({
    queryKey: ['admin', 'rules'],
    queryFn: fetchRuleConfig,
    staleTime: 60 * 1000,
  });
  return data?.bereiche ?? [];
}
