# Automatik-Dispo — Konzept (umgesetzt)

**Scope:** Der Zuteilungs-Flow im Tagescockpit (`apps/teamlead-web`). Baut auf
`dispo-flow-rework.md` auf und beschreibt das **umgesetzte** Automatik-Modell.
**Datum:** 2026-06-16

## Modell
> Die Automatik trägt den Tag von selbst. Der Mensch greift nur an drei Stellen ein —
> **Problem, Ausfall, Sonderfall.** Alles andere passiert ohne Klick, aber nie als Blackbox.

Drei menschliche Berührungspunkte (und nur diese): **Teamlead** (Probleme/Override, Frei/Fix),
**Worker** (Tempo: „Nächste holen"), **WE-Kraft** (Lagerplatz-Scan = der eine Dateneingang).

## Leitprinzipien
1. **Automatik ist Default** (An). Freie Belege verteilen sich selbst.
2. **Frei wird verteilt, Fix bleibt fix** — laufende/manuell gesetzte/geparkte Arbeit unangetastet.
3. **Reserve ist heilig** — lieber Belege sichtbar offen als Reserve fressen.
4. **Nie Blackbox** — jede Verteilung erzeugt Feedback + Audit (§8.4).
5. **Mensch nur bei Ausnahme** — kein Routine-Klick; ⚠ nur wenn zu entscheiden.
6. **Worker behält Tempo** — „Nächste holen" ersetzt das Schütte-Self-Pull (Folge-Epic).
7. **Ein Schalter** — Automatik An/Aus. Aus = derselbe Engine-Output, nur als Vorschlag vor dem Commit.

## Auslöser
- ① Schichtstart → Starterpakete aus Backlog (Vortage, Verladetag+Stückzahl).
- ② Batch eingelagert (ProHandel + Lagerplatz-Scan → `ready`) → Engine verteilt.
- ③ Kapazität ändert sich (krank/Abwesenheit aus Schichtplan) → freie Belege neu verteilt.
- ④ Manuell (Automatik Aus): „Jetzt verteilen" / „Vorschlag ansehen".

## Umsetzungsstand (Cockpit, this commit)
- **Automatik An/Aus** (persistiert in `localStorage`), An = Default.
- **Auto-Commit**: wächst der freie Pool (`pool.openCases`) über das zuletzt Behandelte, ruft das
  Cockpit `recalculate` automatisch (entprellt über einen „handled"-Marker → kein Loop auf
  unzuteilbaren Belegen). Aus → kein Auto-Commit, stattdessen „Jetzt verteilen".
- **Plan-Status-Zeile**: „● Plan aktuell" vs „⏳ Vorschlag verfügbar: N freie Belege".
- **Ausnahmen-Leiste** („Braucht dich: …"): offene Probleme + überlastete Köpfe (≥ 90 %) +
  Reserve aufgebraucht. Der einzige Routine-Blick.
- **Ein Feedback-Band** statt doppelter Snackbars (zugeteilt/Pakete/offen/Reserve).
- **Vorschlag-Dialog** (Automatik Aus oder „Vorschlag ansehen"): Namen statt Ids, „Übernehmen"
  statt „Live zuweisen", kein durationMs-Rauschen.
- **Toter „Export"-Button entfernt.**

## Bewusst (noch) nicht / Folge-Epics
- **Server-seitige Auto-Trigger** (Event-getrieben bei Ingestion/Abwesenheit) — aktuell client-
  getrieben über das Cockpit-Polling; ausreichend für den Pilot, sauber server-seitig später.
- **Worker „Nächste Belege holen"** (Employee-App) + **per-Beleg „warum hier?"** am Board —
  eigenes Inkrement (braucht einen Pull-Endpoint).
- **Delta (vorher→nachher)** im Vorschlag — heute Absolutwerte + aktuelle Auslastung; Delta ist
  der nächste Ausbau (braucht den aktuellen Last-Stand zum Vergleich).
