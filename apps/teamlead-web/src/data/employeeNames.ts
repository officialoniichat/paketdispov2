/**
 * Reusable employee-name resolver. One cached source (the employee list) so that
 * anywhere an `employeeId`/User id would otherwise leak into the UI (Vorschlag
 * load table, cockpit audit feed, …) shows the readable Mitarbeitername instead.
 *
 * Usage:
 *   const name = useEmployeeNames();
 *   <span>{name(id) ?? id}</span>
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchEmployees } from './employees.js';

/** Returns `(id) => displayName | undefined`. Unknown ids fall back to the caller. */
export function useEmployeeNames(): (id: string) => string | undefined {
  const { data } = useQuery({
    queryKey: ['admin', 'employees', 'names'],
    queryFn: () => fetchEmployees(),
    staleTime: 5 * 60 * 1000,
  });
  const byId = useMemo(
    () => new Map((data?.employees ?? []).map((e) => [e.id, e.displayName])),
    [data],
  );
  return useMemo(() => (id: string) => byId.get(id), [byId]);
}
