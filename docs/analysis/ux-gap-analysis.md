# UX-Gap-Analyse — IST-App vs. Konzept v1.5

**Scope:** `apps/employee-pwa` + `apps/teamlead-web` auf `master` (`5037ae0`) gegen Konzept §9 (Mitarbeiter-App), §10 (Teamlead-Dashboard), §11 (Admin/Konfig) sowie Anhang E.3–E.6 und G.3.
**Methode:** Statische Sichtung der Screen-/Komponentendateien (kein Laufzeit-Test). Reine Befundaufnahme — **keine Code-Änderung**.
**Datum:** 2026-06-15

> Lesehilfe Severity: **blockierend** = Konzept-Kernfluss fehlt/falsch · **wichtig** = im Konzept benannt, fehlt/unvollständig · **nice-to-have** = Politur oder bewusst descoped.

---

## (a) Executive Summary — Reifegrad je App

| App | Reifegrad | Kurzbewertung |
|-----|-----------|---------------|
| **Mitarbeiter-App** (employee-pwa) | **Hoch (≈ 85 %)** | Alle 8 Screens §9.2–9.9 vorhanden, task-first, große Touch-Buttons, Progressive Disclosure, Exception-first, Scan-first, verbindliche Abholreihenfolge, korrekte Sonderregeln (Mindest-Stückzahl trotz Prüfung=Nein, Druck-vor-Auspacken, Box-pro-Shopbereich). Lücken: Foto im Problem-Flow, Geräte-Problem-Button, Offline/Sync-Indikator (bewusst descoped), Login. |
| **Teamlead-Dashboard** (teamlead-web) | **Hoch (≈ 80 %)** | Cockpit, Digitale Ablagen (Lanes), Mitarbeiterboard, Belegdetails (7 Tabs), Simulation/Preview→Commit und Override-mit-Grund + Audit alle live am Backend und vorhanden. Lücken: zwei Cockpit-Aktionen fehlen, Export-Button tot, dedizierte Problem-Inbox fehlt, Dokumentvorschau noch deaktiviert (EPIC 3). |
| **Admin/Konfig** (Teil von teamlead-web) | **Mittel (≈ 60 %)** | Regelpflege Priorität/Reserve/Bündel/Aufwand editierbar; LocationMaster-Editor vollständig. Lücken: Verladeplan & Parser nur **lesend** (kein Editieren/Speichern), Regelbereich **Geräte/Arbeitsplätze** fehlt komplett. |

**Gesamtbild:** Der task-kritische Arbeitsfluss (Mitarbeiter pickt → bereitet vor → kontrolliert → boxt → schließt mit ZST ab; Teamlead steuert/überschreibt mit Grund) ist durchgängig umgesetzt. Die offenen Punkte sind überwiegend **Rand-/Ausnahme-Flows und Admin-Editierbarkeit**, kein Kernfluss-Blocker.

---

## (b) Screen-für-Screen-Matrix

### §9 Mitarbeiter-App

