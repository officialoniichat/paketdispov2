import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CaseStatus as PrismaCaseStatus, type WorkflowEvent } from '@prisma/client';
import type { ActorType, CaseStatus, WorkflowEventType } from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventLogService } from '../events/event-log.service.js';
import { logger } from '../observability/logger.js';
import { assertTransition, InvalidCaseTransitionError } from './case-state-machine.js';

export interface TransitionActor {
  actorType: ActorType;
  actorId?: string;
}

export interface TransitionInput {
  caseId: string;
  toStatus: CaseStatus;
  /**
   * §7.2 milestone event recorded atomically with the status change. Omit for
   * routine structural hops that are not fachlich-relevant milestones — those
   * are written to the technical log instead (§16.2 separation).
   */
  eventType?: WorkflowEventType;
  actor: TransitionActor;
  payload?: unknown;
  /** Optimistic-lock guard; rejects if the case was modified concurrently. */
  expectedVersion?: number;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface TransitionResult {
  caseId: string;
  status: CaseStatus;
  version: number;
  event: WorkflowEvent | null;
}

/**
 * Drives case status transitions (§7.1) transactionally: validate the edge,
 * update the case under optimistic locking, and append the audit event in the
 * same transaction so status and event are always consistent.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
  ) {}

  async transition(input: TransitionInput): Promise<TransitionResult> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.goodsReceiptCase.findUnique({
        where: { id: input.caseId },
        select: { id: true, status: true, version: true, completedAt: true },
      });
      if (!current) {
        throw new NotFoundException(`Case ${input.caseId} not found`);
      }
      if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
        throw new ConflictException('Case was modified concurrently (version mismatch)');
      }

      try {
        assertTransition(current.status as CaseStatus, input.toStatus);
      } catch (err) {
        if (err instanceof InvalidCaseTransitionError) {
          throw new BadRequestException(err.message);
        }
        throw err;
      }

      // Abschlusszeitpunkt (A6 Archiv): stamped exactly once when the case first
      // reaches a completion state (completed, or zst_done on the export path).
      const reachesCompletion = input.toStatus === 'completed' || input.toStatus === 'zst_done';
      const updated = await tx.goodsReceiptCase.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          status: input.toStatus as PrismaCaseStatus,
          version: { increment: 1 },
          ...(reachesCompletion && current.completedAt === null
            ? { completedAt: new Date() }
            : {}),
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('Case was modified concurrently');
      }

      let event: WorkflowEvent | null = null;
      if (input.eventType) {
        event = await this.eventLog.append(
          {
            eventType: input.eventType,
            entityType: 'GoodsReceiptCase',
            entityId: current.id,
            actorType: input.actor.actorType,
            actorId: input.actor.actorId,
            payload: {
              from: current.status,
              to: input.toStatus,
              ...this.payloadObject(input.payload),
            },
            correlationId: input.correlationId,
            idempotencyKey: input.idempotencyKey,
          },
          tx,
        );
      } else {
        // Structural hop: technical sink only, no fachlicher Eventlog-Eintrag.
        logger.debug(
          { kind: 'case_transition', caseId: current.id, from: current.status, to: input.toStatus },
          'case status transition (no milestone)',
        );
      }

      return {
        caseId: current.id,
        status: input.toStatus,
        version: current.version + 1,
        event,
      };
    });
  }

  private payloadObject(payload: unknown): Record<string, unknown> {
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  }
}
