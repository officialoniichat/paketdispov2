import { Injectable } from '@nestjs/common';
import { Prisma, type WorkflowEvent } from '@prisma/client';
import type { ActorType, WorkflowEventType } from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { logger } from '../observability/logger.js';
import { computeEventHash, verifyChainLinks, type ChainLink } from './event-hash.js';

/** Postgres advisory-lock key serialising appends so the chain stays linear. */
const EVENT_CHAIN_LOCK = BigInt(795130264);

export type PrismaTx = Prisma.TransactionClient;

export interface AppendEventInput {
  eventType: WorkflowEventType;
  entityType: string;
  entityId: string;
  actorType: ActorType;
  actorId?: string;
  payload?: unknown;
  correlationId?: string;
  /** Optional dedup key for at-least-once producers (import/ZST). */
  idempotencyKey?: string;
  occurredAt?: Date;
}

export interface IntegrityReport {
  ok: boolean;
  count: number;
  brokenAtSeq?: string;
}

/**
 * Append-only, tamper-evident workflow event log (§7.2, §16.2).
 *
 * Each business event is persisted as a row in `workflow_events` and linked into
 * a sha256 hash chain. Technical diagnostics go to the pino logger / OTel — a
 * deliberately separate sink, so business audit data and technical logs never
 * mix (§16.2: "trennt fachliche Events von technischen Logs").
 */
@Injectable()
export class EventLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends an event, optionally inside an existing transaction so a status
   * transition and its event commit atomically.
   */
  async append(input: AppendEventInput, tx?: PrismaTx): Promise<WorkflowEvent> {
    if (tx) return this.appendInTx(tx, input);
    return this.prisma.$transaction((client) => this.appendInTx(client, input));
  }

  private async appendInTx(client: PrismaTx, input: AppendEventInput): Promise<WorkflowEvent> {
    if (input.idempotencyKey) {
      const existing = await client.workflowEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    // Serialise concurrent appends so prevHash linkage cannot fork.
    await client.$executeRaw`SELECT pg_advisory_xact_lock(${EVENT_CHAIN_LOCK})`;

    const last = await client.workflowEvent.findFirst({ orderBy: { seq: 'desc' } });
    const prevHash = last?.hash ?? null;
    const timestamp = input.occurredAt ?? new Date();

    const hashable = {
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      timestamp: timestamp.toISOString(),
      payload: input.payload ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      correlationId: input.correlationId ?? null,
    };
    const hash = computeEventHash(prevHash, hashable);

    const created = await client.workflowEvent.create({
      data: {
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        actorType: input.actorType as ActorType,
        actorId: input.actorId,
        timestamp,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        hash,
        prevHash,
      },
    });

    logger.debug(
      {
        kind: 'workflow_event',
        eventType: created.eventType,
        entityType: created.entityType,
        entityId: created.entityId,
        seq: created.seq.toString(),
      },
      'workflow event appended',
    );

    return created;
  }

  /** Re-derives the hash chain and detects the first tampered row, if any. */
  async verifyIntegrity(limit?: number): Promise<IntegrityReport> {
    const rows = await this.prisma.workflowEvent.findMany({
      orderBy: { seq: 'asc' },
      take: limit,
    });
    const links: ChainLink[] = rows.map((row) => ({
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorType: row.actorType,
      actorId: row.actorId,
      timestamp: row.timestamp.toISOString(),
      payload: row.payload,
      idempotencyKey: row.idempotencyKey,
      correlationId: row.correlationId,
      hash: row.hash,
      prevHash: row.prevHash,
    }));
    const result = verifyChainLinks(links);
    return {
      ok: result.ok,
      count: rows.length,
      brokenAtSeq:
        result.brokenAtIndex !== undefined ? rows[result.brokenAtIndex]?.seq.toString() : undefined,
    };
  }
}
