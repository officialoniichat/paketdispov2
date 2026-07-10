/**
 * Deutsche Anzeigetexte für die Domain-Enums, die keinen Status-Chip haben.
 *
 * Pure Daten, kein React – wie {@link ./tokens}. Enums MIT Chip (CaseStatus,
 * PriorityFlag, IssueStatus, SyncState) tragen ihr Label bereits in der
 * jeweiligen `*Meta`-Tabelle dort; die wird hier nicht wiederholt.
 *
 * Beide Frontends lesen aus dieser einen Tabelle: der Kunde darf nirgends einen
 * rohen Schlüssel wie `haengebahn` oder `wrong_color` sehen (Zusage an Eva,
 * Kundencall 07.07.2026). Jede Tabelle ist ein vollständiger `Record<Enum, …>` –
 * kommt ein Enum-Wert dazu, bricht der Typecheck, statt den Schlüssel roh
 * durchzureichen.
 */
import type {
  AssignmentStatus,
  EmployeeRole,
  IssueScope,
  IssueType,
  LocationKind,
  ShiftSource,
  SkuLineStatus,
  ZstSource,
} from '@paket/domain-types';

/** Problemarten, die ein Mitarbeiter melden kann (§9.7). */
export const issueTypeLabels: Record<IssueType, string> = {
  missing_quantity: 'Minderlieferung',
  overdelivery: 'Mehrlieferung',
  wrong_article: 'falscher Artikel',
  wrong_color: 'falsche Farbe',
  wrong_size: 'falsche Größe',
  damaged_goods: 'beschädigt',
  missing_package: 'Paket fehlt',
  label_problem: 'Etikettenproblem',
  security_problem: 'Sicherungsproblem',
  printer_problem: 'Druckerproblem',
  other: 'Sonstiges',
};

/** Worauf sich ein gemeldetes Problem bezieht. */
export const issueScopeLabels: Record<IssueScope, string> = {
  case: 'Beleg',
  position: 'Position',
  sku_line: 'Größenzeile',
  transport_box: 'Transportkarton',
};

/** Art eines Lagerplatzes (Anhang D). */
export const locationKindLabels: Record<LocationKind, string> = {
  regal: 'Regal',
  palette_a: 'Palette A',
  palette_b: 'Palette B',
  palette_c: 'Palette C',
  palette_e: 'Palette E',
  haengebahn: 'Hängebahn',
  lagerplatz_d: 'Lagerplatz D',
  workstation: 'Arbeitsplatz',
  printer: 'Drucker',
  conveyor_packages: 'Förderband Pakete',
  conveyor_finished_goods: 'Förderband Fertigware',
};

/** Anwendungsrollen (§5 / §16.1). */
export const employeeRoleLabels: Record<EmployeeRole, string> = {
  employee: 'Mitarbeiter',
  teamlead: 'Teamleitung',
  admin: 'Administration',
  it: 'IT',
};

/** Status eines zugeteilten Bündels. */
export const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  created: 'Neu',
  assigned: 'Zugeteilt',
  accepted: 'Angenommen',
  active: 'In Bearbeitung',
  paused: 'Pausiert',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};

/** Erfassungsstand einer Größenzeile. */
export const skuLineStatusLabels: Record<SkuLineStatus, string> = {
  open: 'Offen',
  confirmed: 'Bestätigt',
  deviation: 'Abweichung',
};

/** Woher ein ZST-Abschluss stammt. */
export const zstSourceLabels: Record<ZstSource, string> = {
  mobile_app: 'Mitarbeiter-App',
  teamlead_dashboard: 'Teamlead-Dashboard',
  manual_import: 'Manueller Import',
};

/** Woher die Schichtwerte eines Mitarbeiters stammen (§11c). */
export const shiftSourceLabels: Record<ShiftSource, string> = {
  seak: 'SEAK',
  pattern: 'Wochenmuster',
  teamlead: 'Teamleitung',
};
