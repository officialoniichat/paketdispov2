import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, DEMO_SCENARIOS, getScenario } from './scenarios.js';

describe('demo scenario catalog', () => {
  it('exposes more than one Belegset', () => {
    expect(DEMO_SCENARIOS.length).toBeGreaterThan(1);
    expect(DEMO_SCENARIOS.map((s) => s.id)).toContain(DEFAULT_SCENARIO_ID);
  });

  it.each(DEMO_SCENARIOS.map((s) => [s.id] as const))(
    'scenario "%s" builds a self-consistent bundle',
    (id) => {
      const { bundle, collectStops, belege, aggregates } = getScenario(id).build();

      // Bundle caseIds match the aggregates + belege.
      expect(bundle.caseIds).toEqual(aggregates.map((a) => a.caseId));
      expect(belege.map((b) => b.caseId).sort()).toEqual(aggregates.map((a) => a.caseId).sort());

      // Belege are ordered 0..n-1.
      expect(belege.map((b) => b.order)).toEqual(belege.map((_, i) => i));

      // Collect stops cover every case exactly once and are route-ordered.
      const stopCaseIds = collectStops.flatMap((s) => s.caseIds).sort();
      expect(stopCaseIds).toEqual(aggregates.map((a) => a.caseId).sort());
      expect(collectStops.map((s) => s.sequence)).toEqual(collectStops.map((_, i) => i));

      // Every aggregate carries its derived Arbeitsanweisung points.
      for (const agg of aggregates) {
        expect(agg.instructionPoints.length).toBeGreaterThan(0);
        expect(agg.positions.length).toBeGreaterThan(0);
      }
    },
  );

  it('falls back to the default scenario for an unknown id', () => {
    expect(getScenario('nope').id).toBe(DEFAULT_SCENARIO_ID);
  });
});
