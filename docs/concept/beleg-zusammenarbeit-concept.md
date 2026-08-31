# Beleg gemeinsam bearbeiten (geteilter Beleg)

**Status:** umgesetzt (Backend + beide Apps) · Stand 2026-08-31
**Abgrenzung:** `docs/concept/beleg-split-multi-employee-concept.md` (Aufteilen in echte
Teil-Belege) bleibt unverändert gültig — das hier ist der *andere* Weg: ein Beleg, mehrere
Bearbeitende, alle sehen alles.

---

## 0. Anforderung (L&T / Daniel, 31.08.2026, sinngemäß verdichtet)

> Mitarbeitende sollen sich einen Beleg **untereinander teilen** können: unter „1 · Ware holen"
> je Beleg oben rechts ein Teilen-Icon (Apple-Share), dahinter eine Liste der Kolleg:innen mit
> Haken wie in WhatsApp, optional eine Nachricht. Die Eingeladenen bekommen eine **1** am
> Profilkreis, einen Menüpunkt **„Nachrichten"** (Splitscreen: links die Übersicht, rechts die
> Nachrichten mit Verlauf — was gesendet wurde und wie reagiert wurde) und eine
> Bildschirm-Benachrichtigung mit grünem Haken links und rotem Kreuz rechts.
>
> Kreuz: nicht weiter behelligt. Haken: alle Beteiligten sehen den Beleg bei sich, als geteilt
> hervorgehoben. Beim Bearbeiten sieht **jeder alle Positionen**; oben rechts umschaltbar eine
> Team-Ansicht (links mindestens die halbe Breite für sich selbst, rechts der/die anderen; bei
> mehreren ein Kästchen-Raster, Kästchen antippen zeigt den Einzelnen). Jede Aktion eines
> Beteiligten lässt sein Kästchen bei den anderen kurz **aufleuchten**.
>
> Wer mit seinem Teil fertig ist, meldet **„Teilbeleg erledigt"** (statt „Beleg erledigt"),
> erscheint bei den anderen grau, darf Neues holen; der Beleg gilt erst als fertig, wenn alle
> Positionen abgehakt sind — Ausnahme: nur noch Problem-Positionen offen.
>
> Admin-Regel: entweder darf der Mitarbeiter nach seinem Teil (und den übrigen Belegen des
> Bündels) Neues anfordern, **oder** er muss am geteilten Beleg mithelfen, bis alle Positionen
> abgehakt sind; beim Anfordern wird ihm das angezeigt.
>
> Teamleitung: geteilte Belege im Mitarbeiterboard/der Matrix **golden** hervorheben, zwischen
> Belegnummer und „N Teile" den anderen Mitarbeiter bzw. die Anzahl (z. B. „3×", Hover zeigt die
> Liste), Aktion **„Aus geteiltem Beleg entfernen"**. Im Aufteilen-Dialog eine **vorausgewählte**
> Option, dass die Mitarbeitenden den **ganzen** Beleg sehen. Die Teamleitung sieht, dass ein
> Beleg zusammengearbeitet wird oder wurde.

---

## 1. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Geteilter Beleg** (gemeinsam bearbeitet) | EIN Beleg, an dem mehrere Mitarbeitende gleichzeitig arbeiten. Alle sehen alle Positionen. |
| **Inhaber** | Der Mitarbeiter, in dessen Bündel/Karren der Beleg liegt (`assignedBundle`). Er holt die Ware. |
| **Helfer** | Weitere Beteiligte. Der Beleg liegt *nicht* in ihrem Bündel, erscheint bei ihnen aber unter „2 · Bearbeiten" (Abschnitt „Geteilt mit dir"). |
| **Beteiligung** | Die Zeile `CaseParticipant` (Beleg × Mitarbeiter) mit Rolle und Status. |
| **Teilbeleg erledigt** | Ein Beteiligter meldet seinen Anteil als erledigt (Status `teil_erledigt`). Keine Zustandsänderung am Beleg. |
| **Aufgeteilt** (bestehend) | Etwas anderes: der Beleg wurde in eigenständige Teil-Belege zerlegt (`split_container`). |

