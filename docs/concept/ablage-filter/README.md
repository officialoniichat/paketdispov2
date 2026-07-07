# Digitale Ablagen — Filter/Segmentierung (Konzept-Spike)

Status: **Konzept only, kein Build.** Grundlage für die Entscheidung, bevor ein Implementierungs-Task
aufgesetzt wird. Kein App-Code, keine DTOs, keine Diagramme wurden angefasst.

## 1. Ausgangslage

`apps/teamlead-web/src/features/ablagen/AblagenBoard.tsx` zeigt heute acht fest verdrahtete Lanes
(`Problemfälle, Weitergeleitet, Geparkt, Prio, Verladeplan heute/morgen, Jeden-Tag, Sonstige` —
`LaneId` in `src/data/types.ts`). Reihenfolge und Einklappen sind pro Lane konfigurierbar (C2,
persistiert unter `paket.view.ablagen`), aber es gibt **keinerlei Filterung**: Wer aktuell nach einem
Bereich, einer Filiale oder „alles was noch unzugewiesen ist" schauen will, muss jede Lane visuell
scannen.

Gleichzeitig ist am `LaneCard`-Modell (und in parallel laufenden Tasks) schon einiges an
Segmentierungspotenzial vorhanden oder absehbar:

| Dimension | Quelle heute | Status |
|---|---|---|
| Bereich | `LaneCard.bereich` | vorhanden |
| Warenart | `LaneCard.goodsTypeText` | vorhanden |
| Prio-Flags (Prio/Überfällig/CatMan/Heute/TL-Prio) | `LaneCard.priorityFlags` | vorhanden |
| Lieferungs-Gruppe | `LaneCard.deliveryGroup` | vorhanden |
| Zugewiesen/frei | `LaneCard.assignedTo` (null = frei) | vorhanden, aber **kein Filter/Gruppierungs-Dimension** — siehe §5b |
| Teile-Anzahl | `LaneCard.totalQuantity` | vorhanden |
| Besondere Aufmerksamkeit | `LaneCard.attentionFlag` / `.attentionNote` | vorhanden |
| Offenes Problem / „braucht Entscheidung" | `LaneCard.openIssue`, `.issueStatus`, Status `blocked`/`issue_open`/`needs_review` | vorhanden (kombiniert aus mehreren Feldern) |
| Shop/Filiale | — | **fehlt auf `LaneCard`**, müsste aus `GoodsReceiptCase`/Beleg-Kopf durchgereicht werden |
| Skill-Tier des zugeteilten MA | — | **fehlt**, lebt aktuell nur am Employee-Objekt |
| Zurück-an-Bucher / Datenqualität | teilweise über Status `blocked` sichtbar, aber kein eigenes Flag | **teilweise** |
| Pool-Hold | nicht auf `LaneCard` | **fehlt** |
| Buchungsdatum | nicht auf `LaneCard` | **fehlt** |

→ Genug ist heute schon da, um einen ersten, wertvollen Filter-Layer zu bauen; ein paar Dimensionen
(Shop/Filiale, Skill-Tier, Pool-Hold, Buchungsdatum) brauchen zuerst eine kleine DTO-Erweiterung, sind
aber nicht blockierend für das UI-Konzept.

## 2. Was der Teamlead tatsächlich braucht

Aus den Aufgaben der letzten Wochen (Bereiche/Skills pro Mitarbeiter, Shop/Filiale-Herkunft,
Lieferungs-Gruppen, Skill-Tiers, Datenqualitäts-Fälle, Pool-Hold) lassen sich drei wiederkehrende
Fragen ableiten, die der TL an das Board stellt:

1. **„Zeig mir nur X"** — eine Teilmenge sehen, unabhängig davon, in welcher Lane sie steckt
   (z. B. „nur Bereich Kühlware", „nur Filiale 042", „nur unzugewiesen", „nur >50 Teile").
2. **„Zeig mir, was JETZT eine Entscheidung braucht"** — ein Querschnitt über Status hinweg:
   offene Probleme, Zurück-an-Bucher, Pool-Hold, Besondere Aufmerksamkeit. Das ist heute auf drei
   Lanes verteilt (Problemfälle, Geparkt, plus versteckt im `attentionFlag`).
