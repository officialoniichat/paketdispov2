/**
 * Experiment DA.M.B — reines Drag-&-Drop-Regelwerk (Anzeige-Schicht).
 *
 * Jede Geste mappt 1:1 auf eine EXISTIERENDE auditierte Teamlead-Aktion
 * (park/unpark/prioritise/deprioritise/forward/unforward bzw. assign/move/
 * withdraw) — hier wird nur entschieden, welches Ziel für welchen gezogenen
 * Beleg gültig ist und welche Aktion ein Drop auslöst. Keine neue Fachlogik:
 * die Statusregeln spiegeln die Aktions-Registry (actions/caseActions.ts) und
 * den §7.1-Zustandsgraphen; zwischen den Sektions-Ablagen (Verladeplan/Jeden-
 * Tag/Sonstige) existiert kein Endpoint, also auch kein Drop.
 */
import type { BoardCase, LaneCard, LaneId } from '../../data/types.js';

/** Der aktuell gezogene Beleg — Screen-globaler State statt dataTransfer (KanbanBoard-Muster). */
export type ExperimentDragPayload =
  | {
      source: 'ablage';
      caseId: string;
      weBelegNo: string;
      status: LaneCard['status'];
      lane: LaneId;
      priorityFlags: readonly string[];
      forwardedTo: string | null;
    }
  | {
      source: 'matrix';
      caseId: string;
      weBelegNo: string;
      status: BoardCase['status'];
      bundleId: string;
      employeeId: string;
      employeeName: string;
    }
  | {
      /** Einzelne Beleg-Zeile aus einem Vorverteilungs-Bündel (Rückseite des Beleg-Fensters). */
      source: 'vorschlag';
      caseId: string;
      weBelegNo: string;
      /** Slot-Index des Bündels, aus dem gezogen wird. */
      slot: number;
    }
  | {
      /** Ganzes vorbereitetes Bündel — Drop auf eine Matrix-Zeile = echtes A1/A2-Zuweisen. */
      source: 'vorschlag-bundle';
      slot: number;
      /** Belege in Abhol-Reihenfolge (erster Beleg wird erstes Bündel-Mitglied). */
      caseIds: string[];
      teile: number;
      /** Nur wenn ALLE Belege `ready` sind, ist echtes Zuweisen erlaubt. */
      allReady: boolean;
    };

/** Aktion, die ein Drop auf eine Ablage-Lane auslöst. */
export type AblagenDropAction =
  | { kind: 'park' }
  | { kind: 'unpark' }
  | { kind: 'prioritise' }
  | { kind: 'deprioritise' }
  | { kind: 'forward' }
  | { kind: 'unforward' };

const SECTION_LANES: readonly LaneId[] = ['verladeplan_heute', 'jeden_tag', 'sonstige'];

/**
 * Gültigkeit + Aktion eines Drops auf eine Ablage-Lane. `null` = ungültiges
 * Ziel (kein preventDefault, keine Hervorhebung).
 */
export function ablagenDropAction(
  drag: ExperimentDragPayload,
  targetLane: LaneId,
): AblagenDropAction | null {
  if (drag.source !== 'ablage') return null; // Matrix→Ablagen läuft über die Entziehen-Zone.
  if (targetLane === drag.lane) return null;
  // „Verladeplan morgen" ist strukturell leer (das Bucketing liefert die Lane nie)
  // und „Problemfälle" entstehen nur durch den Mitarbeiter — beides keine Ziele.
  if (targetLane === 'verladeplan_morgen' || targetLane === 'probleme') return null;

  if (targetLane === 'weitergeleitet') {
    return drag.forwardedTo === null ? { kind: 'forward' } : null;
  }
  if (drag.forwardedTo !== null) {
    // Weitergeleitete Belege zuerst zurückholen: Drop auf eine Pool-Lane = „Zurückholen".
    return { kind: 'unforward' };
  }
  if (targetLane === 'geparkt') {
    return drag.status === 'ready' ? { kind: 'park' } : null;
  }
  if (targetLane === 'prio') {
    const alreadyPrio =
      drag.priorityFlags.includes('prio') ||
      drag.priorityFlags.includes('manual_teamlead_priority');
    return drag.status === 'ready' && !alreadyPrio ? { kind: 'prioritise' } : null;
  }
  if (SECTION_LANES.includes(targetLane)) {
    if (drag.lane === 'geparkt' && drag.status === 'parked') return { kind: 'unpark' };
    if (
      drag.lane === 'prio' &&
      drag.status === 'ready' &&
      drag.priorityFlags.includes('manual_teamlead_priority')
    ) {
      return { kind: 'deprioritise' };
    }
    return null; // Sektions-Zuordnung ist datengetrieben (Abschnitt) — nicht setzbar.
  }
  return null;
}

/** Aktion, die ein Drop auf eine Mitarbeiter-Zeile der Matrix auslöst. */
export type MatrixDropAction = { kind: 'assign' } | { kind: 'move' } | { kind: 'assign-bundle' };

