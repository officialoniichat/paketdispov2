import { describe, expect, it } from 'vitest';
import type { LiveEvent } from '@paket/domain-types';
import { firstValueFrom, toArray } from 'rxjs';
import { LiveStatusService, isAddressedTo, type SseMessage } from './live.module.js';

function event(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    type: 'case.status',
    recipients: ['ma-1'],
    caseId: 'case-1',
    status: 'in_progress',
    actorEmployeeNo: 'ma-1',
    positionId: null,
    at: '2026-08-31T09:00:00.000Z',
    ...overrides,
  };
}

/** Sammelt alles, was der Stream bis zum Abschluss des Subjects liefert. */
async function collect(
  live: LiveStatusService,
  predicate: (e: LiveEvent) => boolean,
  publish: () => void,
): Promise<SseMessage[]> {
  const messages = firstValueFrom(live.stream(predicate).pipe(toArray()));
  publish();
  // Subject schließen, damit toArray() abschließt.
  (live as unknown as { subject: { complete(): void } }).subject.complete();
  return messages;
}

describe('LiveStatusService (typisierter Kanal, mehrere Empfänger)', () => {
  it('nutzt den Ereignistyp als SSE-event-Namen', async () => {
    const live = new LiveStatusService();
    const messages = await collect(
      live,
      () => true,
      () => {
        live.publish(event({ type: 'position.confirmed', positionId: 'pos-1' }));
        live.publish(event({ type: 'collaboration.invited' }));
      },
    );
    expect(messages.map((m) => m.type)).toEqual(['position.confirmed', 'collaboration.invited']);
    expect(messages[0]?.data.positionId).toBe('pos-1');
  });

  it('liefert das Ereignis unverändert als data (recipients bleiben sichtbar)', async () => {
    const live = new LiveStatusService();
    const e = event({ recipients: ['ma-1', 'ma-2'] });
    const messages = await collect(
      live,
      () => true,
      () => live.publish(e),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.data).toEqual(e);
  });

  it('wendet das Prädikat an (Mitarbeiter-Stream sieht nur Adressiertes)', async () => {
    const live = new LiveStatusService();
    const messages = await collect(
      live,
      (e) => isAddressedTo(e, 'ma-2'),
      () => {
        live.publish(event({ recipients: ['ma-1'] }));
        live.publish(event({ recipients: ['ma-1', 'ma-2'], caseId: 'geteilt' }));
        live.publish(event({ recipients: [] }));
      },
    );
    expect(messages.map((m) => m.data.caseId)).toEqual(['geteilt']);
  });
});

describe('isAddressedTo (§16.1)', () => {
  it('trifft nur, wenn die eigene Personalnummer in recipients steht', () => {
    expect(isAddressedTo(event({ recipients: ['ma-1', 'ma-2'] }), 'ma-2')).toBe(true);
    expect(isAddressedTo(event({ recipients: ['ma-1'] }), 'ma-2')).toBe(false);
  });

  it('leere Empfängerliste erreicht keinen Mitarbeiter (nur den Teamlead-Stream)', () => {
    expect(isAddressedTo(event({ recipients: [] }), 'ma-1')).toBe(false);
  });

  it('ein Principal ohne Personalnummer sieht nichts', () => {
    expect(isAddressedTo(event({ recipients: ['ma-1'] }), undefined)).toBe(false);
  });
});