3. **„Gruppier mir das anders als nach Status"** — z. B. alle Belege eines Tages nach Filiale oder
   nach zugeteiltem Mitarbeiter clustern, um Lastverteilung zu beurteilen.

Frage 1 und 2 sind **Filterung** (Teilmenge der immer gleichen Lane-Struktur). Frage 3 ist
**Re-Gruppierung** (die Lane-Achse selbst wechselt von Status auf eine andere Dimension).

## 3. Zwei Kombinationsmodelle

### Modell A — Globale Filterleiste + Quick-Chips (Lanes bleiben Status-Lanes)

Eine Filterleiste über dem Lane-Streifen filtert **innerhalb** jeder Lane: Karten, die nicht passen,
werden ausgeblendet; die Lane-Struktur (Status/Workflow) bleibt unverändert sichtbar. Zusätzlich gibt
es 3–4 Ein-Klick-Quick-Chips für die häufigsten Fragen aus Abschnitt 2 (`Frei`, `Braucht Entscheidung`,
`Prio`, `Meine Filiale`).

- **Vorteil:** Die Lane-Achse transportiert Fachlogik (§7.1-Status-Workflow) — das bleibt unangetastet.
  Ein TL verliert nie den Überblick über *wo im Prozess* ein Beleg steht, nur weil er nach Bereich
  filtert.
- **Vorteil:** Additiv zum bestehenden C1–C5-Modell, keine Konkurrenz zum Lane-Konzept.
- **Nachteil:** Beantwortet Frage 3 (Re-Gruppierung) nicht direkt — man sieht z. B. nicht auf einen
  Blick „wie viele Teile pro Filiale liegen heute an".

### Modell B — Re-Gruppierung nach wählbarer Dimension (Lanes werden dynamisch)

Ein Dimensions-Switch ersetzt die Status-Lanes durch Gruppen einer gewählten Achse (Bereich, Filiale,
Zugeteilter Mitarbeiter, Lieferungs-Gruppe). Der Status wird dann nur noch als Chip auf der Karte
angezeigt, nicht mehr als Lane-Grenze.

- **Vorteil:** Beantwortet Frage 3 direkt, gut für Lastverteilungs-Reviews.
- **Nachteil:** Verdeckt Fachlogik-Zustand: Problemfälle, Geparkt und Weitergeleitet sind
  Sonderzustände mit eigener Aktions-Semantik (`CaseActionMenu`, Parked-Tooltip C3, Weiterleiten-Gruppen
  C5) — wenn die Lane-Achse wechselt, muss diese Semantik pro Karte neu codiert werden (z. B. als Icon
  statt als Lane-Zugehörigkeit), sonst gehen Problemfälle/Geparkt in der neuen Gruppierung unter.
- **Nachteil:** Größerer Eingriff in die bestehende Lane-Logik (`groupByRecipient`, Parked-Kontext,
  Aktions-Menü-Kontext sind heute an `laneId` gekoppelt).

## 4. Empfehlung

**Modell A als Primärlösung**, ergänzt um eine leichte Form von Modell B als *Sub-Gruppierung
innerhalb einer Lane* (nicht als Ersatz der Lane-Achse):

- Die globale Filterleiste + Quick-Chips deckt die zwei häufigsten TL-Fragen ab (Teilmenge sehen,
  Entscheidungs-Fälle sehen), ohne die Fachlogik-tragende Lane-Struktur zu gefährden.
- Für Frage 3 reicht ein **„Gruppieren innerhalb der Lane nach: Bereich / Filiale / Mitarbeiter"**
  Dropdown, das nur die vorhandene `groupByRecipient`-artige Sub-Header-Logik (siehe
  `weitergeleitet`-Lane heute) auf beliebige Lanes verallgemeinert — ohne dass eine Lane ihre
  Fachlogik-Bedeutung verliert. Das ist ein deutlich kleinerer Eingriff als ein volles Re-Grouping und
  passt zum bereits bestehenden Gruppierungs-Muster im Code.
