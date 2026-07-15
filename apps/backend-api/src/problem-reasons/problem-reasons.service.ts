import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProblemReasonDto, ProblemReasonUpsertDto } from './problem-reasons.dto.js';

/**
 * Admin-verwalteter Problemarten-Katalog (Kundenfeedback 14.07.2026, Punkt 5).
 * Frei definierbar und nachträglich editierbar; Issues tragen einen Label-Snapshot,
 * daher bleiben alte Meldungen auch nach Katalog-Edits lesbar. Gründe, die von
 * Issues referenziert werden, werden beim Entfernen nur deaktiviert.
 */
@Injectable()
export class ProblemReasonsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Aktive Gründe in Anzeige-Reihenfolge — die Auswahl der Mitarbeiter-App. */
  async listActive(): Promise<ProblemReasonDto[]> {
    const rows = await this.prisma.problemReason.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toDto);
  }

  /** Vollständiger Katalog (inkl. inaktiver Gründe) für die Admin-Pflege. */
  async listAll(): Promise<ProblemReasonDto[]> {
    const rows = await this.prisma.problemReason.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toDto);
  }

  /**
   * Replace-all-Upsert (Muster: Location-Master): Zeilen mit id werden
   * aktualisiert, ohne id neu angelegt. Nicht mehr enthaltene Gründe werden
   * gelöscht — außer sie sind von Issues referenziert, dann nur deaktiviert.
   */
  async replaceAll(rows: ProblemReasonUpsertDto[]): Promise<ProblemReasonDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const keptIds = new Set(rows.map((r) => r.id).filter((id): id is string => id != null));
      const removed = await tx.problemReason.findMany({
        where: { id: { notIn: [...keptIds] } },
        select: { id: true, issues: { select: { id: true }, take: 1 } },
      });
      const deactivateIds = removed.filter((r) => r.issues.length > 0).map((r) => r.id);
      const deleteIds = removed.filter((r) => r.issues.length === 0).map((r) => r.id);
      if (deactivateIds.length > 0) {
        await tx.problemReason.updateMany({
          where: { id: { in: deactivateIds } },
          data: { active: false },
        });
      }
      if (deleteIds.length > 0) {
        await tx.problemReason.deleteMany({ where: { id: { in: deleteIds } } });
      }
      for (const row of rows) {
        const data = { label: row.label, active: row.active ?? true, sortOrder: row.sortOrder };
        if (row.id) {
          await tx.problemReason.update({ where: { id: row.id }, data });
        } else {
          await tx.problemReason.create({ data });
        }
      }
    });
    return this.listAll();
  }
}

function toDto(row: {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}): ProblemReasonDto {
  return { id: row.id, label: row.label, active: row.active, sortOrder: row.sortOrder };
}
