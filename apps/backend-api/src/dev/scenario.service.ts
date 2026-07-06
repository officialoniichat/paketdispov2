import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClockService } from '../clock/clock.service.js';
import {
  DEV_CURRENT_SCENARIO_KEY,
  devCurrentScenarioSchema,
} from '../config/dev-state.js';
import {
  DEFAULT_SCENARIO_KEY,
  SCENARIOS,
  findScenario,
  loadScenario,
} from './scenarios/index.js';
import type { DevScenariosDto, ScenarioInfoDto, ScenarioLoadResultDto } from './dev.dto.js';

/**
 * Thin API adapter over the HTTP-free scenario framework (./scenarios): catalog
 * listing, reset+seed loads, and the persisted "which scenario is the data in"
 * marker (AppConfig {@link DEV_CURRENT_SCENARIO_KEY}).
 *
 * Reset semantics: "Zurücksetzen auf Standard" LOADS the 'standard' scenario and
 * records it as the active key (not null) — the marker always names the scenario
 * the case graph was last rebuilt from; null only means "never scenario-managed".
 */
@Injectable()
export class ScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Catalog + current state for the dev panel. */
  async state(): Promise<DevScenariosDto> {
    const [activeScenarioKey, override] = await Promise.all([
      this.activeScenarioKey(),
      this.clock.currentOverride(),
    ]);
    return {
      scenarios: SCENARIOS.map((s): ScenarioInfoDto => ({
        key: s.key,
        name: s.name,
        description: s.description,
        expectedOutcome: s.expectedOutcome,
      })),
      activeScenarioKey,
      timeOverride: override ? override.toISOString() : null,
    };
  }

  /** Reset + seed the given scenario; 404 for an unknown key. */
  async load(key: string): Promise<ScenarioLoadResultDto> {
    if (!findScenario(key)) {
      throw new NotFoundException(`Unbekanntes Szenario "${key}"`);
    }
    // Anchor the scenario on the EFFECTIVE day: with an active time override the
    // data lands on the frozen "today", exactly what a time-travel demo expects.
    const baseDate = (await this.clock.now()).toISOString().slice(0, 10);
    const summary = await loadScenario(this.prisma, key, { baseDate });
    await this.recordActiveScenario(key);
    return { key, baseDate, ...summary };
  }

  /** "Zurücksetzen auf Standard": load the default scenario. */
  reset(): Promise<ScenarioLoadResultDto> {
    return this.load(DEFAULT_SCENARIO_KEY);
  }

  private async activeScenarioKey(): Promise<string | null> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: DEV_CURRENT_SCENARIO_KEY },
    });
    const parsed = devCurrentScenarioSchema.safeParse(row?.value);
    return parsed.success ? parsed.data.key : null;
  }

  private async recordActiveScenario(key: string): Promise<void> {
    const value = { key } satisfies Prisma.InputJsonValue;
    await this.prisma.appConfig.upsert({
      where: { key: DEV_CURRENT_SCENARIO_KEY },
      update: { value },
      create: { key: DEV_CURRENT_SCENARIO_KEY, value },
    });
  }
}