- Modell B in seiner vollen Form (Lane-Achse komplett tauschen) wird **nicht empfohlen** für diesen
  Board-Typ; wenn eine reine Lastverteilungs-Sicht nach Filiale/Mitarbeiter gebraucht wird, ist das
  eher eine eigene Auswertungsansicht (z. B. Tabellen-/Report-Ansicht) als ein Umbau des Kanban-Boards.

Beide Mockups unten sind trotzdem gebaut, um die beiden Richtungen visuell vergleichbar zu machen —
Mockup A ist der empfohlene Weg, Mockup B zeigt die Alternative konkret genug, um sie bewusst zu
verwerfen oder als spätere Zusatz-Ansicht zu planen.

## 5. Interaktionsdetails (Modell A)

- **Ort:** Sticky Filterleiste direkt unter der Seitenüberschrift „Digitale Ablagen", oberhalb des
  horizontal scrollenden Lane-Streifens. Bleibt beim horizontalen Scrollen der Lanes stehen.
- **Quick-Chips** (immer sichtbar, Mehrfachauswahl, toggle):
  `Frei` (kein `assignedTo`) · `Braucht Entscheidung` (offenes Problem, `blocked`, Pool-Hold, oder
  `attentionFlag`) · `Prio` (`priorityFlags` enthält `prio`/`overdue`/`same_day_required`) ·
  `Meine Filiale` (sobald Shop/Filiale am Modell existiert).
- **„Weitere Filter"-Popover:** Bereich (Mehrfachauswahl aus fixem Bereichs-Vokabular, siehe
  [[bereich-design]]), Warenart, Lieferungs-Gruppe (ja/nein), Teile-Range (Slider/Min-Max), Filiale
  (sobald verfügbar), Skill-Tier (sobald verfügbar).
- **Aktive-Filter-Zeile:** Zusammenfassung als entfernbare Chips direkt unter der Filterleiste
  („Bereich: Kühlware ✕", „Frei ✕" …) + „Alle zurücksetzen".
