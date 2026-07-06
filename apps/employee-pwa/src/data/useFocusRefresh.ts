/**
 * Invalidates the day's assignment (`['me', 'today']`, see `useMeToday.ts`)
 * whenever the app regains focus.
 *
 * This is the integration point for live "new Beleg assigned" delivery: today
 * it refreshes on focus/visibility (cheap, robust); a future push channel can
 * invalidate the same query key. React Query re-fetches in the background and
 * any mounted `useMeToday()` consumer picks up the result automatically.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useFocusRefresh(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'today'] });
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [queryClient]);
}