export function matrixDropAction(
  drag: ExperimentDragPayload,
  targetEmployeeId: string,
): MatrixDropAction | null {
  if (drag.source === 'ablage') {
    // Zuweisen verlangt exakt `ready` ohne Weiterleitungs-Umweg (Registry-Regel).
    return drag.status === 'ready' && drag.forwardedTo === null ? { kind: 'assign' } : null;
  }
  // Vorschau-Zeilen ordnet nur die Rückseite selbst um — kein Matrix-Ziel.
  if (drag.source === 'vorschlag') return null;
  if (drag.source === 'vorschlag-bundle') {
    // Vorbereitetes Bündel → ECHTES A1/A2-Zuweisen (assign-bundle); die Vorschau
    // enthält auch re-geplante `assigned`-Belege, daher nur wenn alle `ready` sind.
    return drag.allReady && drag.caseIds.length > 0 ? { kind: 'assign-bundle' } : null;
  }
  if (drag.employeeId === targetEmployeeId) return null; // Pack-genau: siehe packDropAction.
  // Nur ungestartete Belege sind verschiebbar (§7.1: move verlangt `assigned`).
  return matrixVerschiebbar(drag) ? { kind: 'move' } : null;
}

/**
 * Verschiebbarer Matrix-Beleg: §7.1 lässt `move` (wie `withdraw`) NUR auf einem noch
 * `assigned`, also ungestarteten Beleg zu. Alles, was der Mitarbeiter schon angefasst
 * hat, bleibt liegen — auch `issue_open`/`problem_resolved`: die entstehen erst NACH
 * dem Start (Teilabschluss mit Problemen) und bleiben laut §7.1 beim selben
 * Mitarbeiter geparkt. Fertige/stornierte ohnehin.
 */
export function matrixVerschiebbar(
  drag: Extract<ExperimentDragPayload, { source: 'matrix' }>,
): boolean {
  return drag.status === 'assigned' && drag.bundleId !== '';
}

/** Ziel-Pack eines Drops: Pack `index` im Bündel von `employeeId`. */
export interface PackDropTarget {
  employeeId: string;
  /**
   * Persistierter Pack-Index im Ziel-Bündel (`AssignmentItem.packIndex`). Jeder
   * Beleg eines Bündels gehört genau einem Pack, es gibt also keinen pack-losen
   * Sammelkasten — jeder Kasten ist ein echtes Ziel.
   */
  index: number;
  /** Belege, die aktuell in diesem Kasten liegen — für „liegt schon hier". */
  caseIds: readonly string[];
  /** Abwesend (krank/urlaub) = die ganze Zeile nimmt nichts entgegen. */
  absent: boolean;
}

/**
 * Drop eines Matrix-Belegs auf EIN Pack — deckt beide Richtungen ab: ein anderes
 * Pack DESSELBEN Mitarbeiters (Umhängen innerhalb) und ein Pack eines ANDEREN
 * Mitarbeiters (mitarbeiterübergreifend). Beides ist dieselbe auditierte
 * `moveCase`-Mutation, nur mit `targetPackIndex`; hier fällt lediglich die
 * Ziel-Entscheidung. `null` = kein gültiges Ziel (kein Drop, keine Hervorhebung).
 */
export function packDropAction(
  drag: ExperimentDragPayload | null,
  target: PackDropTarget,
): { kind: 'move'; targetPackIndex: number } | null {
  if (drag === null || drag.source !== 'matrix') return null; // Ablage-Drags: Zeile/Strich.
  if (target.absent) return null;
  if (!matrixVerschiebbar(drag)) return null;
  // Liegt der Beleg schon in diesem Kasten, gibt es nichts zu tun (Backend: 409).
  if (target.caseIds.includes(drag.caseId)) return null;
  return { kind: 'move', targetPackIndex: target.index };
}

/**
 * Ablage-Drag, der direkt zuweisbar ist (ready, nicht weitergeleitet) — Basis
 * für Matrix-Zeile, den „+ Nächstes Bündel"-Slot und das Einsortieren zwischen
 * Geplant-Belegen.
 */
export function ablageAssignbar(
  drag: ExperimentDragPayload | null,
): drag is Extract<ExperimentDragPayload, { source: 'ablage' }> {
  return (
    drag !== null &&
    drag.source === 'ablage' &&
    drag.status === 'ready' &&
    drag.forwardedTo === null
  );
}

/** Matrix→Ablagen: Entziehen (withdraw) gilt für ungestartete, zugewiesene Belege. */
export function canWithdraw(
  drag: ExperimentDragPayload | null,
): drag is Extract<ExperimentDragPayload, { source: 'matrix' }> {
  return (
    drag !== null && drag.source === 'matrix' && drag.status === 'assigned' && drag.bundleId !== ''
  );
}