- **Lane-Verhalten unter Filter:** Kartenzahl im Lane-Header zeigt gefilterte/gesamt (z. B. „3/12"),
  wenn ein Filter aktiv ist. Leere Lane wegen Filter zeigt „Kein Treffer für aktuelle Filter" statt dem
  generischen „Leer.", damit TL nicht denkt, die Lane sei tatsächlich leer.
  „Alle Filter zurücksetzen" ist prominent erreichbar, sobald mindestens ein Filter aktiv ist.
- **Sub-Gruppierung (leichte Modell-B-Ergänzung):** Ein kompaktes Dropdown „Gruppieren nach" pro Lane
  (Default: keine Gruppierung / Status quo), Optionen: Bereich, Filiale, Zugeteilter Mitarbeiter —
  rendert Sub-Header wie heute schon bei `weitergeleitet` (`groupByRecipient`), nur generisch.
- **Gespeicherte Sicht:** Der aktive Filter- + Gruppierungs-Zustand wird in die bestehende
  `AblagenViewState` (persistiert unter `paket.view.ablagen`) aufgenommen — genau wie `laneOrder` und
  `collapsed` heute schon. Zusätzlich 1–2 benannte Presets pro Nutzer („Meine Standardsicht" speichern/
  laden), damit ein TL nicht jeden Morgen neu filtert.

## 5a. Filter-Ausnahme für Problemfälle/Geparkt/Weitergeleitet (umgesetzt)

Diese drei Lanes sind bereits kleine Ausnahme-/Triage-Queues — ihr ganzer Zweck ist, dass nichts darin
übersehen wird. Ein zufälliger Bereichs-/Warenart-/Teile-Filter, der genau den einen Problemfall
außerhalb des aktuellen Filters versteckt, würde diesen Zweck aushebeln. Deshalb ignorieren diese drei
Lanes alle einschränkenden Filter (Bereich, Warenart, Lieferungs-Gruppe, Teile-Range, „Prio",
„Braucht Entscheidung") vollständig und zeigen immer 100 % ihrer Karten — nur die Freitextsuche bleibt
aktiv (Suche ist ein „Finden", kein „Einschränken", und ist auch in kleinen Lanes nützlich). Umgesetzt
in `ablagenFilters.ts` (`isFilterExemptLane` / `filterLaneCardsForLane`).

## 5b. „Frei"-Filter und „Zugeteilter Mitarbeiter"-Gruppierung entfernt

Ursprünglich geplant, aber wieder entfernt, nachdem sich am echten Bucketing gezeigt hat, dass sie nie
etwas verändern können: `laneForPoolItem`/`isPoolResident` (`remoteDataset.ts`) lassen `assignedTo` nur
in genau den zwei Lanes ungleich `null` werden, die bereits filter-exempt sind (§5a) — Problemfälle
(ein Beleg kann `issue_open` werden, während er noch an ein Bündel/einen Mitarbeiter gebunden ist) und
Weitergeleitet (Weiterleiten ist status-neutral, ein bereits zugeteilter Beleg kann weitergeleitet
werden). Alle fünf „Arbeits-Lanes" (Prio/Jeden-Tag/Verladeplan-\*/Sonstige) enthalten laut
`POOL_LANE_STATUSES` nur `ready`/`parked`-Belege ohne Zuteilung — dort ist `assignedTo` strukturell
immer `null`. Ein „Frei"-Quick-Chip oder eine „Zugeteilter Mitarbeiter"-Gruppierung hätte also entweder
gar keinen Effekt (in den Arbeits-Lanes) oder gar keine Wirkung, weil die einzigen Lanes mit variablem
`assignedTo` vom Filtern ausgenommen sind — tote UI, die nur Verwirrung stiftet. Entfernt statt behalten;
`assignedTo` bleibt weiterhin über die Freitextsuche auffindbar (§5a) und wird auf der Karte selbst
angezeigt.

## 6. Was zuerst am Datenmodell nachgezogen werden müsste

Reihenfolge nach Aufwand, nicht nach Priorität:

1. Shop/Filiale auf `LaneCard` (Durchreichen aus Beleg-Kopf, existiert vermutlich schon auf
   `GoodsReceiptCase`) — kleinster Schritt, hoher Nutzen (Quick-Chip „Meine Filiale").
2. Ein explizites „Braucht Entscheidung"-Derivat statt Client-seitiger Kombination aus drei Feldern
   (`openIssue`, Status `blocked`, `attentionFlag`, Pool-Hold) — sonst muss die Filterlogik pro Fall
   im Frontend nachgebaut werden, was fehleranfällig ist, sobald ein neuer „Entscheidungs"-Zustand
   dazukommt.
3. Skill-Tier + Pool-Hold-Flag auf `LaneCard`, sobald diese Features aus den Parallel-Tasks
   feststehen.
4. Buchungsdatum, falls ein Datums-Filter gewünscht wird (aktuell nur implizit über Verladeplan-Lanes
   abgedeckt).

## 7. Non-Goals dieses Spikes

- Keine Drag&Drop-Neuordnung von Karten zwischen Lanes durch Filterung.
- Keine serverseitige Filter-API — für den Board-Umfang (max. ~200 Karten laut
  [[realistic-seed-and-ux-load-review]]) reicht client-seitiges Filtern der bereits geladenen `lanes`.
- Keine Änderung an `CaseActionMenu`, Aktions-Logik oder Status-Übergängen.
- Keine Entscheidung über die konkrete API/Feldnamen für Shop/Filiale, Skill-Tier, Pool-Hold — das ist
  Aufgabe des jeweiligen Feature-Tasks, hier nur als Erweiterungspunkt vermerkt.

## 8. Mockups

- `mockup-a-global-filter-bar.html` — empfohlene Richtung: Filterleiste + Quick-Chips + optionale
  Sub-Gruppierung, Lanes bleiben Status-Lanes.
- `mockup-b-regroup-by-dimension.html` — Alternative zum Vergleich: Lane-Achse komplett auf eine
  gewählte Dimension (hier: Filiale) umgeschaltet.

Beide Dateien sind eigenständig (inline CSS, keine Abhängigkeiten), unterstützen Light/Dark
(`prefers-color-scheme`) und ein responsives Layout, und öffnen direkt im Browser ohne Server.
