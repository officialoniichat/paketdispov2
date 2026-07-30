/**
 * Teamlead-Nachrichten an die Mitarbeiter-App (POST/GET /api/teamlead/messages).
 *
 * `sendeNachricht` wird aus den Vorverteilungs-Dialogen der Matrix gefeuert
 * (optionales Freitext-Feld); `useGesendeteNachrichten` speist den
 * Sidebar-Ausklapper mit dem Lesestatus („Gelesen"-Quittung der PWA) und
 * pollt, damit Quittungen ohne Reload ankommen.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { describeCause, hasFetchError } from './http.js';

export interface GesendeteNachricht {
  id: string;
  employeeNo: string;
  employeeName: string;
  caseId: string | null;
  weBelegNo: string | null;
  text: string;
  createdAt: string;
  readAt: string | null;
}

export async function sendeNachricht(args: {
  employeeNo: string;
  text: string;
  caseId?: string;
}): Promise<void> {
  const result = await api.POST('/api/teamlead/messages', {
    body: {
      employeeNo: args.employeeNo,
      text: args.text,
      ...(args.caseId !== undefined ? { caseId: args.caseId } : {}),
    },
  });
  if (hasFetchError(result)) {
    throw new Error(`Nachricht senden fehlgeschlagen (${describeCause(result.error)})`);
  }
}

/** Gesendete Nachrichten inkl. Lesestatus; leeres Array bis zur ersten Antwort. */
export function useGesendeteNachrichten(): GesendeteNachricht[] {
  const { data } = useQuery({
    queryKey: ['teamlead', 'nachrichten'],
    queryFn: async (): Promise<GesendeteNachricht[]> => {
      const result = await api.GET('/api/teamlead/messages');
      if (hasFetchError(result) || result.data === undefined) {
        throw new Error(`Laden der Nachrichten fehlgeschlagen (${describeCause(result.error)})`);
      }
      return result.data.messages;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  return data ?? [];
}
