import { z } from 'zod';

/** Warehouse section codes (Anhang A). Note: 5 and 6 do not exist by design. */
export const sectionCodeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(7),
  z.literal(8),
]);
export type SectionCode = z.infer<typeof sectionCodeSchema>;

export const goodsTypeTextSchema = z.enum([
  'Vororder',
  'Nachorder',
  'Sonderposten',
  'NOS',
  'NOOS',
  'Extrabestellung',
  'NOS-Nachorder',
  'Prio',
]);
export type GoodsTypeText = z.infer<typeof goodsTypeTextSchema>;

/** Priority is NOT a section. Prio ware can appear with section = null. */
export const priorityFlagSchema = z.enum([
  'prio',
  'catman_due',
  'overdue',
  'manual_teamlead_priority',
  'same_day_required',
]);
export type PriorityFlag = z.infer<typeof priorityFlagSchema>;

/** Where a case originates. ProHandel API is the system of record; `manual` covers pilot seeds. */
export const caseSourceSchema = z.enum(['prohandel_api', 'manual']);
export type CaseSource = z.infer<typeof caseSourceSchema>;

/**
 * Skill-Stufe eines Mitarbeiters (Teamlead-Feedback 03.07.2026). Steuert die
 * AUTO-Verteilungs-Berechtigung der Engine: `starter` und `dummy` erhalten NUR
 * manuell zugeteilte Belege (keine Auto-Verteilung, kein Self-Pull); die mittleren
 * Stufen erhalten Starter-Packs; `profi` alles. Anzeige-/Gating-Feld — die
 * Leistungsmessung bleibt separat über `measured` gesteuert.
 */
export const skillTierSchema = z.enum(['profi', 'fortgeschritten', 'basis', 'starter', 'dummy']);
export type SkillTier = z.infer<typeof skillTierSchema>;

/** Skill-Stufen, die die Engine automatisch beplanen darf (Rest = nur manuell). */
export const AUTO_ASSIGNABLE_SKILL_TIERS: readonly SkillTier[] = [
  'profi',
  'fortgeschritten',
  'basis',
];

/**
 * Prüfstufen-Katalog-Codes (Teamlead-Feedback: Prüfung Wareneingang ist nicht ja/nein,
 * sondern Prozentstufen mit erklärendem Aufgabentext). Quelle der Stufe ist konfigurierbar
 * (ProHandel vs. Dashboard, RuleConfig.inspection.source).
 */
export const inspectionLevelCodeSchema = z.enum(['none', 'p10', 'p20', 'full']);
export type InspectionLevelCode = z.infer<typeof inspectionLevelCodeSchema>;

/** Woher die Prüfstufe eines Belegs stammt (mock: beide Quellen liefern den Katalog-Code). */
export const inspectionSourceSchema = z.enum(['prohandel', 'dashboard']);
export type InspectionSource = z.infer<typeof inspectionSourceSchema>;

/**
 * Case lifecycle (§7.1) — 10 meaningful statuses. The granular employee work steps
 * (scan → print → confirm → box → ZST) are local PWA progress over real position/box
 * data, not top-level case statuses. A case is created directly from a ProHandel
 * booking as `ready` (or `needs_review` if a booking needs manual attention).
 */
export const caseStatusSchema = z.enum([
  'needs_review',
  // Intake-Gate (Teamlead-Feedback D1): Pflichtdaten fehlen (Lagerplatz/Lieferschein)
  // → „zurück an Bucher". Nie im Verteil-Pool; Freigabe erst nach Vervollständigung.
  'blocked',
  'ready',
  'parked',
  'assigned',
  'in_progress',
  'issue_open',
  'partially_completed',
  'completed',
  'zst_done',
  'cancelled',
]);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

/** Embedded StorageLocation.type (Anhang A). */
export const locationTypeSchema = z.enum([
  'regal',
  'palette',
  'haengebahn',
  'lagerplatz_d',
  'workstation',
  'printer',
  'conveyor',
]);
export type LocationType = z.infer<typeof locationTypeSchema>;

