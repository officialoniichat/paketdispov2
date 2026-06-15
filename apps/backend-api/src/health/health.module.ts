import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../auth/rbac.js';
import { DOMAIN_MODULES } from '../modules/index.js';

/** Liveness & readiness probes (§16.3 Betrieb). Public — no auth required. */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('healthz')
  @ApiOkResponse({ description: 'Process is up' })
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('readyz')
  @ApiOkResponse({ description: 'Dependencies reachable' })
  async ready(): Promise<{ status: string; modules: readonly string[] }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', modules: DOMAIN_MODULES };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
