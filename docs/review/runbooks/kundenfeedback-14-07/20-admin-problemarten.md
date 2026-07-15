# Runbook 20 — Admin: Problemarten-Katalog

**Zweck:** Verifiziert den neuen admin-verwalteten **Problemarten-Katalog** (ersetzt den alten
`IssueType`-Enum). Frei definierbare Gründe, die der Mitarbeiter beim Melden eines
**Positions**-Problems auswählt. CRUD + Reihenfolge + Aktiv/Inaktiv + Persistenz.

**Voraussetzung:** Runbook 10 (Stack läuft, `standard` geladen).
**Zugang:** Cockpit `http://localhost:5174` → **Admin & Regeln** → Tab **Problemarten**.

---

## Schritte

| # | Aktion | Erwartet | Ergebnis |
|---|--------|----------|----------|
| 1 | Cockpit → **Admin & Regeln** → Tab **Problemarten** öffnen | Tabelle: Spalten *Reihenfolge · Bezeichnung · Aktiv · Aktion*. Seed-Katalog (9): falscher Artikel, falsche Farbe, falsche Größe, beschädigt, Paket fehlt, Etikettenproblem, Sicherungsproblem, Druckerproblem, Sonstiges. Hinweistext: „Frei definierbare Gründe … Inaktive Gründe sind in der App nicht wählbar. Bereits gemeldete Probleme behalten ihren Grund-Text …" | **PASS** |
| 2 | **Neue Problemart** klicken, Feld leer lassen | Neue Zeile mit rot umrandetem Pflichtfeld; **Speichern** deaktiviert; Meldung „Jede Problemart braucht eine Bezeichnung." | **PASS** (Validierung greift) |
| 3 | In das neue Feld `ZZ Verifikationstest` tippen | **Speichern** wird aktiv | **PASS** |
| 4 | **Speichern** | Grünes Banner „Problemarten gespeichert."; neue Zeile als aktiv gelistet | **PASS** |
| 5 | Bezeichnung ändern zu `ZZ Verifikationstest umbenannt`, **Speichern** | Umbenennung gespeichert | **PASS** |
| 6 | Seite neu laden (`navigate` /admin) → Tab **Problemarten** erneut öffnen | Umbenannte Zeile weiterhin vorhanden → **serverseitig persistiert** | **PASS** |
| 7 | Reihenfolge: bei der Testzeile **↑** klicken | Zeile rückt über „Sonstiges" — Reihenfolge änderbar | **PASS** |
| 8 | **Aktiv**-Schalter der Testzeile ausschalten | Toggle grau/aus; andere Zeilen unberührt | **PASS** |
| 9 | *(Aufräumen)* Testzeile über **🗑 Aktion** löschen, dann **Speichern** | Grünes Banner „Problemarten gespeichert."; Katalog zurück auf die ursprünglichen 9 Einträge | **PASS** (Backend-Delete verifiziert: `PUT /api/admin/problem-reasons` ohne die Zeile → GET liefert 9) |

> ⚠️ **Ausführungshinweis (wichtig):** Nach dem Löschen einer Zeile rückt der **Speichern**-Button
> nach oben. Wird er nach altem Layout geklickt, geht der Klick daneben und die Löschung wird
> **nur optimistisch in der UI** angezeigt (9 Zeilen), aber **nicht** persistiert (DB behält 10).
> Immer auf das Banner „Problemarten gespeichert." warten und per Reload gegenprüfen.
> (Der Backend-Replace-all-Delete selbst funktioniert korrekt — per API bestätigt.)

**Screenshots:** `screenshots/20-01-katalog-seed.*`, `20-02-neue-validierung.*`,
`20-03-gespeichert.*`, `20-04-persistiert-nach-reload.*`, `20-05-reorder.*`,
`20-06-deaktiviert.*`, `20-07-cleanup-zurueck-auf-9.*`

---

## Dynamische Übernahme in der PWA (Cross-Check)
Die Behauptung „**PWA übernimmt Katalog dynamisch**" wird in **Runbook 50** direkt belegt:
dort zeigt der **ProblemDialog** der Mitarbeiter-App exakt die hier gepflegten aktiven Gründe
(Quelle: `GET /api/problem-reasons`, Hook `useProblemReasons`). Inaktiv geschaltete Gründe
erscheinen dort **nicht**. Um Runbook 20 selbst-aufräumend zu halten, wird der dynamische
PWA-Test in 50 mit eigenem Add+Cleanup gefahren.

## Endzustands-Check
- ✅ Katalog exakt wie Seed (9 aktive Gründe), keine Testzeile übrig.
- ✅ Kein verwaister Zustand erzeugt (reine Stammdaten-Pflege, kein Case berührt).

**Verdikt Runbook 20: PASS**
