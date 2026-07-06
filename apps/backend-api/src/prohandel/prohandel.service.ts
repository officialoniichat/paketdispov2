import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import type { Principal } from '../auth/rbac.js';
import { generateBelege } from './beleg-generator.js';
import { persistGeneratedBeleg } from './beleg-persist.js';
import type { ProhandelPullResultDto } from './prohandel.dto.js';

/** Belege je „Jetzt pullen" (mock — die echte Anbindung liefert ein Delta). */
const PULL_BATCH_SIZE = 8;

/**
 * Mock-ProHandel-Connector (Teamlead-Feedback A9). Kein echter HTTP-Call: „Jetzt
 * pullen" erzeugt deterministisch die nächste Beleg-Charge mit ALLEN ERP-Feldern
 * (Preise, WGR, CatMan, Sicherungstyp, Prüfstufe, Kartons, Shop/Filiale,
 * Liefergruppen) direkt in der Datenbank — identische Datenform wie der Seed über
 * die gemeinsame {@link persistGeneratedBeleg}-Senke.
 */
@Injectable()
export class ProhandelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventLogService,
  ) {}

  async pull(principal: Principal, now: Date = new Date()): Promise<ProhandelPullResultDto> {
    const day = now.toISOString().slice(0, 10);

    const locations = await this.prisma.location.findMany({
      where: { active: true, kind: { notIn: ['workstation', 'printer'] } },
      select: { id: true, code: true },
    });
    if (locations.length === 0) {
      return { pulledCases: 0, blockedCases: 0, weBelegNos: [], date: day };
    }
    const locationIdByCode = new Map(locations.map((l) => [l.code, l.id]));

    // Nächste freie WE-Nummer aus dem Bestand ableiten (deterministischer Cursor).
    const existing = await this.prisma.goodsReceiptCase.findMany({
      select: { weBelegNo: true },
      orderBy: { weBelegNo: 'desc' },
      take: 1,
    });
    const maxNo = existing[0] ? Number(existing[0].weBelegNo.replace(/\D/g, '').slice(-6)) : 0;
    const startNo = (Number.isFinite(maxNo) ? maxNo : 0) + 1;

    const belege = generateBelege({
      seed: startNo,
      count: PULL_BATCH_SIZE,
      startNo,
      bookingDate: day,
      storageCodes: locations.map((l) => l.code),
    });

    const persisted = await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const beleg of belege) {
        const result = await persistGeneratedBeleg(tx, beleg, locationIdByCode);
        results.push({ ...result, weBelegNo: beleg.weBelegNo });
        // Intake-Gate (D1): unvollständige Buchungen landen als `blocked` in der
        // „zurück an Bucher"-Queue — sichtbar im Audit-Log.
        if (result.blocked) {
          await this.events.append(
            {
              eventType: 'case.intake_blocked',
              entityType: 'GoodsReceiptCase',
              entityId: result.id,
              actorType: 'system',
              actorId: principal.sub,
              payload: { weBelegNo: beleg.weBelegNo, missingFields: result.missingFields },
            },
            tx,
          );
        }
      }
      await this.events.append(
        {
          eventType: 'integration.pull_completed',
          entityType: 'Integration',
          entityId: 'prohandel',
          actorType: 'system',
          actorId: principal.sub,
          payload: {
            pulledCases: results.length,
            blockedCases: results.filter((r) => r.blocked).length,
            weBelegNos: belege.map((b) => b.weBelegNo),
          },
        },
        tx,
      );
      return results;
    });

    return {
      pulledCases: persisted.length,
      blockedCases: persisted.filter((r) => r.blocked).length,
      weBelegNos: belege.map((b) => b.weBelegNo),
      date: day,
    };
  }
}
