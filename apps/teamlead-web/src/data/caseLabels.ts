/**
 * Reusable case-label resolver. One cached source (the Belege list) maps a caseId
 * to its readable WE-Beleg-Nr, so audit lines and anywhere else never show a raw
 * cuid for a case — even for parked/ready cases not currently on the board/pool.
 *
 * Usage:
 *   const caseLabel = useCaseLabels();
 *   <span>{caseLabel(id) ?? id}</span>
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBelegeList } from './belege.js';

/** Returns `(caseId) => weBelegNo | undefined`. */
export function useCaseLabels(): (id: string) => string | undefined {
  const { data } = useQuery({
    queryKey: ['belege', 'labels'],
    // Broad label source: all scopes, one big page (audit lines reference any case).
    queryFn: () =>
      fetchBelegeList(
        { scope: 'alle', page: 1, sortBy: null, sortDir: 'asc', filters: {} },
        200,
      ),
    staleTime: 60 * 1000,
  });
  const byId = useMemo(
    () => new Map((data?.rows ?? []).map((b) => [b.id, b.weBelegNo])),
    [data],
  );
  return useMemo(() => (id: string) => byId.get(id), [byId]);
}