/** LocationMaster.kind (Anhang D – finer-grained than LocationType). */
export const locationKindSchema = z.enum([
  'regal',
  'palette_a',
  'palette_b',
  'palette_c',
  'palette_e',
  'haengebahn',
  'lagerplatz_d',
  'workstation',
  'printer',
  'conveyor_packages',
  'conveyor_finished_goods',
]);
export type LocationKind = z.infer<typeof locationKindSchema>;

export const checkModeSchema = z.enum(['quantity_only', 'percentage_check', 'full_check']);
export type CheckMode = z.infer<typeof checkModeSchema>;

export const assignmentStatusSchema = z.enum([
  'created',
  'assigned',
  'accepted',
  'active',
  'paused',
  'completed',
  'cancelled',
]);
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

export const issueStatusSchema = z.enum([
  'open',
  'in_review',
  'waiting_external',
  'resolved',
  'rejected',
]);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const issueScopeSchema = z.enum(['case', 'position', 'sku_line', 'transport_box']);
export type IssueScope = z.infer<typeof issueScopeSchema>;

export const issueTypeSchema = z.enum([
  'missing_quantity',
  'overdelivery',
  'wrong_article',
  'wrong_color',
  'wrong_size',
  'damaged_goods',
  'missing_package',
  'label_problem',
  'security_problem',
  'printer_problem',
  'other',
]);
export type IssueType = z.infer<typeof issueTypeSchema>;

export const pickupSequenceModeSchema = z.enum(['numeric_fallback', 'manual_sort_order']);
export type PickupSequenceMode = z.infer<typeof pickupSequenceModeSchema>;

/** Workflow event taxonomy (Anhang A / §7.2). */
export const workflowEventTypeSchema = z.enum([
  'case.ready',
  'case.parked',
  'case.prioritized',
  'case.deprioritized',
  'case.cancelled',
  'bundle.created',
  'bundle.assigned',
  'bundle.completed',
  'pickup.location_scanned',
  'case.started',
  'position.confirmed',
  'sku.quantity_confirmed',
  'issue.created',
  'issue.resolved',
  'box.label_printed',
  'box.sealed',
  'print.job_created',
  'print.job_completed',
  'print.job_failed',
  'case.completed',
  'case.partially_completed',
  'zst.created',
  'zst.exported',
  'assignment.overridden',
  'case.delivery_group_merged',
  'case.delivery_group_split',
  'employee.created',
  'employee.profile_updated',
  'employee.shift_overridden',
  'employee.workstation_assigned',
  'integration.pull_completed',
  'case.parked_by_employee',
  'case.intake_blocked',
  'case.returned_to_bucher',
  'case.intake_released',
  'case.delivery_group_released',
]);
export type WorkflowEventType = z.infer<typeof workflowEventTypeSchema>;

export const actorTypeSchema = z.enum(['system', 'employee', 'teamlead', 'admin']);
export type ActorType = z.infer<typeof actorTypeSchema>;

/** Printable artefact kinds (§13.4 Drucker und Etiketten). */
export const printJobTypeSchema = z.enum(['price_label', 'box_slip']);
export type PrintJobType = z.infer<typeof printJobTypeSchema>;

/** Output format the print service emits (§E.1: PDF default; ZPL/EPL only if printer supports it). */
export const printPayloadFormatSchema = z.enum(['pdf', 'zpl', 'epl']);
export type PrintPayloadFormat = z.infer<typeof printPayloadFormatSchema>;

/** Lifecycle of a print job. MVP = enqueue + report result (§13.4 Erfolg/Fehler). */
export const printJobStatusSchema = z.enum(['queued', 'sent', 'succeeded', 'failed']);
export type PrintJobStatus = z.infer<typeof printJobStatusSchema>;

/** Reporting granularity for KPI rollups (§15.2). */
export const kpiGranularitySchema = z.enum(['employee', 'team', 'section', 'day']);
export type KpiGranularity = z.infer<typeof kpiGranularitySchema>;
