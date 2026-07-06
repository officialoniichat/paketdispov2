/**
 * @paket/assignment-engine
 *
 * Fair, rule-based assignment engine for the digital goods-receipt distribution
 * (Konzept §8, Anhang B.2/B.3, D, §13.2, §4.3). Pure, framework-free and deterministic
 * so the Teamlead "Neu berechnen"/recalculate stays reproducible and well under the
 * Anhang E.5 < 5 s budget.
 *
 * Pipeline: SEAK/PEP import → net capacity → priority (§8.1) → effort (§8.2) →
 * assignment (starter packages, balanced bundles, no specialists, heavy/light mix) →
 * pickup order inside each finished bundle (§D.3, non-optimising).
 */

// Configuration (Anhang B.3 + engine tuning).
export {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_EFFORT_CONFIG,
  DEFAULT_CAPACITY_CONFIG,
  DEFAULT_ASSIGNMENT_CONFIG,
  DEFAULT_PRIORITY_CONFIG,
  DEFAULT_SHIFT_END_CONFIG,
  effortConfigSchema,
  capacityConfigSchema,
  assignmentConfigSchema,
  priorityConfigSchema,
  shiftEndConfigSchema,
  type EngineConfig,
  type EffortConfig,
  type CapacityConfig,
  type AssignmentConfig,
  type PriorityConfig,
  type ShiftEndConfig,
} from './config.js';

// Engine types.
export {
  PRIORITY_RANK,
  type PriorityRank,
  type PriorityClass,
  type PriorityClassification,
  type EnrichedCase,
  type EngineInput,
  type AssignmentPlan,
  type UnassignedCase,
  type EmployeeLoad,
} from './types.js';

// (1) SEAK/PEP import + net capacity.
export {
  parseShiftImportCsv,
  type ShiftImportResult,
  type ShiftImportWarning,
  type ShiftImportOptions,
} from './capacity/shift-import.js';
export {
  computeNetCapacityMinutes,
  toEmployeeShift,
  teamCapacityMinutes,
  type NetCapacityOptions,
} from './capacity/net-capacity.js';
export {
  minutesUntilShiftEnd,
  autoAssignableCapacityMinutes,
  finishableBudgetMinutes,
} from './capacity/shift-end.js';

// (2) Priority engine (§8.1).
export {
  classifyPriority,
  comparePriority,
  sortByPriority,
  DEFAULT_DAILY_SHOP_AREAS,
  type PriorityContext,
} from './priority/priority-engine.js';

// (3) Effort score (§8.2).
export {
  computeEffort,
  computeEffortBreakdown,
  type EffortResult,
  type EffortBreakdown,
  type EffortComponents,
} from './effort/effort-score.js';
// (3a) Aufwands-Vorschau über die echten Parameter (§8.2 / Anhang B.3).
export {
  previewEffort,
  EXAMPLE_EFFORT_VECTOR,
  type EffortPreviewComponent,
  type EffortPreviewResult,
} from './effort/effort-factors.js';

// (4) Assignment (§8.3/§8.4).
export {
  createBalancedBundles,
  type ProtoBundle,
  type BundleKind,
  type BundlingResult,
} from './assignment/bundling.js';
export {
  distributeBundlesByWeightedLoad,
  type DistributeOptions,
  type DistributionResult,
} from './assignment/distribute.js';
export { assignWork, type AssignWorkOptions } from './assignment/plan.js';

// (5) Pickup order inside a finished bundle (§D.3).
export { buildPickupSequence, type PickupCase, type PickupOptions } from './pickup/pickup-order.js';

// (6) Delivery-Group detection (Teamlead-Anforderung Punkt 1).
export {
  detectDeliveryGroups,
  indexDeliveryGroups,
  withheldCaseIds,
  DEFAULT_GROUPING_CONFIG,
  type GroupingConfig,
  type DeliveryGroupInput,
  type DeliveryGroup,
  type DeliveryGroupSignal,
  type DeliveryGroupConfidence,
  type DeliveryGroupIndex,
} from './grouping/delivery-group.js';