Sichtbare Texte benutzen konsequent „geteilt“/„gemeinsam bearbeiten“ und nie „Teil-Beleg“ für
diesen Fall; der Button heißt auf ausdrücklichen Wunsch `'Teilbeleg erledigt'`.

---

## 2. Die Entscheidung: Beteiligung als Overlay, kein zweiter Status

Ein Beleg liegt weiterhin in **genau einem** Bündel (`AssignmentItem @@unique([caseId])`,
`GoodsReceiptCase.assignedBundleId`, Ein-offenes-Bündel-Invariante). Zusammenarbeit ist eine
zusätzliche Relation *Beteiligte je Beleg* — kein zweites `AssignmentItem`, kein neuer
`CaseStatus`. Engine, Pack-Fenster, Bündel-Abschluss und Kapazität bleiben unverändert am
Inhaber; die Engine plant ohnehin nur `ready`-Belege.

**Warum kein neuer Status.** Jeder neue `CaseStatus` müsste in allen Erlaubnislisten des
Stacks (Pool-Abfragen, Ablagen, Zustandsmaschine, Terminal-Mengen in Backend und drei
Frontend-Spiegeln) nachgezogen werden. „Mein Teil ist fertig“ ist aber kein Zustand des
Belegs, sondern eines Beteiligten.

**Warum der Haken jetzt serverseitig lebt.** „Position geprüft“ war bislang reiner
Client-Zustand (ging beim Neuladen verloren). Gemeinsame Arbeit braucht eine gemeinsame
Wahrheit: wer hat welche Position wann geprüft, welche Ist-Mengen/Preiskorrekturen sind
erfasst. Beides wird pro Aktion persistiert — für **alle** Belege, nicht nur geteilte (eine
Wahrheit statt zwei Pfade).

---

## 3. Ablauf Mitarbeitende

1. **Einladen.** Unter „1 · Ware holen“ je Beleg ein Teilen-Icon (oben rechts über dem
   Status-Chip `'offen'`/`'geholt'`). Es öffnet `'Beleg teilen'`: Liste aller aktiven
   Kolleg:innen (Haken links, Name, `'heute im Dienst'`), bereits Beteiligte sind markiert,
   optional `'Nachricht (optional)'`, Aktion `'Einladen'`. Einladen darf der Inhaber und jeder
   aktive Beteiligte.
2. **Benachrichtigung.** Eingeladene sehen am Profilkreis eine Zahl (offene Einladungen +
   ungelesene Teamlead-Nachrichten) und eine Bildschirm-Benachrichtigung oben:
   „*Name* lädt dich ein, WE *Nr* gemeinsam zu bearbeiten“ + Nachricht, mit zwei runden
   Tasten — grüner Haken links, rotes Kreuz rechts.
3. **Nachrichten.** Profilmenü: `'Zur Teamlead-App'` → **`'Nachrichten'`** → `'Abmelden'`.
   Der Bildschirm `/nachrichten` zeigt auf breiten Displays links die Übersicht (unverändert),
   rechts schmal den Verlauf: erhaltene Einladungen (offen/angenommen/abgelehnt/entfernt),
   gesendete Einladungen mit Reaktion, Teamlead-Nachrichten. Auf dem Handy nur der Verlauf mit
   Zurück-Taste.
4. **Ablehnen** (`abgelehnt`): keine weitere Anzeige, bleibt im Verlauf. Eine erneute Einladung
   ist möglich.
5. **Annehmen** (`angenommen`): der Beleg erscheint beim Helfer unter „2 · Bearbeiten“ im
   Abschnitt `'Geteilt mit dir'`; beim Inhaber ist die Karte golden mit
   `'Geteilt mit Anna Berger'` bzw. `'Geteilt · 3 Personen'`.
