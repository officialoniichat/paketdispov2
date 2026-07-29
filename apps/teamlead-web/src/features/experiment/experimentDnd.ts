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
  if (drag.employeeId === targetEmployeeId) return null;
  // Nur ungestartete Belege sind verschiebbar (§7.1: move verlangt `assigned`).
  return drag.status === 'assigned' && drag.bundleId !== '' ? { kind: 'move' } : null;
}

/** Matrix→Ablagen: Entziehen (withdraw) gilt für ungestartete, zugewiesene Belege. */
export function canWithdraw(
  drag: ExperimentDragPayload | null,
): drag is Extract<ExperimentDragPayload, { source: 'matrix' }> {
  return (
    drag !== null && drag.source === 'matrix' && drag.status === 'assigned' && drag.bundleId !== ''
  );
}
