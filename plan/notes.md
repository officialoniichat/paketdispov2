# Notes: Dustin Feedback v2 Review — Completeness Matrix (source-derived)

Verdicts: DONE / PARTIAL / MISSING / WRONG / OPEN-QUESTION (code can't answer)

## Mitarbeiterapp (UX PDF, 03.07. 8:36)
- M1 Demo-Szenario-Picker für MAs unsichtbar ("könnte gestrichen werden, weil die MAs das nicht sehen müssen")
- M2 Demo-Set Mischung Regal/Hängebahn/Paletten ("Vorschlag: Immer eine Mischung")
- M3 "Dein Karren. 3 Belege . Regal" — Kopfzeile/Regal streichen
- M4 Arbeitsplatz am Mitarbeiter in Admin-Tools; Dummy flexibel an Tisch
- M5 Log-In: Tisch-Nr eingeben oder Barcode scannen
- M6 Blau markierte Stats ("0 von 3 fertig · ca. 34 Min", "Heute erledigt") ausgeblendet
- M7 "Guten Morgen" passt sich Tageszeit an
- M8 Wording "Sammeln" → "Ware holen"
- M9 Ein-Screen-Flow: kein separates Sammel-Fenster, Abhaken inline unter Punkt 1
- M10 Etiketten-Info direkt beim Holen; wenn nicht nötig, steht nichts
- M11 Parkposition: Stopp nach 3-4 Belegen, Rest parkt → nächstes Bündel / später holen
- M12 Teile-Anzahl nur bei Hängeware (nicht Paletten/Regal)
- M13 Icons je Lagerplatz-Art (Regal/Palette/Kleiderbügel), definierbar über Lagerplätze
- M14 "Weiter · WE XY" → "Start Bearbeitung WE XY"
- M15 Lagerplatz 1:1 aus der Arbeitsanweisung
- M16 NOS/EB-Abschnittsbezeichnung in Schritt 2, keine Empfehlung, MA entscheidet Reihenfolge
- M17 WE Beleg-Nr. größer
- M18 "Beleg Bearbeiten" Titel gestrichen
- M19 Anzahl Kartons zum WE-Beleg angezeigt
- M20 "Wie viele Positionen" gestrichen
- M21 "Abschnitt 1 etc." weg, Bezeichnung "Vororder"/"Nachorder" bleibt
- M22 Anzahl Teile bleibt
- M23 Arbeitsanweisung: Reihenfolge (2=Prüfung erklärt, 3→Pos.5, 4=Rotpreis, 5=Boxzettel); Prüfstufen erklärt (Nein ≠ nichts geprüft)
- M24 Preisetikettendruck-Schritt gestrichen (§G.2 gate weg, kein toter Code)
- M25 "Karton öffnen"-Schritt gestrichen
- M26 Preisetikett wo anbringen: Positionsebene mit Sicherungsetikett-Piktogramm (Server)
- M27 Positionen: EAN, Größe, EK, VK, VK-Etikett, Menge je Position
- M28 "Stattdessen ganzer Beleg" auf Positionsebene weg
- M29 Mehr-/Mindermengen pro Größe +/- neben EAN
- M30 "Wo ist das Problem" weg
- M31 Kommentar bleibt
- M32 Restware-Button geklärt (warum, wenn nach "An Teamlead senden" weiterbearbeitet werden kann)
- M33 Farbe gleiche Schriftgröße wie Artikel-Nr.
- M34 Artikel-Nr. unter Pos 1
- M35 Shop ergänzen
- M36 WGR mit Beschreibung (z.B. 218110 D-Bermuda)
- M37 Catman ergänzen
- M38 Online-Größen CSV rot/grün + Fallback (WGR-Ebene/Größenvariante → Alternativgröße → irgendeine)
- M39 Sicherungstyp als Bild (aus ERP)
- M40 "Mindestmenge geprüft" → "Position geprüft"
- M41 Checkbox rückgängig machbar
- M42 Teilabschluss erklärt, nicht als "Fertig" dargestellt
- M43 Belege parken möglich
- M44 Hängeware: keine Wegeoptimierung

## Dashboard/Admin (docx)
- D1 Schichtende: Autostopp 50 min, Packs auflösen → Pool
- D2 Schichtplan MSP: nur Stammmannschaft, Azubis über Dummys
- D3 Verschiedene Startzeiten/kein Vollzeit (supported)
- D4 Zeiten bei Dummys hinterlegbar
- D5 "Bereich kann weg" (Schichtplan-Ansicht)
- D6 Skill-Gewichtung Profi/??/??/Starter/Dummy — gating auto-distribution
- D7 Digi-Tags bleiben? (OPEN QUESTION)
- D8 Lagerplätze: Intention erklärt / evtl. nicht benötigt (chaotische Lagerhaltung, nicht wegeoptimiert)
- D9 Verladeplan: erklären; Sonderregelungen Feiertag DO → MI vorziehen (specialDay in resolveLoadPlanDate)
- D10 Lieferungen: Regeln erklären; Brax-Fall (Lieferscheine nicht fortlaufend, Kartons fortlaufend abgeklebt)
- D11 Hinweis in Belege-Ansicht bei zusammengehörenden Belegen
- D12 Pool-Hold: Gruppe wartet bis alle gebucht oder TL-Release
- D13 Aufwand: laut Dustin nicht benötigt — USER STEER: Modell bleibt (nur Pack-Sizing Teile-basiert prüfen)
- D14 Starter-Pack 200-250 Teile, Folge-Packs 80-90 Teile, selbständig anfordern
- D15 Schichtende: nicht geschaffte (nicht gestartete) Belege → Pool
- D16 Angefangene Belege NIE zurück in Pool
- D17 Frage Cherry-Picking bei eigenverantwortlichem Pull (dokumentiert/beantwortet)
- D18 schwer/leicht Gewichtung weg (nur Koffer schwer)
- D19 Kein Max-Belege/Bündel-Cap (Shop 31 NOS)
- D20 Bündel nach Menge packen
- D21 Min/Max Minuten → min/max Teile, GEWIRED in engineConfig (nicht dead config)
- D22 Groß-Belege 2-3000 Teile: manuelle TL-Entscheidung ab Schwelle + Folgetag-Sperre
- D23 Überfälligkeitsvorlauf streichen (ohne Reste)
- D24 Prio-Leiter: tägl. Verladung + EB7 + Shop120 + Shop90 vor NOS; dann NOS+Hängeware; dann Verladeplan
- D25 Belege: Shop/Filiale/Etiketten ja-nein/Buchungsdatum/gehört-zusammen Spalten + per-Spalte Filter + sortierbar
- D26 Mehrere Shops/Filialen auf einem Beleg — Darstellung (question, answered?)
- D27 Archivierung ab wann / wie lange (answered/documented)
- D28 DocuWare-Verbindung (Mock-Link)
- D29 Ansicht: wem zugeordnet + welche Bündel als nächstes vorbereitet
- D30 Topf für Bucherinnen → TL ordnet zu
- D31 Board: WE-Nr Texteingabe + Plausibilitätsprüfung statt Dropdown
- D32 Grund kein Pflichtfeld
- D33 Teile-Menge anzeigen
- D34 Admin-Self-Assign
- D35 Zuweisen auch über Reiter "Belege"
- D36 Ablage horizontal ohne runterscrollen
- D37 Felder verschiebbar + letzte Ansicht speichern
- D38 Geparkt erklärt
- D39 Problem bei Details sofort erkennbar
- D40 Weiterleitung Retouren/Lieferscheinbucher
- D41 Wie kommen gebuchte Belege ins System → ProHandel-Mock pull end-to-end
- D42 HH-Versand unbearbeiteter Ware (OPEN QUESTION)
- D43 Datenqualitäts-Gate: fehlender Lagerplatz/Lieferschein → zurück an Bucher, nie ready
- D44 Datenaktualisierungs-Frequenz beantwortet/dokumentiert
- D45 Eingetragene Daten bleiben bis Go-Live (answered/documented)

## Agent findings
(pending)

## Agent 1 (PWA M1-M44): ALL DONE
- M1-M43 DONE with file:line evidence (see agent output tasks/a52ba...output if needed).
- M44 DONE-with-note: engine has NO route optimization (pickup-order.ts:13-20 explicit); Hängeware gets same deterministic type+number sort as all stops. Satisfies "keine Wegeoptimierung nötig"; note in report.
- Dead code sweep clean (no CollectScreen/LabelPlacementHint/printedLabels/§G.2 gate; db.ts:44 doc comment only).
- Key evidence: demo picker VITE_DEMO_CONTROLS (api.ts:30); one-screen flow BundleHomeScreen.tsx:191-312; park cases.service.ts:182-222 (assigned-only → started never back); CSV online sizes deriveOnlineSizeMarks erp-catalog.ts:122-141 server-side.

## Agent 2 (Cockpit D25-D40 etc): mostly DONE
- DONE: D25 (minor: Etiketten filter-only nicht sortierbar; Lieferung-Spalte ohne Filter/Sort), D26, D28, D29, D30, D31, D32, D33, D34 (caveat TL principal muss aktiver Employee sein), D35, D36, D37 (localStorage), D38, D39, D40, D11, D5, D8, D9-ui, D10-ui, D13-ui intakt, D21-ui, D6-ui.
- D27 PARTIAL: "wann archiviert" beantwortet (completed/zst_done + DocuWare-Hinweis); "wie lange" = OP-25 offen.
- D12-ui WAR MISSING: release endpoint ohne Frontend-Caller → FIXED (DeliveryGroupPanel "Trotzdem bearbeiten" + released im DTO/Typ).

## Agent 3 (Engine/Backend): wired, mit Funden
- D1 DONE (50min default admin-config.ts:233; dissolution via clearPriorPlanForTag bei recalculate — kein Wanduhr-Job, Hinweis). Stale "default 120" Kommentare → FIXED.
- D6 DONE (profi/fortgeschritten/basis auto; starter/dummy nur manuell; plan.ts:111 + service:204).
- D9 DONE (specialDay in resolveLoadPlanDate). D10 PARTIAL: kein Kartonnummern-Trigger; WE-Run = Proxy → Explainer präzisiert + Open Question. D12 backend DONE.
- D14/20/21 DONE Teile-Packs gewired; kein maxCasesPerBundle/maxHeavyCases. Frontend-Remnant schwer/leicht Board → FIXED (entfernt).
- D15/D16 DONE. D22 PARTIAL-ok (Folgetag-Sperre status-basiert via partially_completed, nicht kalendarisch). D23 DONE clean. D24 DONE (Rank-Reihenfolge korrekt).
- D41 DONE end-to-end. D43 DONE (blocked, zurück an Bucher). D44/D45 MISSING → im Review-Doc beantworten.
- Effort/Aufwand-Modell intakt (computeEffort/EffortPreview live).

## Quality gate
- typecheck 13/13 ✓ (nach Fixes), build ✓, lint 0 errors/43 pre-existing warnings ✓, engine 163→164 ✓, backend unit 130 ✓, monorepo test 13/13 ✓.
- OpenAPI regen: no diff (pre-fix); after released-field: regenerated + api-client synced.
- Dead-config grep: overdueLeadDays/overdueThresholdHours/catManWeight/maxCasesPerBundle/maxHeavyCases clean (nur "gestrichen"-Doku).
- test:int 17 failed/65 passed: 16 = pre-existing rot family (Seeds ohne weeklyPattern → materializeShiftsForDate löscht Shifts: capacity/events/lifecycle/manual-overrides/preview). 1 NEU: board.int (T3-Hold auf WE-BOARD-0..5 Run) → FIXED (Seed i*100), board 3/3 grün.
- BUG gefunden+gefixt: deliveryGroupReleased wurde in plan.ts + 3 read-service Gruppierungs-Inputs NICHT durchgereicht → TL-Release hob den Pool-Hold nie auf. Fix + plan.test Regression (12/12 grün).
- C4: domain-model.mmd aktuell (skillTier/workstation/blocked/deliveryGroupReleased vorhanden).

## Fixes applied (to commit)
1. fix(engine+api): deliveryGroupReleased durchgereicht (plan.ts, teamlead-read x3 selects+inputs) + regression test
2. feat(cockpit): DeliveryGroupPanel "Trotzdem bearbeiten" + released end-to-end (DTO/mapper/OpenAPI/api-client/types/belege.ts)
3. refactor(cockpit): schwer/leicht Board-Remnant entfernt (D18)
4. docs/comments: default-120→50, Vorlauf-Kommentar, Lieferungen-Explainer Kartonnummern-Näherung
5. test(int): board seed non-consecutive