6. **Bearbeiten.** Alle sehen alle Positionen; `'Position geprüft'` zeigt die Initialen dessen,
   der geprüft hat. Oben rechts `'Team-Ansicht'`: Splitscreen, links die eigene Tabelle (mind.
   50 %), rechts bei einem anderen Beteiligten dessen Fortschritt (Name, Status, Balken,
   geprüfte Positionen), bei mehreren ein Raster aus Kästchen (Antippen → Einzelansicht →
   `'Zurück zur Übersicht'`). Aktionen anderer lassen deren Kästchen ~1,5 s aufleuchten.
7. **Teilbeleg erledigt.** Solange nicht alle Positionen geprüft sind, ist die Primäraktion für
   einen aktiven Beteiligten `'Teilbeleg erledigt'` → Status `teil_erledigt`, bei den anderen
   grau. Er darf weiter mithelfen; sind alle Positionen geprüft, heißt die Primäraktion für jeden
   Beteiligten `'Beleg erledigt'` (bzw. `'Teilabschluss (Problem melden)'`).
8. **Nächstes Pack.** Inhaber: nach `teil_erledigt` blockiert der geteilte Beleg das eigene Pack
   nicht mehr. Ist die Admin-Regel *„Beim geteilten Beleg erst mithelfen“* aktiv, antwortet das
   Anfordern mit `'Erst den geteilten Beleg zu Ende bringen – es sind noch Positionen offen.'`
   (Grund `shared_case_open`) — für Inhaber und Helfer gleichermaßen, solange der Beleg weder
   fertig noch beim Teamlead in Klärung (`issue_open`) ist.

---

## 4. Ablauf Teamleitung

- **Board/Matrix.** Karten geteilter Belege sind golden (Farbe + Gruppen-Icon + Text), zwischen
  Belegnummer und „N Teile“ steht mittig `'mit Anna Berger'` oder `'3×'` (Tooltip: Namen mit
  Status; `teil_erledigt` grau). Rechtsklick auf die goldene Karte (und ein kleines
  Personen-Icon für Touch) öffnet `'Aus geteiltem Beleg entfernen'` je Helfer → Pflicht-Grund
  → Status `entfernt`. Der Inhaber ist nicht entfernbar (dafür gibt es Entziehen/Verschieben).
  Fertige Belege behalten ihre Beteiligten → „wurde zusammengearbeitet“ bleibt sichtbar.
- **Beleg-Detail.** Chip `'Gemeinsam bearbeitet'` + Beteiligtenliste mit Status und
  Entfernen-Aktion; die Historie zeigt Einladung/Annahme/Ablehnung/Teil erledigt/Entfernt.
- **Dialog „Beleg aufteilen“.** Neuer, **vorausgewählter** Modus `'Gemeinsam bearbeiten'`:
  „Alle Beteiligten sehen den ganzen Beleg und arbeiten ihn zusammen ab.“ Auswahl von
  mindestens zwei Mitarbeitenden (der erste ist Inhaber/Karren), Pflicht-Grund, Aktion
  `'Gemeinsam zuweisen'`. Zweiter Modus `'In Teil-Belege aufteilen'` = der bisherige Dialog
  unverändert. Voraussetzung wie beim Aufteilen: Beleg `ready` oder `parked` und nicht im
  Bündel; ein geparkter Beleg wird dabei freigegeben.
- **Admin & Regeln, Tab „Bündel“.** Schalter `'Beim geteilten Beleg erst mithelfen'`
  („Wer an einem geteilten Beleg beteiligt ist, bekommt kein neues Pack, bis alle Positionen
  geprüft sind.“). Standard: aus.

---

## 5. Regeln (Backend, single source)

### 5.1 Zugriff (§16.1)
Ein Mitarbeiter darf einen Beleg sehen und bearbeiten, wenn er Inhaber ist **oder** aktiver
Beteiligter (`angenommen` | `teil_erledigt`). Das gilt für Aggregat, Starten, Position prüfen,
Mengen erfassen, Beleg erledigt, Teilabschluss, Rückmeldung. **Nur der Inhaber** setzt den
Ware-holen-Haken. Eingeladene (noch nicht angenommen) sehen nichts.

