/**
 * Boundary narrowing for the teamlead data layer.
 *
 * The generated DTOs type enum-ish fields as plain `string`/`number`, so before
 * projecting onto the domain unions the read modules (see {@link ./remoteDataset},
 * {@link ./belege}, {@link ./admin}) validate each value against the shared
 * @paket/domain-types Zod schemas instead of asserting with a bare `as`. An
 * unexpected backend value fails fast (throws) rather than corrupting view state.
 *
 * This is the single source of those projections so every module narrows the same
 * way; there are no per-module copies.
 */
import {
  actorTypeSchema,
  assignmentStatusSchema,
  caseStatusSchema,
  employeeRoleSchema,
  issueScopeSchema,
  issueStatusSchema,
  locationKindSchema,
  priorityFlagSchema,
  problemKindSchema,
  sectionCodeSchema,
  shiftSourceSchema,
  skillTierSchema,
  skuLineStatusSchema,
  workflowEventTypeSchema,
  zstSourceSchema,
  type ActorType,
  type AssignmentStatus,
  type CaseStatus,
  type EmployeeRole,
  type IssueScope,
  type IssueStatus,
  type LocationKind,
  type PriorityFlag,
  type ProblemKind,
  type SectionCode,
  type ShiftSource,
  type SkillTier,
  type SkuLineStatus,
  type WorkflowEventType,
  type ZstSource,
} from '@paket/domain-types';

/** Narrow a DTO status string to the domain `CaseStatus`, throwing on an unknown value. */
export function toCaseStatus(value: string): CaseStatus {
  return caseStatusSchema.parse(value);
}

/** Narrow a DTO actorType string to the domain `ActorType`, throwing on an unknown value. */
export function toActorType(value: string): ActorType {
  return actorTypeSchema.parse(value);
}

/** Narrow a DTO eventType string to the domain `WorkflowEventType`, throwing on an unknown value. */
export function toEventType(value: string): WorkflowEventType {
  return workflowEventTypeSchema.parse(value);
}

/** Narrow a DTO skillTier string to the domain `SkillTier`, throwing on an unknown value. */
export function toSkillTier(value: string): SkillTier {
  return skillTierSchema.parse(value);
}

/** Narrow a DTO `kind` string to the domain `LocationKind`, throwing on an unknown value. */
export function toLocationKind(value: string): LocationKind {
  return locationKindSchema.parse(value);
}

/** Narrow a DTO problem `kind` string to the domain `ProblemKind`, throwing on an unknown value. */
export function toProblemKind(value: string): ProblemKind {
  return problemKindSchema.parse(value);
}

/** Narrow a DTO scope string to the domain `IssueScope`, throwing on an unknown value. */
export function toIssueScope(value: string): IssueScope {
  return issueScopeSchema.parse(value);
}

/** Narrow a DTO issue status string to the domain `IssueStatus`, throwing on an unknown value. */
export function toIssueStatus(value: string): IssueStatus {
  return issueStatusSchema.parse(value);
}

/** Narrow a DTO SKU-line status string to the domain `SkuLineStatus`, throwing on an unknown value. */
export function toSkuLineStatus(value: string): SkuLineStatus {
  return skuLineStatusSchema.parse(value);
}

/** Narrow a DTO ZST source string to the domain `ZstSource`, throwing on an unknown value. */
export function toZstSource(value: string): ZstSource {
  return zstSourceSchema.parse(value);
}

/** Narrow a DTO role string to the domain `EmployeeRole`, throwing on an unknown value. */
export function toEmployeeRole(value: string): EmployeeRole {
  return employeeRoleSchema.parse(value);
}

/** Narrow a DTO shift source string to the domain `ShiftSource`, throwing on an unknown value. */
export function toShiftSource(value: string): ShiftSource {
  return shiftSourceSchema.parse(value);
}

/** Narrow a DTO bundle status string to the domain `AssignmentStatus`, throwing on an unknown value. */
export function toAssignmentStatus(value: string): AssignmentStatus {
  return assignmentStatusSchema.parse(value);
}

/**
 * Narrow a DTO section to the domain `SectionCode`, or null when absent/invalid.
 * The generated `section` type widens to a nullable-number openapi-typescript
 * artifact, so we accept `unknown` and gate on `typeof === 'number'` before
 * validating.
 */
export function toSectionCode(value: unknown): SectionCode | null {
  if (typeof value !== 'number') return null;
  const parsed = sectionCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Keep only the DTO priority flags that are members of the domain `PriorityFlag` union. */
export function toPriorityFlags(values: readonly string[]): PriorityFlag[] {
  return values.filter((flag): flag is PriorityFlag => priorityFlagSchema.safeParse(flag).success);
}
