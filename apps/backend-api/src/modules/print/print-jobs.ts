import type {
  BoxSlipData,
  Id,
  ISODateTime,
  PrintJob,
  PrintJobType,
  PrintPayloadFormat,
  Printer,
  TransportBox,
} from '@paket/domain-types';
import { type Actor, eventDraft, type WorkflowEventDraft } from '../events.js';

/**
 * Print service (§13.4). Builds price-label and box-slip print jobs, enforces the
 * reprint permission ("Nachdruck mit Berechtigung") and logs every job as a workflow
 * event (wer, wann, was, welcher Drucker, Erfolg/Fehler). MVP renders PDF and enqueues;
 * deep ZPL/EPL spooling is Phase 2 (Anhang H).
 */

const ENTITY_TYPE = 'print_job';
const BOX_ENTITY_TYPE = 'transport_box';
const DEFAULT_FORMAT: PrintPayloadFormat = 'pdf';

/** Print rights of the requesting actor (§5 Rechte; §13.4 Nachdruck mit Berechtigung). */
export interface PrintPermissions {
  canPrint: boolean;
  canReprint: boolean;
}

export interface BuildPrintJobParams {
  id: Id;
  caseId: Id;
  boxId?: Id;
  jobType: PrintJobType;
  printer: Printer;
  format?: PrintPayloadFormat;
  /** Storage key / inline ref of the already-rendered artefact. */
  payloadRef: string;
  now: ISODateTime;
  actor: Actor;
  isReprint: boolean;
  permissions: PrintPermissions;
}

export type PrintDecision =
  | { ok: true; job: PrintJob; events: WorkflowEventDraft[] }
  | { ok: false; error: string };

/** Pick the first active printer that can produce `jobType` in `format`. */
export function selectPrinter(
  printers: readonly Printer[],
  jobType: PrintJobType,
  format: PrintPayloadFormat = DEFAULT_FORMAT,
): Printer | undefined {
  return printers.find(
    (p) => p.active && p.jobTypes.includes(jobType) && p.supportedFormats.includes(format),
  );
}

/** Build the box-slip label payload from a computed/persisted box (§13.4 Boxzettel). */
export function buildBoxSlipData(box: TransportBox, weBelegNo: string): BoxSlipData {
  return {
    caseId: box.caseId,
    boxId: box.id,
    boxNo: box.boxNo,
    weBelegNo,
    branchNo: box.branchNo,
    shopAreaNo: box.shopAreaNo,
    shopNo: box.shopNo,
    floor: box.floor,
    quantity: box.quantity,
    sealCode: undefined,
  };
}

/**
 * Create a queued print job. Enforces the permission for first print vs. reprint and
 * validates the printer can actually produce the requested artefact/format.
 */
export function buildPrintJob(params: BuildPrintJobParams): PrintDecision {
  const allowed = params.isReprint ? params.permissions.canReprint : params.permissions.canPrint;
  if (!allowed) {
    return {
      ok: false,
      error: params.isReprint ? 'reprint not permitted for actor' : 'print not permitted for actor',
    };
  }

  const format = params.format ?? DEFAULT_FORMAT;
  const { printer, jobType } = params;
  if (!printer.active) return { ok: false, error: `printer "${printer.name}" is inactive` };
  if (!printer.jobTypes.includes(jobType)) {
    return { ok: false, error: `printer "${printer.name}" cannot print ${jobType}` };
  }
  if (!printer.supportedFormats.includes(format)) {
    return { ok: false, error: `printer "${printer.name}" does not support ${format}` };
  }

  const job: PrintJob = {
    id: params.id,
    caseId: params.caseId,
    boxId: params.boxId,
    jobType,
    format,
    printerId: printer.id,
    printerName: printer.name,
    payloadRef: params.payloadRef,
    status: 'queued',
    isReprint: params.isReprint,
    requestedByType: params.actor.type,
    requestedById: params.actor.id,
    requestedAt: params.now,
  };

  return {
    ok: true,
    job,
    events: [
      eventDraft('print.job_created', ENTITY_TYPE, job.id, params.actor, {
        caseId: job.caseId,
        boxId: job.boxId,
        jobType: job.jobType,
        printerId: printer.id,
        isReprint: job.isReprint,
      }),
    ],
  };
}

/** Mark a job as succeeded; box-slip success also emits the box.label_printed milestone. */
export function completePrintJob(
  job: PrintJob,
  now: ISODateTime,
  actor: Actor,
): { job: PrintJob; events: WorkflowEventDraft[] } {
  const done: PrintJob = { ...job, status: 'succeeded', completedAt: now };
  const events: WorkflowEventDraft[] = [
    eventDraft('print.job_completed', ENTITY_TYPE, job.id, actor, {
      caseId: job.caseId,
      jobType: job.jobType,
      printerId: job.printerId,
    }),
  ];
  if (job.jobType === 'box_slip' && job.boxId) {
    events.push(
      eventDraft('box.label_printed', BOX_ENTITY_TYPE, job.boxId, actor, {
        caseId: job.caseId,
        printJobId: job.id,
        isReprint: job.isReprint,
      }),
    );
  }
  return { job: done, events };
}

/** Mark a job as failed and log the failure (§13.4 Erfolg/Fehler). */
export function failPrintJob(
  job: PrintJob,
  errorMessage: string,
  now: ISODateTime,
  actor: Actor,
): { job: PrintJob; events: WorkflowEventDraft[] } {
  const failed: PrintJob = { ...job, status: 'failed', completedAt: now, errorMessage };
  return {
    job: failed,
    events: [
      eventDraft('print.job_failed', ENTITY_TYPE, job.id, actor, {
        caseId: job.caseId,
        jobType: job.jobType,
        printerId: job.printerId,
        error: errorMessage,
      }),
    ],
  };
}