### 5.2 Fertig-Regel geteilter Belege
- `'Beleg erledigt'`: alle Positionen geprüft (`confirmedById` gesetzt).
- `'Teilabschluss'`: jede nicht geprüfte Position ist eine **Problem-Position** — sie hat eine
  offene Meldung (Issue `open` mit Scope `position`/`sku_line` darauf), eine manuelle Meldung
  im Teilabschluss oder eine implizite Abweichung (Mehr-/Mindermenge, Preiskorrektur) auf einer
  ihrer Größenzeilen. Danach läuft der bestehende Problem-Pfad (`issue_open` → Teamlead
  instruiert → `problem_resolved` → weiter → `completed`).
- Nicht geteilte Belege behalten das bisherige Verhalten (Client-Gate).

### 5.3 Leistung (ZST)
Beim Abschluss/Teilabschluss wird je Beteiligtem gebucht, was **er** geprüft hat: Summe der
Ist-Mengen (Größenzeile: erfasste Menge, sonst Soll) über die Positionen mit seiner
`confirmedById`. Idempotenzschlüssel `zst:<caseId>:<employeeId>:<Menge>`, Delta gegen das
bereits für dieses Paar Gebuchte (Problem-Loop bleibt korrekt). Zusätzlich kappt eine
**beleg-weite** Aggregation jedes Delta auf die gezählte Gesamtmenge des Belegs: auch bei
Prüferwechsel zwischen Teilabschluss und Abschluss (Helfer entfernt, Haken neu gesetzt,
Beleg verschoben) landen nie mehr Stück in der KPI-Basis, als der Beleg hergibt. Ohne
Beteiligung bekommt wie bisher der Abschließende die gesamte Menge. `'Teilbeleg erledigt'`
bucht nichts.

### 5.4 Pull-Gate
`packAdvanceBlockers` ignoriert Belege, deren **eigene** Beteiligung des Anfragenden
`teil_erledigt` ist (Inhaber-Zeile) — aber nur, solange die Zusammenarbeit noch **aktiv** ist
(mindestens ein Helfer `angenommen|teil_erledigt`); hat der letzte Helfer abgelehnt oder wurde
er entfernt, hält der offene Beleg den Anfragenden wieder fest (Pull-Prinzip). Bei aktiver
Regel `collaboration.helpBeforeNextBundle` antwortet `POST /api/me/next-bundle` mit
`reason: 'shared_case_open'`, sobald der Anfragende eine aktive Beteiligung an einem Beleg
hat, der weder terminal (`completed|zst_done|cancelled|split_container`) noch `issue_open`
ist — geprüft nach `pack_open` und **vor** `activateNextPack`, und ebenso auf dem Pfad ohne
offenes Bündel. `recalculate` nimmt solche Mitarbeitende bei aktiver Regel aus der
Starter-Pack-Verteilung (wie die Monster-Fortsetzung).

### 5.5 Ende der Zusammenarbeit
Verlässt der Beleg den Karren des Inhabers (Entziehen, Verschieben, Stornieren, Parken durch
Teamlead, „Rest parken“ durch den MA, Revert durch **„Neu berechnen“** oder **Aufteilen** in
Teil-Belege), werden die Beteiligungen gelöscht (`case.collaboration_dissolved`). Geprüfte
Positionen bleiben geprüft. Eine noch unbeantwortete Einladung verfällt damit; Annehmen ist
ohnehin nur möglich, solange der Beleg in einem Karren liegt.

---

## 6. Datenmodell

