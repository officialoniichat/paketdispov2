import { describe, expect, it } from 'vitest';
import {
  fetchProhandelIntegration,
  retryQuarantineItem,
  saveProhandelConfig,
  testProhandelConnection,
} from './integrations.js';

describe('ProHandel integration mock', () => {
  it('exposes config without a secret value (ENV-only)', async () => {
    const data = await fetchProhandelIntegration();
    expect(data.config.secretConfigured).toBe(true);
    expect(data.config.secretEnvVar).toBe('PROHANDEL_API_KEY');
    // The secret value itself must never be part of the payload.
    expect(Object.keys(data.config)).not.toContain('apiKey');
    expect(Object.keys(data.config)).not.toContain('secret');
  });

  it('keeps the ENV secret flags when saving an edited config', async () => {
    const before = await fetchProhandelIntegration();
    const saved = await saveProhandelConfig({
      ...before.config,
      secretConfigured: false, // attempt to override from UI — must be ignored
      pollIntervalSeconds: 300,
    });
    expect(saved.config.pollIntervalSeconds).toBe(300);
    expect(saved.config.secretConfigured).toBe(true);
  });

  it('removes a quarantined booking on retry', async () => {
    const before = await fetchProhandelIntegration();
    expect(before.quarantine.length).toBeGreaterThan(0);
    const target = before.quarantine[0]!.weBelegNo;
    const after = await retryQuarantineItem(target);
    expect(after.quarantine.find((q) => q.weBelegNo === target)).toBeUndefined();
  });

  it('reports a connection test result', async () => {
    const result = await testProhandelConnection();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/erreichbar/);
  });
});
