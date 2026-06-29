import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { LocationKind, Prisma } from '@prisma/client';
import {
  DEFAULT_RULE_CONFIG,
  RULE_CONFIG_KEY,
  ruleConfigSchema,
  type RuleConfig,
} from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LocationDto, LocationUpsertDto, RuleConfigDto } from './admin.dto.js';

/** Scalar write columns for a location upsert (shared by create + update). */
interface LocationWriteData {
  displayName: string;
  kind: LocationKind;
  zone: string | null;
  sequenceIndex: number | null;
  scanCode: string | null;
  active: boolean;
}

/**
 * §11 Admin surface: the location master (CRUD-by-replace) and the structured
 * rule config (singleton JSON document under {@link RULE_CONFIG_KEY}). Pure data
 * access on top of Prisma — no event emission, no engine coupling — kept separate
 * from the teamlead command/read services so admin master-data stays isolated.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Locations ------------------------------------------------------------

  async listLocations(): Promise<LocationDto[]> {
    const rows = await this.prisma.location.findMany({
      orderBy: [{ sequenceIndex: 'asc' }, { code: 'asc' }],
    });
    return rows.map((l) => this.toLocationDto(l));
  }

  /**
   * Replace the whole location list: upsert every row in the payload by its
   * natural `code`, then reconcile any location MISSING from the payload by
   * soft-deactivating it (`active: false`) rather than hard-deleting — except a
   * location still referenced by a case or route stop, which is rejected with a
   * 409 so a teamlead can never orphan operational data. Returns the full list.
   */
  async replaceLocations(payload: LocationUpsertDto[]): Promise<LocationDto[]> {
    const keepCodes = new Set(payload.map((l) => l.code));

    const existing = await this.prisma.location.findMany({ select: { id: true, code: true } });
    const removedCodes = existing.filter((l) => !keepCodes.has(l.code)).map((l) => l.code);

    // FK guard: a removed location referenced by a case or route stop is blocked.
    if (removedCodes.length > 0) {
      const blocking = await this.findReferencedCodes(removedCodes);
      if (blocking.length > 0) {
        throw new ConflictException(
          `Lagerplatz wird noch verwendet und kann nicht entfernt werden: ${blocking.join(', ')}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const row of payload) {
        const data = this.toLocationWriteData(row);
        await tx.location.upsert({
          where: { code: row.code },
          update: data,
          create: { code: row.code, ...data },
        });
      }
      if (removedCodes.length > 0) {
        await tx.location.updateMany({
          where: { code: { in: removedCodes } },
          data: { active: false },
        });
      }
    });

    return this.listLocations();
  }

  /** Codes among `codes` that are still referenced by a case or route stop. */
  private async findReferencedCodes(codes: string[]): Promise<string[]> {
    const referenced = await this.prisma.location.findMany({
      where: {
        code: { in: codes },
        OR: [{ cases: { some: {} } }, { routeStops: { some: {} } }],
      },
      select: { code: true },
    });
    return referenced.map((l) => l.code);
  }

  // --- Rule config ----------------------------------------------------------

  /** Read the structured rule config; falls back to the default if unset/invalid. */
  async getRuleConfig(): Promise<RuleConfigDto> {
    const row = await this.prisma.appConfig.findUnique({ where: { key: RULE_CONFIG_KEY } });
    const parsed = ruleConfigSchema.safeParse(row?.value);
    const config = parsed.success ? parsed.data : DEFAULT_RULE_CONFIG;
    return config as RuleConfigDto;
  }

  /**
   * Validate the incoming config against the domain Zod schema (the single source
   * of truth) and persist it as the singleton JSON document. A parse failure is
   * surfaced as a 400 with the field-level Zod issues, not a 500.
   */
  async replaceRuleConfig(input: RuleConfigDto): Promise<RuleConfigDto> {
    // The DTO's `section` widens to `number` for OpenAPI; the Zod schema is the trust
    // boundary that narrows it back to a valid SectionCode (or 400s).
    const parsed = ruleConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Ungültige Regelkonfiguration',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    await this.persistRuleConfig(parsed.data);
    return parsed.data as RuleConfigDto;
  }

  /** Idempotent default seed: only writes the default when no row exists yet. */
  async seedDefaultRuleConfig(): Promise<void> {
    const existing = await this.prisma.appConfig.findUnique({ where: { key: RULE_CONFIG_KEY } });
    if (existing) return;
    await this.persistRuleConfig(DEFAULT_RULE_CONFIG);
  }

  private async persistRuleConfig(config: RuleConfig): Promise<void> {
    const value = config as unknown as Prisma.InputJsonValue;
    await this.prisma.appConfig.upsert({
      where: { key: RULE_CONFIG_KEY },
      update: { value },
      create: { key: RULE_CONFIG_KEY, value },
    });
  }

  // --- mappers --------------------------------------------------------------

  private toLocationDto(l: {
    id: string;
    code: string;
    displayName: string;
    kind: LocationKind;
    zone: string | null;
    sequenceIndex: number | null;
    scanCode: string | null;
    active: boolean;
  }): LocationDto {
    return {
      id: l.id,
      code: l.code,
      displayName: l.displayName,
      kind: l.kind,
      zone: l.zone,
      sequenceIndex: l.sequenceIndex,
      scanCode: l.scanCode,
      active: l.active,
    };
  }

  /** Project an upsert row onto the Prisma write shape (without the natural key). */
  private toLocationWriteData(row: LocationUpsertDto): LocationWriteData {
    return {
      displayName: row.displayName,
      kind: row.kind as LocationKind,
      zone: row.zone ?? null,
      sequenceIndex: row.sequenceIndex ?? null,
      scanCode: row.scanCode ?? null,
      active: row.active,
    };
  }
}
