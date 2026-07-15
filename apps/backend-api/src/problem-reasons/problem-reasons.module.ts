import { Module } from '@nestjs/common';
import { ProblemReasonsService } from './problem-reasons.service.js';
import { ProblemReasonsController } from './problem-reasons.controller.js';

/** Admin-verwalteter Problemarten-Katalog (Kundenfeedback 14.07.2026). */
@Module({
  controllers: [ProblemReasonsController],
  providers: [ProblemReasonsService],
  exports: [ProblemReasonsService],
})
export class ProblemReasonsModule {}