```prisma
enum CaseParticipantRole   { inhaber helfer }
enum CaseParticipantStatus { eingeladen angenommen abgelehnt teil_erledigt entfernt }

model CaseParticipant {
  id             String                @id @default(cuid())
  caseId         String
  employeeId     String
  role           CaseParticipantRole
  status         CaseParticipantStatus
  invitedById    String?     // User.id des Einladenden (null bei Teamlead/System)
  invitedByLabel String      // Anzeigename-Snapshot ("Hakan Yilmaz", "Teamleitung")
  message        String?
  invitedAt      DateTime    @default(now())
  respondedAt    DateTime?
  partDoneAt     DateTime?
  removedAt      DateTime?
  removedByLabel String?

  case      GoodsReceiptCase @relation(fields: [caseId], references: [id], onDelete: Cascade)
  employee  User             @relation("CaseParticipations", fields: [employeeId], references: [id])
  invitedBy User?            @relation("CaseInvitationsSent", fields: [invitedById], references: [id], onDelete: SetNull)

  @@unique([caseId, employeeId], name: "participant_case_employee")
  @@index([employeeId, status])
  @@map("case_participants")
}
```

Zusätzlich:

| Modell | Neu | Bedeutung |
|---|---|---|
| `ReceiptPosition` | `confirmedAt DateTime?`, `confirmedById String?` (FK User, SetNull) | „Position geprüft“ — wer/wann; `status` wird dabei `confirmed`/`open` |
| `ReceiptSkuLine` | `correctedVkPrice Float?` | Preiskorrektur je Größe, pro Aktion persistiert (wie `confirmedQuantity`) |
| `User` | Relationen `caseParticipations`, `caseInvitationsSent`, `confirmedPositions` | — |
| `RuleConfig` | `collaboration: { helpBeforeNextBundle: boolean }` (Default `false`, mit `.default()`) | Admin-Regel |

Inhaber-Zeile: wird beim ersten Einladen (bzw. beim Anlegen durch den Teamlead) mit Status
`angenommen` erzeugt; sie trägt später `teil_erledigt` des Inhabers. Eine Zusammenarbeit ist
**aktiv**, sobald mindestens ein Helfer `angenommen` oder `teil_erledigt` ist.

Migration: `20260831170000_case_collaboration` (handgeschrieben, deutscher Kommentar-Header).

---

## 7. API

### Mitarbeiter (`@Roles(Employee)`)
| Endpunkt | Zweck |
|---|---|
| `GET /api/me/colleagues` | Aktive Kolleg:innen ohne mich: `{ employeeNo, displayName, shiftToday }` |
| `POST /api/me/cases/:caseId/invitations` `{ employeeNos[], message? }` | Einladen (Beleg `assigned|in_progress|problem_resolved`; Inhaber oder aktiver Beteiligter). Legt Inhaber-Zeile an, Helfer → `eingeladen` (abgelehnt/entfernt → erneut `eingeladen`) |
| `POST /api/me/invitations/:participantId/respond` `{ accept }` | Nur der Eingeladene; `eingeladen` → `angenommen|abgelehnt` |
| `GET /api/me/nachrichten` | Posteingang: `{ pendingCount, items: NachrichtDto[] }` — Einladungen erhalten/gesendet (alle Status) + Teamlead-Nachrichten, neueste zuerst |
| `POST /api/me/cases/:caseId/part-done` | Eigene Beteiligung `angenommen` → `teil_erledigt` |
| `POST /api/cases/:caseId/positions/:positionId/confirmed` `{ confirmed }` | Haken setzen/zurücknehmen (Beleg `in_progress`; kein Versions-Inkrement) |
| `POST /api/cases/:caseId/sku-lines/:skuLineId/count` `{ confirmedQuantity?: number|null, correctedVkPrice?: number|null }` | Teil-Update je Größe: weggelassen = unangetastet (Stand anderer Beteiligter bleibt), null = zurücksetzen; mind. ein Feld |

Erweiterte DTOs: `CaseSummaryDto.collaboration: CaseCollaborationDto|null`
(`positionCount`, `confirmedPositionCount`, `participants: CaseParticipantDto[]` mit
`participantId, employeeNo, displayName, role, status, invitedAt, respondedAt, partDoneAt,
confirmedPositionCount`), `TodayResponseDto.sharedCases: CaseSummaryDto[]` (Belege, bei denen
ich aktiver Helfer bin), `ReceiptPositionDto.confirmedBy: { employeeNo, displayName }|null` +
`confirmedAt`, `SkuLineDto.correctedVkPrice`, `NextBundleResultDto.reason` um
`shared_case_open`. `CompleteDto/PartialCompleteDto.skuQuantities` enthalten nur noch die vom
Aufrufer **berührten** Größenzeilen; der Server mischt sie mit dem persistierten Stand.

