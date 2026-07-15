import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assignWork,
  buildPickupSequence,
  classifyPriority,
  computeEffort,
  createBalancedBundles,
  finishableBudgetMinutes,
  sortByPriority,
  type EngineInput,
  type EnrichedCase,
  type PickupCase,
} from '@paket/assignment-engine';
import {
  assignmentBundleSchema,
  bereichFromLocationKind,
  weeklyPatternSchema,
  type AssignmentBundle,
  type BundlePickupSequence,
  type GoodsReceiptCase,
  type LocationMaster,
  type RuleConfig,
  type WeeklyPattern,
} from '@paket/domain-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { applyResolvedLoadPlanDates, engineConfigFromRuleConfig } from './load-plan.js';
import { buildEffortVectors } from './effort-vector.js';
import { caseEffortInclude } from '../cases/case-effort.js';
import { loadRuleConfig } from '../config/rule-config.js';

type PrismaTx = Prisma.TransactionClient;
import { EventLogService } from '../events/event-log.service.js';
import type { Principal } from '../auth/rbac.js';
import { toEmployeeShift, toGoodsReceiptCase, toLocationMaster } from './assignment.mappers.js';
import type { NextBundleResultDto, RecalculateResultDto } from './assignment.dto.js';

const POOL_STATUS = 'ready' as const;

/**
 * Read set for the §E.4 Simulation/Vorschau. Unlike recalculate (which only plans
 * the freed `ready` pool), preview also re-includes cases already placed in today's
 * plan but not yet started (`assigned`). After a commit the `ready` pool is empty, so
 * a `ready`-only preview would return an empty proposal; including `assigned` lets
 * "Simulieren" meaningfully re-propose today's plan. Cases an employee has begun
 * (in_progress/.../completed) are intentionally excluded — they are no longer re-planable.
 */
const PREVIEW_POOL_STATUSES = ['ready', 'assigned'] as const;

/**
 * Assignment engine wiring (§8.3, Anhang E.5). Reads the ready pool + the day's
 * shifts + location master, runs the pure deterministic engine, and persists the
 * resulting bundles/route-stops transactionally with audit events. Teamlead
 * "Neu berechnen" calls this; it stays well under the < 5 s budget.
 */
