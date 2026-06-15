import { describe, expect, it } from 'vitest';
import type { Printer, TransportBox } from '@paket/domain-types';
import {
  buildBoxSlipData,
  buildPrintJob,
  completePrintJob,
  failPrintJob,
  selectPrinter,
  type BuildPrintJobParams,
  type PrintPermissions,
} from './print-jobs.js';

const NOW = '2026-06-15T10:00:00.000Z';
const EMPLOYEE = { type: 'employee', id: 'emp-1' } as const;

const labelPrinter: Printer = {
  id: 'prn-label',
  name: 'Etikettendrucker 1',
  queue: '\\\\srv\\labels',
  driver: 'windows_print_server',
  supportedFormats: ['pdf', 'zpl'],
  jobTypes: ['price_label', 'box_slip'],
  active: true,
};

const fullPerms: PrintPermissions = { canPrint: true, canReprint: true };

function params(overrides: Partial<BuildPrintJobParams> = {}): BuildPrintJobParams {
  return {
    id: 'job-1',
    caseId: 'case-1',
    jobType: 'price_label',
    printer: labelPrinter,
    payloadRef: 's3://render/job-1.pdf',
    now: NOW,
    actor: EMPLOYEE,
    isReprint: false,
    permissions: fullPerms,
    ...overrides,
  };
}

describe('selectPrinter', () => {
  it('finds an active printer for the requested type and format', () => {
    expect(selectPrinter([labelPrinter], 'box_slip', 'pdf')?.id).toBe('prn-label');
  });
  it('returns undefined when no printer supports the format', () => {
    expect(selectPrinter([labelPrinter], 'price_label', 'epl')).toBeUndefined();
  });
  it('ignores inactive printers', () => {
    expect(selectPrinter([{ ...labelPrinter, active: false }], 'price_label')).toBeUndefined();
  });
});

describe('buildPrintJob – queueing and validation (§13.4)', () => {
  it('creates a queued PDF job by default and logs print.job_created', () => {
    const d = buildPrintJob(params());
    if (!d.ok) throw new Error('expected ok');
    expect(d.job.status).toBe('queued');
    expect(d.job.format).toBe('pdf');
    expect(d.events[0].eventType).toBe('print.job_created');
    expect(d.events[0].actorId).toBe('emp-1');
  });

  it('rejects a format the printer does not support', () => {
    const d = buildPrintJob(params({ format: 'epl' }));
    expect(d.ok).toBe(false);
  });

  it('rejects a job type the printer cannot produce', () => {
    const slipOnly: Printer = { ...labelPrinter, jobTypes: ['box_slip'] };
    expect(buildPrintJob(params({ printer: slipOnly, jobType: 'price_label' })).ok).toBe(false);
  });

  it('rejects an inactive printer', () => {
    expect(buildPrintJob(params({ printer: { ...labelPrinter, active: false } })).ok).toBe(false);
  });
});

describe('reprint permission (§13.4 Nachdruck mit Berechtigung)', () => {
  it('blocks a first print when canPrint is false', () => {
    const d = buildPrintJob(params({ permissions: { canPrint: false, canReprint: true } }));
    expect(d.ok).toBe(false);
  });

  it('blocks a reprint when canReprint is false', () => {
    const d = buildPrintJob(
      params({ isReprint: true, permissions: { canPrint: true, canReprint: false } }),
    );
    expect(d.ok).toBe(false);
  });

  it('allows a reprint when canReprint is true and flags the job', () => {
    const d = buildPrintJob(params({ isReprint: true }));
    if (!d.ok) throw new Error('expected ok');
    expect(d.job.isReprint).toBe(true);
  });
});

describe('completePrintJob / failPrintJob', () => {
  it('marks success and emits box.label_printed for a box slip', () => {
    const built = buildPrintJob(params({ jobType: 'box_slip', boxId: 'box-1' }));
    if (!built.ok) throw new Error('expected ok');
    const { job, events } = completePrintJob(built.job, NOW, EMPLOYEE);
    expect(job.status).toBe('succeeded');
    expect(job.completedAt).toBe(NOW);
    expect(events.map((e) => e.eventType)).toEqual(['print.job_completed', 'box.label_printed']);
    expect(events[1].entityId).toBe('box-1');
  });

  it('does not emit box.label_printed for a price label', () => {
    const built = buildPrintJob(params({ jobType: 'price_label' }));
    if (!built.ok) throw new Error('expected ok');
    const { events } = completePrintJob(built.job, NOW, EMPLOYEE);
    expect(events.map((e) => e.eventType)).toEqual(['print.job_completed']);
  });

  it('records the failure reason and emits print.job_failed', () => {
    const built = buildPrintJob(params());
    if (!built.ok) throw new Error('expected ok');
    const { job, events } = failPrintJob(built.job, 'printer offline', NOW, EMPLOYEE);
    expect(job.status).toBe('failed');
    expect(job.errorMessage).toBe('printer offline');
    expect(events[0].eventType).toBe('print.job_failed');
  });
});

describe('buildBoxSlipData', () => {
  it('projects box fields into the slip payload', () => {
    const box: TransportBox = {
      id: 'box-1',
      caseId: 'case-1',
      boxNo: 2,
      branchNo: '027',
      shopAreaNo: 'SB-1',
      shopNo: '10',
      floor: 'EG',
      positionIds: ['p1'],
      quantity: 12,
      labelPrinted: false,
      sealed: false,
    };
    const slip = buildBoxSlipData(box, 'WE-12345');
    expect(slip).toMatchObject({ boxId: 'box-1', boxNo: 2, weBelegNo: 'WE-12345', quantity: 12 });
  });
});