### Teamlead (`@Roles(Teamlead, Admin)`)
| Endpunkt | Zweck |
|---|---|
| `POST /api/teamlead/cases/:caseId/collaboration` `{ employeeNos[] (≥2), reason }` | Gemeinsam zuweisen: Beleg (`ready|parked`, kein Bündel) in den Karren des ersten Mitarbeiters, alle als `angenommen` |
| `POST /api/teamlead/cases/:caseId/participants/:employeeNo/remove` `{ reason }` | Helfer entfernen (`entfernt`); Inhaber → 409 |

Erweiterte DTOs: `BoardCaseDto.sharedWith: BoardParticipantDto[]` (aktive Helfer:
`employeeNo, displayName, status`), `CaseDetailDto.participants: CaseParticipantDto[]`,
`RuleConfigDto.collaboration`.

### Audit-Events (neu in `workflowEventTypeSchema`)
`case.collaboration_started` (TL), `case.collaboration_invited`, `case.collaboration_accepted`,
`case.collaboration_declined`, `case.collaboration_part_done`,
`case.collaboration_participant_removed`, `case.collaboration_dissolved`; die bisher
ungenutzten `position.confirmed` und `sku.quantity_confirmed` werden jetzt tatsächlich
geschrieben (Payload: positionId/positionNo/confirmed bzw. skuLineId/confirmedQuantity/
correctedVkPrice, jeweils `employeeNo`).

---

## 8. Live-Kanal

Der SSE-Kanal wird typisiert und an **mehrere Empfänger** adressiert. Schema in
`@paket/domain-types` (`liveEventSchema`):

```ts
{ type: 'case.status' | 'position.confirmed' | 'sku.counted' | 'collaboration.invited' | 'collaboration.changed',
  recipients: string[],        // employeeNos; der Teamlead-Stream erhält alles
  caseId: string | null, status: string | null,
  actorEmployeeNo: string | null, positionId: string | null, at: ISO }
```

`GET /api/me/stream` filtert auf `recipients.includes(principal.employeeNo)`; Empfänger sind
Inhaber + aktive Beteiligte (bei Einladungen der Eingeladene). Der SSE-`event`-Name ist `type`
— die Clients registrieren `addEventListener` je Typ (Behebung: bisher lauschte die PWA nur auf
`onmessage`, das benannte Events nie erhält). Die PWA invalidiert gezielt und führt einen
Glow-Zustand je Beleg/Beteiligtem; das Cockpit bekommt erstmals einen SSE-Consumer
(`useCockpitLive` → `['cockpit']`). Einladungen sind immer persistiert und per REST abrufbar
(Polling 15 s) — Live beschleunigt nur.

---

## 9. Bewusst ausgeklammert

- Kein Web-Push/Service-Worker-Messaging: die Bildschirm-Benachrichtigung erscheint, solange
  die App offen ist (Polling + SSE).
- Keine Beteiligung am Bündel des Helfers (Kapazität/Last bleibt beim Inhaber); Leistung wird
  über ZST je Beteiligtem sichtbar.
- Keine Demo-Daten im Seed (Digest-Test); Zusammenarbeit wird live per Einladung erzeugt.
- Kein Zusammenführen von Aufteilen und Teilen: aufgeteilte Teil-Belege können ihrerseits
  geteilt werden — das ist dann ein normaler Beleg.

## 10. Offene Punkte (Kunde)
- E1 der Gap-Analyse (wer steuert: MA selbst oder TL) bleibt offen; das Feature bedient beide
  Wege, der Kunde entscheidet über die Admin-Regel und die Nutzung des Dialog-Modus.
- Anteilige Leistung: Verteilung nach geprüften Positionen ist eine Annahme, bis der Kunde
  eine andere Zurechnung wünscht.
