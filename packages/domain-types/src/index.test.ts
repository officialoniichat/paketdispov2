import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULE_CONFIG,
  goodsReceiptCaseSchema,
  liveEventSchema,
  liveEventTypeSchema,
  priorityFlagSchema,
  ruleConfigSchema,
  sectionCodeSchema,
  workflowEventTypeSchema,
} from './index.js';

describe('domain-types schemas', () => {
  it('accepts a prio case without a section (Prio != Abschnitt)', () => {
    const parsed = goodsReceiptCaseSchema.parse({
      id: 'case-1',
      source: 'prohandel_api',
      externalRef: 'ph-booking-100',
      weBelegNo: 'WE-100',
      bookingDate: '2026-06-15',
      branchNo: '001',
      storageLocation: { id: 'loc-1', type: 'regal', code: 'R27', active: true },
      section: null,
      priorityFlags: ['prio'],
      totalQuantity: 42,
      status: 'ready',
      effortPoints: 12.5,
      estimatedMinutes: 30,
      version: 0,
    });
    expect(parsed.section).toBeNull();
    expect(parsed.priorityFlags).toContain('prio');
  });

  it('rejects non-existent section codes 5 and 6', () => {
    expect(() => sectionCodeSchema.parse(5)).toThrow();
    expect(() => sectionCodeSchema.parse(6)).toThrow();
    expect(sectionCodeSchema.parse(7)).toBe(7);
  });

  it('exposes the full workflow event taxonomy', () => {
    expect(workflowEventTypeSchema.parse('zst.created')).toBe('zst.created');
    expect(priorityFlagSchema.parse('catman_due')).toBe('catman_due');
  });

  it('kennt die Audit-Events der Zusammenarbeit (geteilter Beleg)', () => {
    for (const type of [
      'case.collaboration_started',
      'case.collaboration_invited',
      'case.collaboration_accepted',
      'case.collaboration_declined',
      'case.collaboration_part_done',
      'case.collaboration_participant_removed',
      'case.collaboration_dissolved',
    ]) {
      expect(workflowEventTypeSchema.parse(type)).toBe(type);
    }
  });
});

describe('ruleConfigSchema.collaboration (geteilter Beleg)', () => {
  it('parst eine alte persistierte rule_config ohne den Schlüssel und liefert den Standard', () => {
    const legacy: Record<string, unknown> = { ...DEFAULT_RULE_CONFIG };
    delete legacy.collaboration;
    const parsed = ruleConfigSchema.parse(legacy);
    expect(parsed.collaboration).toEqual({ helpBeforeNextBundle: false });
    // Die übrigen Cockpit-Einstellungen bleiben erhalten (kein Rückfall auf den Default).
    expect(parsed.shiftEnd.autoCutoffMinutes).toBe(DEFAULT_RULE_CONFIG.shiftEnd.autoCutoffMinutes);
  });

  it('ergänzt ein leeres collaboration-Objekt um den Feld-Standard', () => {
    const parsed = ruleConfigSchema.parse({ ...DEFAULT_RULE_CONFIG, collaboration: {} });
    expect(parsed.collaboration.helpBeforeNextBundle).toBe(false);
  });

  it('übernimmt einen gesetzten Schalter unverändert', () => {
    const parsed = ruleConfigSchema.parse({
      ...DEFAULT_RULE_CONFIG,
      collaboration: { helpBeforeNextBundle: true },
    });
    expect(parsed.collaboration.helpBeforeNextBundle).toBe(true);
  });

  it('DEFAULT_RULE_CONFIG hat den Schalter aus', () => {
    expect(DEFAULT_RULE_CONFIG.collaboration.helpBeforeNextBundle).toBe(false);
  });
});

describe('liveEventSchema (typisierter SSE-Kanal, mehrere Empfänger)', () => {
  it('akzeptiert ein adressiertes Ereignis je Typ', () => {
    for (const type of liveEventTypeSchema.options) {
      const parsed = liveEventSchema.parse({
        type,
        recipients: ['ma-1', 'ma-2'],
        caseId: 'case-1',
        status: 'in_progress',
        actorEmployeeNo: 'ma-1',
        positionId: null,
        at: '2026-08-31T09:00:00.000Z',
      });
      expect(parsed.type).toBe(type);
      expect(parsed.recipients).toEqual(['ma-1', 'ma-2']);
    }
  });

  it('lehnt unbekannte Typen und fehlende Empfängerliste ab', () => {
    expect(() =>
      liveEventSchema.parse({
        type: 'case-status',
        recipients: [],
        caseId: null,
        status: null,
        actorEmployeeNo: null,
        positionId: null,
        at: '2026-08-31T09:00:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      liveEventSchema.parse({
        type: 'case.status',
        caseId: 'case-1',
        status: 'ready',
        actorEmployeeNo: null,
        positionId: null,
        at: '2026-08-31T09:00:00.000Z',
      }),
    ).toThrow();
  });
});
