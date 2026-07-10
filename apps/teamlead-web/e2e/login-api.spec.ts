/**
 * Anmeldung — auf API-Ebene, weil das Teamlead-Dashboard bewusst KEINEN
 * Login-Screen hat (Entscheidung Daniel, 10.07.2026: Pre-Pilot, Demodaten, der
 * statische Token aus `/env.js` bleibt). Die beiden Rollenpfade lassen sich
 * daher nirgends in dieser Oberfläche prüfen — nur hier.
 *
 * Läuft gegen den echten, geseedeten Backend aus `fixtures/global-setup.ts`.
 */
import { test, expect } from '@playwright/test';
import {
  DEMO_PIN,
  PLANNABLE_EMPLOYEE_NOS,
  postLogin,
  rolesOf,
  TEAMLEAD_NO,
  UNKNOWN_EMPLOYEE_NO,
  WRONG_PIN,
} from './fixtures/auth.js';

test('Anmeldung (Daniel 10.07.): Teamlead meldet sich mit Nummer + PIN „0000" an → 200, Rolle teamlead', async () => {
  const result = await postLogin({ employeeNo: TEAMLEAD_NO, pin: DEMO_PIN });

  expect(result.status).toBe(200);
  expect(result.token).toBeTruthy();
  expect(rolesOf(result.token!)).toContain('teamlead');
});

test('Anmeldung (Dustin: „nur die Mitarbeiternummer"): Mitarbeiter ohne pin-Feld → 200, Rolle employee', async () => {
  const employeeNo = PLANNABLE_EMPLOYEE_NOS[0];

  // Kein `pin`-Feld im Body — genau Dustins wörtliche Forderung.
  const result = await postLogin({ employeeNo });

  expect(result.status).toBe(200);
  expect(result.token).toBeTruthy();
  expect(rolesOf(result.token!)).toEqual(['employee']);
});

test('Anmeldung: unbekannte Mitarbeiternummer → 401', async () => {
  const result = await postLogin({ employeeNo: UNKNOWN_EMPLOYEE_NO });

  expect(result.status).toBe(401);
  expect(result.token).toBeUndefined();
});

test('Anmeldung: Teamlead mit FALSCHER PIN → 401 (der PIN-Wegfall für Mitarbeiter öffnet den Teamlead-Pfad nicht)', async () => {
  const wrongPin = await postLogin({ employeeNo: TEAMLEAD_NO, pin: WRONG_PIN });
  expect(wrongPin.status).toBe(401);
  expect(wrongPin.token).toBeUndefined();

  // Und der Teamlead kommt auch NICHT ohne PIN durch — sonst hätte der Rückbau
  // für die Mitarbeiterrolle den privilegierten Pfad mitgeöffnet.
  const noPin = await postLogin({ employeeNo: TEAMLEAD_NO });
  expect(noPin.status).toBe(401);
  expect(noPin.token).toBeUndefined();
});