| Screen / Anforderung | Status | Befund | Fundstelle | Severity |
|---|---|---|---|---|
| **9.2 Tagesstart** | **TEILWEISE** | Begrüßung, Arbeitsplatz, geplante Zeit, „Aktuelles Paket: N Belege / ca. X Min", Abholreihenfolge, großer `Starten`-Button + Empty-/Skeleton-State. Fehlt: zweiter Button **„Problem mit Gerät melden"** (§9.2 explizit). | `screens/TagesstartScreen.tsx` | wichtig |
| **9.3 Paket + Abholreihenfolge** | **VORHANDEN** | Liste der Stops mit `sequenceIndex. Lagerplatz · WE … · Teile · Shopbereich`, Hinweis „Abholreihenfolge ist vorgegeben", Button `Abholung starten`. Per-Stop-Flags (Prio/Online) laufen nur über freies `note`-Feld, nicht als Chip. Überschrift „Paket 1 von 1" ist statisch (Single-Bundle-Annahme, konform zu „ein Bündel/MA/Tag"). | `screens/PaketReihenfolgeScreen.tsx` | nice-to-have |
| **9.4 Lagerplatzscan** | **TEILWEISE** | Scan-first via Keyboard-Wedge (`useScanner`) + `ScanField`-Fallback, sofortige Erfolgs-Quittung, `Paket gefunden`/`Paket nicht gefunden`. Gescannter Code wird **nicht gegen erwarteten Lagerplatz validiert** (kein Mismatch-Schutz, vgl. E.3 Fehlervermeidung). | `screens/LagerplatzScanScreen.tsx`, `scanner/useScanner.ts`, `scanner/ScanField.tsx` | wichtig |
| **9.5 Vorbereitung** | **VORHANDEN** | Anzeige Preisetikettendruck/Sortieren/Prüfmodus/Boxzettel/Sicherung; **Druck-vor-Auspacken erzwungen** (Primärbutton bleibt „Etiketten drucken" bis gedruckt, dann „Sortierung fertig"); Checkliste gespiegelt. | `screens/VorbereitungScreen.tsx` | — |
| **9.6 Position + SKU-Zeilen** | **VORHANDEN** | Eine Position je Screen (Progressive Disclosure), Artikel/Farbe/WGR/Shop/HShop/Etage, Aktionen (Etikett ✓/✕, Nicht sichern, Stückzahl prüfen), SKU-Zeilen (EAN/Größe/Menge). **Mindest-Stückzahlkontrolle wird auch bei Prüfung=Nein erzwungen** (`requiresQuantityCheck`, gated Primärbutton). | `screens/PositionScreen.tsx`, `workflow/workflowModel.ts` | — |
| **9.7 Problem melden** | **TEILWEISE** | Immer erreichbar (Exception-first über `StepScaffold`). Ebenen-Auswahl **Position/SKU/Box/Beleg** ✓, 7 Problemtypen ✓, Kommentar ✓, `An Teamlead senden` / `Restware weiter bearbeiten` ✓, Event `issue.created` ✓. Fehlt: **Foto-Upload** (nur Text „Foto: optional"); **Positionsnummer nicht vorbelegt/angezeigt** (Konzept zeigt „Position: 3"). | `screens/ProblemMeldenScreen.tsx` | wichtig |
| **9.8 Boxabschluss** | **VORHANDEN** | Box-für-Box: `Boxzettel drucken → verplomben → aufs Förderband`, je Box Status-Chips (Zettel/Plombe/Band) + Boxdaten (Shopbereich/Shop/HShop/Etage/Ware/Menge). **Box-Splitting** über mehrere `boxTargets` (eine Box je Shopbereich) abgebildet. | `screens/BoxabschlussScreen.tsx` | — |
| **9.9 Abschluss / ZST** | **VORHANDEN** | Fertige Menge X/Y, **Offene Probleme** (Live-Zählung aus Events), Boxzettel/Boxen, Completion-Gate, `ZST setzen und abschließen` (gesperrt bis Gate ok) + `Teilabschluss` mit Grund (§4.6). | `screens/AbschlussScreen.tsx` | — |

### §10 Teamlead-Dashboard

| Screen / Anforderung | Status | Befund | Fundstelle | Severity |
|---|---|---|---|---|
| **10.1 Tagescockpit** | **TEILWEISE** | Live-KPIs: Kapazität (geplante MA, Netto, Verplant, Reserve, Auslastung), Pool (offen/überfällig/Prio/CatMan/Probleme), ZST-Fortschritt + Balken, Audit-Trail. Aktionen vorhanden: `Neu berechnen`, `Zum Board`, `Export`. **Fehlt vs. §10.1-Buttonzeile:** `Starterpakete erzeugen` und `Reserve anpassen`. **`Export` ist ein toter Button (kein onClick).** | `features/cockpit/CockpitPage.tsx` | wichtig |
| **10.2 Digitale Ablagen** | **VORHANDEN** | Kanban-Lanes (Prio, Jeden-Tag, Verladeplan heute/morgen, Reserve, Geparkt, Prüfen, Problemfälle), Karten mit Status-/Prio-/Problem-Chips + Abschnitt, Aktionen Parken/Freigeben/Priorisieren mit **Grund-Dialog + Audit**; Parken nur aus legalen Zuständen. | `features/ablagen/AblagenBoard.tsx` | — |
| **10.3 Mitarbeitenden-Board** | **VORHANDEN** | Je Person: geplante Std., Auslastung, Aufwandspunkte, **schwer/leicht-Mix**, Issues, aktuelles Paket-Index/Größe, Pause. Aktionen Details/Entziehen/Hinzufügen/Reihenfolge (↑↓) speichern/Pause-Abwesenheit — alle **Grund + Audit**, optimistisch + Rollback. | `features/board/MitarbeiterBoard.tsx` | — |
| **10.4 Belegdetails** | **TEILWEISE** | Tabs Kopf/Priorität/Aufwand/**Positionen+SKU (Soll/Ist)**/Boxen/Historie/Dokumente; Priorisieren/Parken auditiert. **Originaldokumente: Link/Preview deaktiviert** (durchgestrichen, „Vorschau folgt (EPIC 3)") — §10.4 fordert Link/Preview. | `features/belege/BelegDetailPage.tsx` | wichtig (EPIC-3-abhängig) |
| **Belegliste (List-View)** | **VORHANDEN** | Dichte, filterbare TanStack-Tabelle, globaler Filter + **gespeicherte Views**, Row-Klick → Details (E.6 Teamlead-Dichte/Filter/Saved-Views). | `features/belege/BelegListPage.tsx`, `components/SavedViews.tsx` | — |
| **Simulation / „Neu berechnen"** | **TEILWEISE** | **Preview = echte Engine als Dry-Run** (`/assignments/preview`, persistiert nichts): Bündelzahl, zugewiesen/nicht zuteilbar, eiserne Reserve, Last je MA; `Live zuweisen` committet. Human-in-the-loop ✓, Engine-Dauer (ms) sichtbar ✓. Fehlt: **Delta zum Ist** (E.4 „zeigt Vorschlag, **Delta** und Auswirkungen") — nur Absolutwerte. | `features/simulation/SimulationPanel.tsx` | nice-to-have |
| **Override mit Grund** | **VORHANDEN** | Durchgängiger `ReasonDialog` + Audit-Trail im Cockpit (§8.4). Vorziehen/Parken/Entziehen/Neuverteilen alle mit Grund. | `components/ReasonDialog.tsx`, alle Feature-Seiten | — |

### §11 Admin- und Konfigurations-UX

| Anforderung | Status | Befund | Fundstelle | Severity |
|---|---|---|---|---|
| **11.1 Regelpflege — Priorität / Reserve / Bündel / Aufwand** | **VORHANDEN** | Editierbar mit Speichern: CatMan-Gewicht/Überfälligkeit/FIFO/manuelle Prio; Reserve-%/Min-Min; Bündel Min/Max/Max-Belege/Max-schwer; Aufwandsfaktoren (Etikett/Sicherung/Online/Rotpreis/Prüfanteil/Box-Splitting). | `features/admin/AdminPage.tsx` | — |
| **11.1 Regelpflege — Verladeplan** | **TEILWEISE** | Nur **Anzeige** (Liste), **kein Editieren/Speichern**. | `features/admin/AdminPage.tsx` (tab 4) | wichtig |
| **11.1 Regelpflege — Parser** | **TEILWEISE** | Nur **Anzeige** (Templates/Pflichtfelder/Schwelle/Fallback), **kein Editieren/Speichern**. | `features/admin/AdminPage.tsx` (tab 5) | wichtig |
| **11.1 Regelpflege — Geräte/Arbeitsplätze** | **FEHLT** | Regelbereich (Tische/Scanner/Drucker/Arbeitsplatzstandort für Routenstart) **nicht vorhanden**. | — | wichtig |
| **11.2 Lagerplatzmodell** | **VORHANDEN** | Vollständiger LocationMaster-Editor: Code/Bezeichnung/Art/Zone/Sortier-Index/Aktiv, Add/Delete/Save — entspricht dem einfachen MVP-Modell (kein Routing-Graph). | `features/admin/LocationMasterEditor.tsx` | — |

---

## (c) Top-Lücken priorisiert nach Severity

### Blockierend
Keine. Der Konzept-Kernfluss (§9.2–9.9 Mitarbeiter und §10.1–10.4 Teamlead inkl. Simulation/Override) ist durchgängig vorhanden.

### Wichtig
1. **Admin: Verladeplan & Parser nur lesend, Geräte/Arbeitsplätze fehlen** (§11.1). Drei der sieben Regelbereiche sind nicht pflegbar — Regelpflege ist damit unvollständig.
2. **Cockpit-Aktionen `Starterpakete erzeugen` & `Reserve anpassen` fehlen; `Export` ist tot** (§10.1). Die im Konzept gezeigte Aktionszeile ist nur zur Hälfte funktional.
3. **Problem melden ohne Foto + ohne Positions-Kontext** (§9.7). Foto ist nur Text-Platzhalter; Positionsnummer wird nicht vorbelegt/angezeigt, obwohl der Auslöser die aktuelle Position kennt.
4. **Belegdetails: Originaldokumente nicht öffenbar** (§10.4) — Link/Preview deaktiviert (EPIC-3-abhängig, daher bewusst offen).
5. **Lagerplatzscan ohne Soll/Ist-Abgleich** (§9.4 / E.3 Fehlervermeidung). Jeder Scan wird akzeptiert; falscher Lagerplatz wird nicht erkannt.
6. **Tagesstart ohne „Problem mit Gerät melden"** (§9.2).
7. **Keine dedizierte Problem-Inbox** (E.4). Probleme erscheinen als Ablagen-Lane + Pool-KPI, aber nicht als nach Alter/Schwere/blockiertem Umfang/MA sortierte Triage-Queue mit eskalieren/korrigieren.

### Nice-to-have / bewusst descoped
8. **Offline/Sync-Confidence-Indikator fehlt** (E.3 „Sync-Status klar sichtbar"). Das Offline-/Outbox-Subsystem wurde bewusst entfernt; `SyncChip` existiert in `@paket/ui`, wird aber nirgends genutzt. Bei reinem Online-Pilot vertretbar — sonst Re-Scope nötig.
9. **Simulation zeigt kein Delta zum Ist** (E.4) — nur Absolutwerte des Vorschlags.
10. **Mitarbeiter-Top-Level-Nav** (E.6: Start/Paket, Probleme, Verlauf/Profil) — nur flaches Routing, keine Probleme-/Verlauf-/Profil-Ansicht in der Mitarbeiter-App.
11. **Status-Chips in der Mitarbeiter-App** — die WCAG-konformen `@paket/ui`-Chips (Farbe+Icon+Text) werden teamleadseitig genutzt, im Boxabschluss aber durch einfache MUI-`Chip` (Farbe+Text, **ohne Icon**) ersetzt.
12. **Kein Login/Anmeldung** in der Mitarbeiter-App — Session fällt fest auf `ma-101` zurück (`data/session.ts`). Im Konzept §9 nicht als eigener Screen geführt; für Pilot dennoch relevant.

---

## (d) UX-Prinzip-Verstöße (Anhang E)

| Prinzip (E.3/E.4/E.6) | Umsetzung | Befund |
|---|---|---|
| **Task-first statt Dokument-first** (E.3) | ✅ erfüllt | Tagesstart zeigt genau ein Paket + nächste Aktion; PDF nur als (noch deaktivierter) Hintergrund-Link. |
| **Scan-first** (E.3) | ⚠️ teilweise | Wedge-Scan + Tastatur-Fallback vorhanden; aber **kein Soll/Ist-Abgleich** des gescannten Codes. |
| **Next Best Action** (E.3) | ✅ erfüllt | Genau ein großer Primärbutton je Screen (`TouchButton`, `StepScaffold`). |
| **Progressive Disclosure** (E.3) | ✅ erfüllt | Paket→Vorbereitung→Position(je 1)→Box, keine Überladung. |
| **Exception-first** (E.3) | ⚠️ teilweise | „Problem melden" immer sichtbar ✓; aber Foto + Positions-Kontext fehlen; Geräte-Problem auf Tagesstart fehlt. |
| **Offline confidence** (E.3) | ❌ nicht erfüllt | Kein Offline-/Sync-Statusbanner (Subsystem descoped). |
| **Abholreihenfolge ohne Denken** (E.3) | ✅ erfüllt | Reihenfolge vorgegeben, verbindlich, Scan-getrieben. |
| **Fehlervermeidung** (E.3) | ⚠️ teilweise | Große Targets ✓, Pflichtfelder ✓; Undo/Bestätigung nur bei Teilabschluss; kein Scan-Mismatch-Schutz; ZST-Abschluss ohne explizite Bestätigung. |
| **Operations cockpit / Kanban-Lanes / Dispatch-Board** (E.4) | ✅ erfüllt | Cockpit, Ablagen-Lanes, Mitarbeiterboard vorhanden. |
| **Human-in-the-loop Simulation** (E.4) | ⚠️ teilweise | Preview→Commit ✓; aber **kein Delta** zum Ist. |
| **Override mit Grund** (E.4) | ✅ erfüllt | Grund-Dialog + Audit überall. |
| **Problem-Inbox / Exception-Triage** (E.4) | ⚠️ teilweise | Als Lane/KPI vorhanden, aber keine sortierte Inbox (Alter/Schwere/Umfang/MA). |
| **Design-System: Statuschips Farbe + Text/Icon** (E.6) | ⚠️ teilweise | `@paket/ui` erfüllt die Regel exakt (Farbe+Icon+Text, WCAG); Mitarbeiter-App nutzt sie stellenweise nicht. |
| **Design-System: große Touch-Buttons / kritische Aktion mit Bestätigung** (E.6) | ✅ weitgehend | Große Buttons ✓; Bestätigung nur teilweise (s. Fehlervermeidung). |
| **Design-System: Top-Level-Nav max. Start/Probleme/Verlauf** (E.6) | ⚠️ teilweise | Flache Navigation, aber keine Probleme-/Verlauf-/Profil-Ansicht in der Mitarbeiter-App. |
| **E.5 Performance-Ziele** | ➖ nicht messbar (statisch) | Skeletons/lokale Scan-Rückmeldung vorbereitet; `<3s`/`<300ms`/`<5s` nur zur Laufzeit prüfbar. Engine-Dauer (ms) wird im Preview angezeigt. |

---

## (e) Konkrete, schlanke Empfehlungen (Minimum, kein Scope-Ausbau)

**Mitarbeiter-App**
1. **Geräte-Problem-Button** auf Tagesstart ergänzen (kann auf den bestehenden Problem-Flow mit `scope='case'` zeigen) — §9.2.
2. **Problem melden:** Positionsnummer aus dem Aufruf-Kontext vorbelegen/anzeigen und einen einfachen Foto-Anhang (Datei/Capture) zulassen — §9.7. (Foto-Speicherung als optionales Feld; kein neuer Service nötig.)
3. **Scan-Mismatch-Hinweis:** gescannten Code gegen `storageLocation.code` prüfen und bei Abweichung warnen statt blind zu bestätigen — §9.4/E.3.
4. *(Optional)* Im Boxabschluss die `@paket/ui`-Status-Chips statt nackter MUI-`Chip` verwenden (Icon-Konsistenz, E.6).

**Teamlead**
5. **Cockpit:** `Export` verdrahten **oder** ausblenden; `Starterpakete erzeugen` und `Reserve anpassen` ergänzen (Reserve kann den bestehenden Admin-Reserve-Regeldialog/Recalc wiederverwenden) — §10.1.
6. **Problem-Inbox:** bestehende „Problemfälle"-Lane um Sortierung nach Alter/Schwere/blockiertem Umfang + Aktionen (freigeben/korrigieren/eskalieren) erweitern — E.4. (Datengrundlage existiert bereits.)
7. *(Optional)* Simulation um eine Delta-Spalte „Ist → Vorschlag" ergänzen — E.4.
8. **Belegdetails-Dokumente:** als bekannte EPIC-3-Abhängigkeit markieren (Status-Hinweis statt durchgestrichenem Dead-Link) — §10.4.

**Admin**
9. **Verladeplan & Parser editierbar machen** (gleiches Draft/Save-Muster wie die anderen Tabs) — §11.1.
10. **Regelbereich Geräte/Arbeitsplätze** als einfache Liste (Tisch/Scanner/Drucker/Standort) ergänzen — §11.1. Analog zum LocationMaster-Editor umsetzbar.

**Bewusste Entscheidung dokumentieren**
11. **Offline-Confidence (E.3)** ist derzeit nicht erfüllt. Empfehlung: explizit als „Online-only-Pilot" festschreiben **oder** den vorhandenen `SyncChip` minimal als Online/Offline-Banner aktivieren — kein vollständiges Outbox-Subsystem nötig.
12. **Login** für den Pilot festlegen (fester Single-User vs. einfache MA-Auswahl) — `data/session.ts`.

---

*Befund-Report, Stand `5037ae0`. Keine Code-Änderungen vorgenommen.*