@Injectable()
export class AssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventLogService,
  ) {}

  /**
   * Read the structured rule config (AppConfig `rule_config`), the single source for
   * the Teamlead-Punkt-4 Vorlauf, the Verladeplan calendar and the Punkt-5 Schichtende-
   * Cutoff. Falls back to the default when unset/invalid so recalculate/preview never
   * fail on missing config.
   */
  private readRuleConfig(): Promise<RuleConfig> {
    return loadRuleConfig(this.prisma);
  }

  async recalculate(
    principal: Principal,
    date?: string,
    now: Date = new Date(),
  ): Promise<RecalculateResultDto> {
    const day = date ?? now.toISOString().slice(0, 10);
    const start = day + 'T00:00:00.000Z';
    const end = day + 'T23:59:59.999Z';
    const dayStart = new Date(start);
    const dayEnd = new Date(end);

    // Ensure each active employee's concrete shift for the day exists, derived from
    // their weekly pattern (Wochenplan drives capacity). This makes recalculate work
    // for ANY day — not just a pre-seeded one — so the board is never empty just
    // because the calendar rolled over to a new (un-materialized) date.
    await this.materializeShiftsForDate(day, dayStart);

    const [allShiftRows, locationRows, ruleConfig] = await Promise.all([
      this.prisma.shift.findMany({
        where: { date: { gte: dayStart, lte: dayEnd }, active: true },
        include: { employee: { select: { id: true, bereiche: true, skillTier: true } } },
      }),
      this.prisma.location.findMany({ where: { active: true } }),
      this.readRuleConfig(),
    ]);
    const engineConfig = engineConfigFromRuleConfig(ruleConfig);

    // Monster-Beleg-Fortsetzung (C6): Mitarbeiter, die noch an einem offenen Beleg
    // über der Teile-Schwelle arbeiten (in_progress/problem_resolved), bekommen KEIN
    // neues Starter-Pack — ihre Schicht wird der Verteilung entzogen, bis der Beleg
    // fertig ist. Ein rot geparkter Problemfall (issue_open) entzieht die Schicht
    // NICHT: der MA arbeitet währenddessen an anderer Ware (Kundenfeedback 14.07.2026).
    const continuationCases = await this.prisma.goodsReceiptCase.findMany({
      where: {
        status: { in: ['in_progress', 'problem_resolved'] },
        totalQuantity: { gte: engineConfig.assignment.largeBelegTeileThreshold },
        assignedBundleId: { not: null },
      },
      select: { assignedBundle: { select: { employeeId: true } } },
    });
    const continuationEmployeeIds = new Set(
      continuationCases.map((c) => c.assignedBundle?.employeeId).filter((id): id is string => !!id),
    );
    const shiftRows = allShiftRows.filter((s) => !continuationEmployeeIds.has(s.employee.id));

    // ONE transaction: clearing the prior plan, re-reading the freed pool, running
    // the engine, and persisting the new plan all commit (or roll back) together so
    // a failure leaves the previous plan intact (§8.3 "Neu berechnen" must be re-runnable).
    // The callback returns the engine plan + metrics so we never need a post-tx cast.
    const { plan, durationMs, assignedCaseCount } = await this.prisma.$transaction(async (tx) => {
      // 1. Clear the prior plan for this date so the re-insert is clean and idempotent.
      //    Only revert cases that a PRIOR recalc left in `assigned` — cases an employee
      //    has already started/completed (in_progress/.../completed) are left alone.
      await this.clearPriorPlanForDate(tx, dayStart, dayEnd);

      // 2. Re-read the now-freed `ready` pool inside the transaction (reverted cases
      //    are back in the pool, in-flight cases are excluded by their status).
      const casesRows = await tx.goodsReceiptCase.findMany({
        where: { status: POOL_STATUS },
        include: caseEffortInclude,
      });

      // 2a. Clear-before-insert (§8.3 idempotency): a case in the freed `ready` pool must
      //     not still be a member of ANY bundle. A residual AssignmentItem — e.g. left
      //     behind when a workflow transition put a case back to `ready` (transitions
      //     only flip the status; they do NOT unlink the bundle
      //     or drop the item) — would otherwise collide with this plan's freshly created
      //     item on the @@unique([caseId]) constraint (Prisma P2002) inside persistBundle.
      //     clearPriorPlanForDate cannot catch it: the owning bundle stays "referenced"
      //     (and is kept), yet the case is no longer `assigned`. Dropping these stale rows
      //     before the re-insert makes recalculate fully idempotent and re-runnable.
      const poolCaseIds = casesRows.map((c) => c.id);
      if (poolCaseIds.length > 0) {
        await tx.assignmentItem.deleteMany({ where: { caseId: { in: poolCaseIds } } });
      }

      const input: EngineInput = {
        date: day,
        // Resolve each case's next Verladetag from the live calendar so the engine's
        // Vorlauf-relative overdue logic (Teamlead-Punkt 4) has a date to compare.
        cases: applyResolvedLoadPlanDates(
          casesRows.map(toGoodsReceiptCase),
          ruleConfig.loadPlan,
          day,
        ),
        shifts: shiftRows.map((s) => toEmployeeShift(s, s.employee.bereiche, s.employee.skillTier)),
        locations: locationRows.map(toLocationMaster),
        // §8.2 LIVE wiring: for every case that has a work instruction, recompute its
        // effort from the cockpit-edited parameters (engineConfig.effort) via the pure
        // computeEffort. Cases without one keep their precomputed estimatedMinutes.
        effortVectors: buildEffortVectors(casesRows),
      };

      const t0 = performance.now();
      // §8.3 + Schichtende-Cutoff (Punkt 5): the engine holds back the last
      // `autoCutoffMinutes` of each shift from auto-distribution, evaluated against `now`.
      const computedPlan = assignWork(input, engineConfig, { now: now.toISOString() });
      const elapsedMs = Math.round(performance.now() - t0);

      const seqByBundleId = new Map<string, BundlePickupSequence>(
        computedPlan.pickupSequences.map((s) => [s.bundleId, s]),
      );

      let persistedCount = 0;
      for (const bundle of computedPlan.bundles) {
        persistedCount += await this.persistBundle(
          tx,
          bundle,
          seqByBundleId.get(bundle.id),
          principal,
        );
      }

      return { plan: computedPlan, durationMs: elapsedMs, assignedCaseCount: persistedCount };
    });

    return this.toResultDto(day, plan, assignedCaseCount, durationMs);
  }

  /**
   * §continuation (Pull-on-idle): hand the requesting employee ONE next cart-sized
   * bundle from the current `ready` pool. Reuses the engine primitives (priority +
   * Bereich-homogeneous balanced bundle + pickup sequence) for a single cart; the
   * teamlead `recalculate` path is untouched. Never assigns while the employee still
   * has an open bundle, and stops at the shift's net capacity (Feierabend).
   */
  async assignNextBundle(
    principal: Principal,
    date?: string,
    now: Date = new Date(),
  ): Promise<NextBundleResultDto> {
    const day = date ?? now.toISOString().slice(0, 10);
    const dayStart = new Date(day + 'T00:00:00.000Z');
    const dayEnd = new Date(day + 'T23:59:59.999Z');

    if (!principal.employeeNo) throw new ForbiddenException('Token has no employee number claim');
    const employee = await this.prisma.user.findUnique({
      where: { employeeNo: principal.employeeNo },
      select: { id: true, active: true, bereiche: true, skillTier: true },
    });
    if (!employee || !employee.active) {
      throw new ForbiddenException('Employee not provisioned or inactive');
    }
    // Skill-Stufen-Gate (A10): starter/dummy erhalten nur manuell zugeteilte Belege —
    // kein Self-Pull über die Engine.
    if (employee.skillTier === 'starter' || employee.skillTier === 'dummy') {
      return { assigned: false, reason: 'skill_tier' };
    }

    const ruleConfig = await this.readRuleConfig();
    const engineConfig = engineConfigFromRuleConfig(ruleConfig);

    // Monster-Beleg-Fortsetzung (C6): wer noch an einem mehrtägigen Beleg über der
    // Teile-Schwelle arbeitet (in_progress/problem_resolved), erhält KEINE neuen
    // Belege, bis er fertig ist — die Fortsetzung läuft über das bestehende Bündel.
    const openLargeCase = await this.prisma.goodsReceiptCase.findFirst({
      where: {
        status: { in: ['in_progress', 'problem_resolved'] },
        totalQuantity: { gte: engineConfig.assignment.largeBelegTeileThreshold },
        assignedBundle: { employeeId: employee.id },
      },
      select: { id: true },
    });
    if (openLargeCase) return { assigned: false, reason: 'continuation' };

    await this.materializeShiftsForDate(day, dayStart);
    const shift = await this.prisma.shift.findFirst({
      where: { employeeId: employee.id, date: { gte: dayStart, lte: dayEnd }, active: true },
      include: { employee: { select: { bereiche: true, skillTier: true } } },
    });
    if (!shift || shift.netCapacityMinutes <= 0) return { assigned: false, reason: 'no_shift' };

    // Kundenfeedback 2026-07-14: an open cart no longer blocks the pull — the worker
    // decides when to take on more. New work is appended to the open bundle (the PWA
    // home shows exactly one bundle), so the one-open-bundle invariant holds everywhere.
    const todaysBundles = await this.prisma.assignmentBundle.findMany({
      where: { employeeId: employee.id, date: { gte: dayStart, lte: dayEnd } },
      select: { id: true, plannedEffortMinutes: true },
    });

    // Feierabend: stop once the day's assigned effort reaches the shift capacity.
    const usedMinutes = todaysBundles.reduce((sum, b) => sum + b.plannedEffortMinutes, 0);
    const remainingCapacity = shift.netCapacityMinutes - usedMinutes;
    if (remainingCapacity <= 0) return { assigned: false, reason: 'capacity_done' };

    // ZIEL B (Punkt 6): never hand out work that cannot be finished before the shift
    // ends. The cart budget is the smaller of the remaining net capacity and the real
    // wall-clock time left until plannedEnd. Once that is 0 the worker is at shift end —
    // they get nothing more so nothing stays open over night.
    const shiftDomain = toEmployeeShift(shift, shift.employee.bereiche, shift.employee.skillTier);
    const finishableBudget = finishableBudgetMinutes(remainingCapacity, shiftDomain, now.toISOString());
    if (finishableBudget <= 0) return { assigned: false, reason: 'shift_ending' };

    return this.prisma.$transaction(async (tx) => {
      const [caseRows, locationRows] = await Promise.all([
        tx.goodsReceiptCase.findMany({ where: { status: POOL_STATUS }, include: caseEffortInclude }),
        tx.location.findMany({ where: { active: true } }),
      ]);
      if (caseRows.length === 0) return { assigned: false, reason: 'pool_empty' };

      const locations: LocationMaster[] = locationRows.map(toLocationMaster);
      const kindByCode = new Map(locations.map((l) => [l.code, l.kind]));
      // §8.2 LIVE wiring: recompute effort from the cockpit-edited parameters for cases
      // that carry a work instruction; the rest fall back to their estimatedMinutes.
      const effortVectors = buildEffortVectors(caseRows);
      // Same Verladetag-relative priority as recalculate: resolve the loading day from
      // the live calendar, then classify with the configured Vorlauf (Teamlead-Punkt 4).
      const cases: GoodsReceiptCase[] = applyResolvedLoadPlanDates(
        caseRows.map(toGoodsReceiptCase),
        ruleConfig.loadPlan,
        day,
      );
      const allowedBereiche = new Set(employee.bereiche);

      // Enrich (priority + effort fallback) and keep only this employee's Bereiche.
      const enriched: EnrichedCase[] = cases
        .map((c) => {
          const kind = c.storageLocation ? kindByCode.get(c.storageLocation.code) : undefined;
          const vector = effortVectors.get(c.id);
          const effort = vector
            ? computeEffort(vector, engineConfig.effort)
            : { minutes: c.estimatedMinutes, points: c.effortPoints };
          return {
            case: c,
            priority: classifyPriority(c, {
              today: day,
              dailyShopAreas: ruleConfig.priority.dailyShopAreas,
            }),
            teile: c.totalQuantity,
            effortMinutes: effort.minutes,
            effortPoints: effort.points,
            wgrCodes: vector ? vector.wgrCodes : [],
            fromPreviousDays: c.bookingDate < day,
            bereich: kind ? bereichFromLocationKind(kind) : undefined,
          } satisfies EnrichedCase;
        })
        .filter((e) => e.priority.rank > 0)
        // Monster-Belege (C6) sind nie Self-Pull-Ware — manuelle TL-Entscheidung.
        .filter((e) => e.teile < engineConfig.assignment.largeBelegTeileThreshold)
        .filter((e) => allowedBereiche.size === 0 || (e.bereich != null && allowedBereiche.has(e.bereich)));
      if (enriched.length === 0) return { assigned: false, reason: 'pool_empty' };

      const ordered = sortByPriority(enriched);
      // Folge-Pack (C1): 80–90 Teile, machbarkeitsgeprüft gegen das finishable
      // Minuten-Budget (unverändertes Aufwandsmodell + Schichtende-Gate).
      const { bundles } = createBalancedBundles(
        ordered,
        finishableBudget,
        engineConfig.assignment,
        'follow_up',
      );
      const cart = bundles[0];
      if (!cart) return { assigned: false, reason: 'pool_empty' };
      // A single indivisible case can exceed the finishable budget; if even the first
      // cart cannot be finished before shift end, hand out nothing (clean table).
      if (cart.effortMinutes > finishableBudget) return { assigned: false, reason: 'shift_ending' };

      const caseById = new Map(cases.map((c) => [c.id, c]));

      // Weiteres Bündel anfordern (Kundenfeedback 2026-07-14): while a cart is still
      // open, the pull APPENDS to it instead of opening a parallel bundle — the PWA,
      // "Rest parken" and the board all assume one open bundle per employee.
      const openBundle = await tx.assignmentBundle.findFirst({
        where: {
          employeeId: employee.id,
          date: { gte: dayStart, lte: dayEnd },
          status: { notIn: ['completed', 'cancelled'] },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          items: { select: { caseId: true } },
          routeStops: { select: { locationCode: true, sequence: true } },
        },
      });

      const bundleSkeleton: AssignmentBundle = assignmentBundleSchema.parse({
        id: openBundle?.id ?? `bundle-${day}-${employee.id}-${todaysBundles.length}`,
        employeeId: employee.id,
        date: day,
        caseIds: cart.caseIds,
        plannedEffortMinutes: cart.effortMinutes,
        effortPoints: cart.effortPoints,
        route: [],
        status: 'created',
        createdBy: 'system',
      });
      // Intake-Gate-Invariante (D1): Pool-Belege haben immer einen Lagerplatz.
      const pickupCases: PickupCase[] = cart.caseIds.map((id) => ({
        caseId: id,
        location: caseById.get(id)!.storageLocation!,
      }));
      const sequence = buildPickupSequence(
        bundleSkeleton.id,
        employee.id,
        `ws-${employee.id}`,
        pickupCases,
        { mode: 'numeric_fallback', locationMaster: new Map(locations.map((l) => [l.code, l])) },
      );

      if (openBundle) {
        await this.extendBundle(tx, openBundle, bundleSkeleton, sequence, principal);
      } else {
        await this.persistBundle(tx, bundleSkeleton, sequence, principal);
      }
      return { assigned: true, caseCount: cart.caseIds.length, bereich: cart.bereich ?? null };
    });
  }

  /**
   * Materialize each active employee's concrete Shift for `dayIso` from their weekly
   * pattern (Wochenplan → capacity). A non-working day drops any existing shift; a
   * working day upserts the derived netCapacity (source='pattern'). Idempotent.
   * Public: recalculate/assignNextBundle run it implicitly; the dev panel's
   * quick knob (POST /api/dev/materialize-shifts) calls it directly.
   */
  async materializeShiftsForDate(dayIso: string, dayDate: Date): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { active: true },
      select: { id: true, productivityFactor: true, weeklyPattern: true },
    });
    const keys: (keyof WeeklyPattern)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const key = keys[dayDate.getUTCDay()]!;
    for (const u of users) {
      const parsed = weeklyPatternSchema.safeParse(u.weeklyPattern);
      const plan = parsed.success ? parsed.data[key] : undefined;
      if (!plan || !plan.working || !plan.start || !plan.end) {
        await this.prisma.shift.deleteMany({ where: { employeeId: u.id, date: dayDate } });
        continue;
      }
      const [sh, sm] = plan.start.split(':').map(Number);
      const [eh, em] = plan.end.split(':').map(Number);
      const startMin = (sh ?? 0) * 60 + (sm ?? 0);
      const endMin = (eh ?? 0) * 60 + (em ?? 0);
      const net = Math.round(
        Math.max(0, endMin - startMin - plan.breakMinutes) *
          u.productivityFactor *
          (plan.partTimePct / 100),
      );
      const data = {
        plannedStart: new Date(`${dayIso}T${plan.start}:00`),
        plannedEnd: new Date(`${dayIso}T${plan.end}:00`),
        breakMinutes: plan.breakMinutes,
        plannedHours: Math.round((Math.max(0, endMin - startMin) / 60) * 100) / 100,
        netCapacityMinutes: net,
        active: net > 0,
        source: 'pattern' as const,
        productivityFactor: u.productivityFactor,
      };
      await this.prisma.shift.upsert({
        where: { shift_employee_date: { employeeId: u.id, date: dayDate } },
        create: { employeeId: u.id, date: dayDate, ...data },
        update: data,
      });
    }
  }

  /**
   * §E.4 Simulation/Vorschau: run the SAME deterministic engine as recalculate()
   * over the current `ready` pool, but persist NOTHING — no bundle/item/route-stop
   * rows, no case status changes, no audit events. The teamlead reviews this
   * proposed plan before committing it via recalculate(). Reads are non-mutating,
   * so no transaction is needed; assignedCaseCount mirrors the would-be persist.
   */
  async preview(
    _principal: Principal,
    date?: string,
    now: Date = new Date(),
  ): Promise<RecalculateResultDto> {
    const day = date ?? now.toISOString().slice(0, 10);
    const dayStart = new Date(day + 'T00:00:00.000Z');
    const dayEnd = new Date(day + 'T23:59:59.999Z');

    const [shiftRows, locationRows, casesRows, ruleConfig] = await Promise.all([
      this.prisma.shift.findMany({
        where: { date: { gte: dayStart, lte: dayEnd }, active: true },
        include: { employee: { select: { bereiche: true, skillTier: true } } },
      }),
      this.prisma.location.findMany({ where: { active: true } }),
      this.prisma.goodsReceiptCase.findMany({
        where: { status: { in: [...PREVIEW_POOL_STATUSES] } },
        include: caseEffortInclude,
      }),
      this.readRuleConfig(),
    ]);

    // The engine's §8.1 eligibility is `ready`; an already
    // committed-but-not-started case is `assigned`. For the simulation we present
    // those `assigned` cases to the pure engine AS `ready` so it re-proposes today's
    // plan (recalculate is untouched — this normalisation is preview-only and never
    // persisted). Started/finished cases were already excluded by the read filter.
    const normalizedCases = casesRows
      .map(toGoodsReceiptCase)
      .map((c) => (c.status === 'assigned' ? { ...c, status: 'ready' as const } : c));
    const input: EngineInput = {
      date: day,
      cases: applyResolvedLoadPlanDates(normalizedCases, ruleConfig.loadPlan, day),
      shifts: shiftRows.map((s) => toEmployeeShift(s, s.employee.bereiche, s.employee.skillTier)),
      locations: locationRows.map(toLocationMaster),
      // §8.2 LIVE wiring: same effort recomputation as recalculate (see there).
      effortVectors: buildEffortVectors(casesRows),
    };

    const t0 = performance.now();
    // Same Schichtende-Cutoff evaluation as recalculate — the preview must predict
    // exactly what a commit at this `now` would produce.
    const plan = assignWork(input, engineConfigFromRuleConfig(ruleConfig), {
      now: now.toISOString(),
    });
    const durationMs = Math.round(performance.now() - t0);

    // Proposed assignment count = cases the engine placed into bundles (no DB write).
    const assignedCaseCount = plan.bundles.reduce((sum, b) => sum + b.caseIds.length, 0);
    return this.toResultDto(day, plan, assignedCaseCount, durationMs);
  }

  /** Shape an engine plan into the RecalculateResultDto returned by recalculate/preview. */
  private toResultDto(
    day: string,
    plan: ReturnType<typeof assignWork>,
    assignedCaseCount: number,
    durationMs: number,
  ): RecalculateResultDto {
    return {
      date: day,
      bundleCount: plan.bundles.length,
      assignedCaseCount,
      unassignedCaseCount: plan.unassigned.length,
      durationMs,
      loads: plan.loads.map((l) => ({
        employeeId: l.employeeId,
        capacityMinutes: l.capacityMinutes,
        assignedMinutes: l.assignedMinutes,
        assignedPoints: l.assignedPoints,
        bundleCount: l.bundleCount,
      })),
    };
  }

  /**
   * Remove the prior assignment plan for `date` so recalculate can re-insert cleanly.
   * FK-safe order: items → route stops → cases reset → bundles. The §7.2 audit log
   * (WorkflowEvent) is append-only and is intentionally NOT touched here.
   *
   * Only cases still in `assigned` (i.e. a prior recalc placed them but no employee
   * has begun work) are reverted to `ready` and unlinked. Cases an employee has
   * already started or finished (in_progress/.../completed) keep their bundle
   * link — their bundles are skipped from deletion so the FK on assignedBundleId holds.
   */
  private async clearPriorPlanForDate(tx: PrismaTx, dayStart: Date, dayEnd: Date): Promise<void> {
    const priorBundles = await tx.assignmentBundle.findMany({
      where: { date: { gte: dayStart, lte: dayEnd } },
      select: { id: true },
    });
    if (priorBundles.length === 0) return;
    const bundleIds = priorBundles.map((b) => b.id);

    // Cases this prior recalc placed but nobody has started yet (status `assigned`).
    // These are reverted to the ready pool; their AssignmentItems must be dropped so
    // the @@unique([caseId]) constraint stays free when the engine re-bundles them.
    const revertable = await tx.goodsReceiptCase.findMany({
      where: { assignedBundleId: { in: bundleIds }, status: 'assigned' },
      select: { id: true },
    });
    const revertCaseIds = revertable.map((c) => c.id);

    if (revertCaseIds.length > 0) {
      // Drop stale items for reverted cases first (even if their bundle survives
      // because a sibling case is in-flight) — otherwise re-bundling hits P2002.
      await tx.assignmentItem.deleteMany({ where: { caseId: { in: revertCaseIds } } });
      await tx.goodsReceiptCase.updateMany({
        where: { id: { in: revertCaseIds } },
        data: { assignedBundleId: null, status: POOL_STATUS, version: { increment: 1 } },
      });
    }

    // Bundles that still own an in-flight/completed case (status not `assigned`) must
    // survive so the FK on GoodsReceiptCase.assignedBundleId holds.
    const stillReferenced = await tx.goodsReceiptCase.findMany({
      where: { assignedBundleId: { in: bundleIds } },
      select: { assignedBundleId: true },
    });
    const keepBundleIds = new Set(
      stillReferenced.map((c) => c.assignedBundleId).filter((id): id is string => id !== null),
    );
    const deletableBundleIds = bundleIds.filter((id) => !keepBundleIds.has(id));
    if (deletableBundleIds.length === 0) return;

    // FK-safe delete order: children (items + route stops) then the bundle itself.
    await tx.assignmentItem.deleteMany({ where: { bundleId: { in: deletableBundleIds } } });
    await tx.routeStop.deleteMany({ where: { bundleId: { in: deletableBundleIds } } });
    await tx.assignmentBundle.deleteMany({ where: { id: { in: deletableBundleIds } } });
  }

  /** Persist one engine bundle (bundle + items + route stops + case links + events). */
  private async persistBundle(
    tx: PrismaTx,
    bundle: AssignmentBundle,
    sequence: BundlePickupSequence | undefined,
    principal: Principal,
  ): Promise<number> {
    const created = await tx.assignmentBundle.create({
      data: {
        employeeId: bundle.employeeId,
        date: new Date(bundle.date),
        plannedEffortMinutes: bundle.plannedEffortMinutes,
        effortPoints: bundle.effortPoints,
        status: 'assigned',
        createdBy: bundle.createdBy === 'teamlead' ? 'teamlead' : 'system',
      },
    });

    await Promise.all(
      bundle.caseIds.map((caseId, index) =>
        tx.assignmentItem.create({ data: { bundleId: created.id, caseId, sequence: index } }),
      ),
    );

    const stops = sequence?.stops ?? bundle.route;
    await Promise.all(
      stops.map((stop) =>
        tx.routeStop.create({
          data: {
            bundleId: created.id,
            sequence: stop.sequence,
            locationId: stop.locationId,
            locationCode: stop.locationCode,
            orderIds: stop.orderIds,
            scanRequired: stop.scanRequired,
            skipAllowedWithReason: stop.skipAllowedWithReason,
          },
        }),
      ),
    );

    // Link cases to the bundle and move ready → assigned (§7.1) under optimistic lock.
    await tx.goodsReceiptCase.updateMany({
      where: { id: { in: bundle.caseIds }, status: POOL_STATUS },
      data: { assignedBundleId: created.id, status: 'assigned', version: { increment: 1 } },
    });

    await this.events.append(
      {
        eventType: 'bundle.created',
        entityType: 'AssignmentBundle',
        entityId: created.id,
        actorType: 'system',
        actorId: principal.sub,
        payload: { caseIds: bundle.caseIds, effortPoints: bundle.effortPoints },
      },
      tx,
    );
    // The engine placing a bundle on an employee is a SYSTEM action (mirrors the
    // sibling `bundle.created`). It must NOT carry actorType `teamlead`, or the
    // "Letzte Teamlead-Eingriffe" feed (genuine human overrides) would be polluted
    // with every automatic assignment. Human overrides (§8.4 assignment.overridden,
    // case.prioritized/parked/ready) are the only teamlead-actor events.
    await this.events.append(
      {
        eventType: 'bundle.assigned',
        entityType: 'AssignmentBundle',
        entityId: created.id,
        actorType: 'system',
        actorId: principal.sub,
        payload: { employeeId: bundle.employeeId, caseCount: bundle.caseIds.length },
      },
      tx,
    );

    return bundle.caseIds.length;
  }

  /**
   * Kundenfeedback 2026-07-14 („Weiteres Bündel anfordern"): append an engine-built
   * cart to the employee's still-open bundle. Items go to the tail (bundle order),
   * route stops are added only for locations the bundle does not visit yet (an
   * existing stop already covers a same-location case), planned effort/points grow
   * by the cart. The stop ids of already-collected stops stay untouched, so the
   * PWA's local check-off state survives the extension.
   */
  private async extendBundle(
    tx: PrismaTx,
    openBundle: {
      id: string;
      plannedEffortMinutes: number;
      effortPoints: number;
      items: { caseId: string }[];
      routeStops: { locationCode: string; sequence: number }[];
    },
    cart: AssignmentBundle,
    sequence: BundlePickupSequence | undefined,
    principal: Principal,
  ): Promise<void> {
    let nextItemSeq = openBundle.items.length;
    for (const caseId of cart.caseIds) {
      await tx.assignmentItem.create({
        data: { bundleId: openBundle.id, caseId, sequence: nextItemSeq },
      });
      nextItemSeq += 1;
    }

    const knownLocations = new Set(openBundle.routeStops.map((s) => s.locationCode));
    const newStops = (sequence?.stops ?? cart.route).filter(
      (stop) => !knownLocations.has(stop.locationCode),
    );
    let nextStopSeq = openBundle.routeStops.reduce((max, s) => Math.max(max, s.sequence + 1), 0);
    for (const stop of newStops) {
      await tx.routeStop.create({
        data: {
          bundleId: openBundle.id,
          sequence: nextStopSeq,
          locationId: stop.locationId,
          locationCode: stop.locationCode,
          orderIds: stop.orderIds,
          scanRequired: stop.scanRequired,
          skipAllowedWithReason: stop.skipAllowedWithReason,
        },
      });
      nextStopSeq += 1;
    }

    await tx.goodsReceiptCase.updateMany({
      where: { id: { in: cart.caseIds }, status: POOL_STATUS },
      data: { assignedBundleId: openBundle.id, status: 'assigned', version: { increment: 1 } },
    });
    await tx.assignmentBundle.update({
      where: { id: openBundle.id },
      data: {
        plannedEffortMinutes: openBundle.plannedEffortMinutes + cart.plannedEffortMinutes,
        effortPoints: openBundle.effortPoints + cart.effortPoints,
      },
    });

    await this.events.append(
      {
        eventType: 'bundle.extended',
        entityType: 'AssignmentBundle',
        entityId: openBundle.id,
        actorType: 'system',
        actorId: principal.sub,
        payload: { caseIds: cart.caseIds, effortPoints: cart.effortPoints },
      },
      tx,
    );
  }
}
