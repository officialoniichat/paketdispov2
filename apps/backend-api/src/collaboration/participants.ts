/**
 * Beteiligungs-Hilfsfunktionen für geteilte Belege (Konzept beleg-zusammenarbeit
 * §5/§6) — bewusst OHNE Nest-DI: reine Funktionen über einem Prisma-Client bzw.
 * einer laufenden Transaktion. CasesService, TeamleadService und
 * AssignmentService nutzen sie, ohne dass sich ihre Konstruktoren ändern (die
 * Integrationstests konstruieren diese Services per `new`).
 */
import type { Prisma } from '@prisma/client';
import type { ActorType } from '@paket/domain-types';
import type { EventLogService } from '../events/event-log.service.js';
import type { CaseCollaborationDto, CaseParticipantDto } from '../cases/cases.dto.js';

/**
 * Kleinster gemeinsamer Prisma-Ausschnitt: der Root-Client erfüllt den
 * TransactionClient strukturell, damit dieselben Helfer innerhalb UND außerhalb
 * einer Transaktion laufen.
 */
export type Db = Prisma.TransactionClient;

/** Aktive Beteiligung: sieht und bearbeitet den Beleg (Konzept §5.1). */
export const ACTIVE_PARTICIPANT_STATUSES = ['angenommen', 'teil_erledigt'] as const;

/** employeeNos aller AKTIVEN Beteiligten (angenommen|teil_erledigt) eines Belegs. */
export async function activeParticipantEmployeeNos(db: Db, caseId: string): Promise<string[]> {
  const rows = await db.caseParticipant.findMany({
    where: { caseId, status: { in: [...ACTIVE_PARTICIPANT_STATUSES] } },
    select: { employee: { select: { employeeNo: true } } },
  });
  return rows.map((r) => r.employee.employeeNo);
}

/**
 * Live-Empfänger eines Belegs (Konzept §8): Inhaber (Mitarbeiter des Bündels)
 * plus aktive Beteiligte, dedupliziert. Ohne Bündel (Beleg gerade entzogen)
 * bleiben die Beteiligten die Empfänger.
 */
export async function recipientsForCase(db: Db, caseId: string): Promise<string[]> {
  const [row, participants] = await Promise.all([
    db.goodsReceiptCase.findUnique({
      where: { id: caseId },
      select: { assignedBundle: { select: { employee: { select: { employeeNo: true } } } } },
    }),
    activeParticipantEmployeeNos(db, caseId),
  ]);
  const owner = row?.assignedBundle?.employee?.employeeNo;
  return [...new Set([...(owner ? [owner] : []), ...participants])];
}

/**
 * Eine Zusammenarbeit ist AKTIV, sobald mindestens ein HELFER angenommen oder
 * teil_erledigt ist (Konzept §6) — die Inhaber-Zeile allein macht den Beleg
 * nicht zum geteilten Beleg.
 */
export async function isCollaborationActive(db: Db, caseId: string): Promise<boolean> {
  const row = await db.caseParticipant.findFirst({
    where: { caseId, role: 'helfer', status: { in: [...ACTIVE_PARTICIPANT_STATUSES] } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Ende der Zusammenarbeit (Konzept §5.5): verlässt der Beleg den Karren des
 * Inhabers (Entziehen, Verschieben, Stornieren, Parken, „Rest parken"), werden
 * ALLE Beteiligungen gelöscht und `case.collaboration_dissolved` protokolliert.
 * Geprüfte Positionen bleiben geprüft. Liefert die employeeNos der ehemaligen
 * Beteiligten (z. B. für Live-Benachrichtigungen); ohne Beteiligte passiert
 * nichts und es wird auch KEIN Event geschrieben.
 */
export async function dissolveCollaborationTx(
  tx: Db,
  caseId: string,
  events: EventLogService,
  actor: { actorType: ActorType; actorId?: string },
): Promise<string[]> {
  const rows = await tx.caseParticipant.findMany({
    where: { caseId },
    select: { role: true, status: true, employee: { select: { employeeNo: true } } },
  });
  if (rows.length === 0) return [];
  await tx.caseParticipant.deleteMany({ where: { caseId } });
  await events.append(
    {
      eventType: 'case.collaboration_dissolved',
      entityType: 'GoodsReceiptCase',
      entityId: caseId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      payload: {
        participants: rows.map((r) => ({
          employeeNo: r.employee.employeeNo,
          role: r.role,
          status: r.status,
        })),
      },
    },
    tx,
  );
  return rows.map((r) => r.employee.employeeNo);
}

/** Persistenz-Ausschnitt einer Beteiligung, wie ihn die DTO-Projektion braucht. */
export interface ParticipantRow {
  id: string;
  employeeId: string;
  role: string;
  status: string;
  invitedAt: Date;
  respondedAt: Date | null;
  partDoneAt: Date | null;
  employee: { employeeNo: string; displayName: string };
}

/** Eine Beteiligungs-Zeile → {@link CaseParticipantDto} (reine Projektion). */
export function toParticipantDto(
  p: ParticipantRow,
  confirmedPositionCount: number,
): CaseParticipantDto {
  return {
    participantId: p.id,
    employeeNo: p.employee.employeeNo,
    displayName: p.employee.displayName,
    role: p.role,
    status: p.status,
    invitedAt: p.invitedAt.toISOString(),
    respondedAt: p.respondedAt ? p.respondedAt.toISOString() : null,
    partDoneAt: p.partDoneAt ? p.partDoneAt.toISOString() : null,
    confirmedPositionCount,
  };
}

/**
 * Beteiligte + Prüf-Fortschritt → {@link CaseCollaborationDto} (reine Projektion,
 * eine Wahrheit für /api/me/today, das Aggregat und die Antworten des
 * Zusammenarbeits-Moduls). `null`, solange der Beleg nie geteilt wurde.
 */
export function toCollaborationDto(
  participants: readonly ParticipantRow[],
  positions: readonly { confirmedById: string | null }[],
): CaseCollaborationDto | null {
  if (participants.length === 0) return null;
  const confirmedByEmployee = new Map<string, number>();
  let confirmedPositionCount = 0;
  for (const position of positions) {
    if (position.confirmedById === null) continue;
    confirmedPositionCount += 1;
    confirmedByEmployee.set(
      position.confirmedById,
      (confirmedByEmployee.get(position.confirmedById) ?? 0) + 1,
    );
  }
  return {
    positionCount: positions.length,
    confirmedPositionCount,
    participants: participants.map((p) =>
      toParticipantDto(p, confirmedByEmployee.get(p.employeeId) ?? 0),
    ),
  };
}

/** Beteiligte + Positionen eines Belegs laden und projizieren (frischer Stand). */
export async function loadCollaborationDto(
  db: Db,
  caseId: string,
): Promise<CaseCollaborationDto | null> {
  const [participants, positions] = await Promise.all([
    db.caseParticipant.findMany({
      where: { caseId },
      orderBy: { invitedAt: 'asc' },
      include: { employee: { select: { employeeNo: true, displayName: true } } },
    }),
    db.receiptPosition.findMany({ where: { caseId }, select: { confirmedById: true } }),
  ]);
  return toCollaborationDto(participants, positions);
}
