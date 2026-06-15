import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Global module so every feature module can inject the shared PrismaService. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
