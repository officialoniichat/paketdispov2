import {
  ruleConfigSchema,
  DEFAULT_RULE_CONFIG,
  RULE_CONFIG_KEY,
  type RuleConfig,
} from '@paket/domain-types';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Load the singleton §11 {@link RuleConfig} from AppConfig, falling back to
 * {@link DEFAULT_RULE_CONFIG} when unset/invalid. Single source for every service that
 * needs the live rule config (assignment planning + teamlead read models), so the
 * cockpit-edited parameters are read identically everywhere.
 */
export async function loadRuleConfig(prisma: PrismaService): Promise<RuleConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: RULE_CONFIG_KEY } });
  const parsed = ruleConfigSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_RULE_CONFIG;
}
