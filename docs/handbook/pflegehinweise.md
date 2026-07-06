# Pflegehinweise (für die Redaktion)

*Dieser Anhang richtet sich an die Handbuch-Pflege, nicht an Endnutzer. Er hält fest, wie das
Handbuch verifiziert wurde und wo die Aufgabenstellung von der tatsächlichen App abweicht. Alle
Endnutzer-Kapitel beschreiben ausschließlich das **echte** Verhalten auf `main`.*

## Verifikationsmethode

Die Bildschirm-Beschriftungen und Abläufe wurden gegen den tatsächlichen Quellstand auf `main`
abgeglichen (die im Code hinterlegten sichtbaren Texte sind die maßgebliche Quelle der exakten
Beschriftungen). Alle in `'Anführungszeichen'` zitierten Texte stammen aus diesem Stand. Bei einer
späteren Aktualisierung sollten die Kapitel gegen die dann laufenden Apps gegengeprüft werden
(Mitarbeiter-App und Cockpit über `pnpm dev` starten; siehe interne Betriebsdoku).

## Abweichungen Aufgabenstellung ↔ echte App

Die ursprüngliche Aufgabenstellung nennt einige Bezeichnungen/Funktionen, die im echten Cockpit
anders umgesetzt sind. Dokumentiert ist jeweils das **echte** Verhalten.

1. **„zurück an Bucher" ist kein eigener Knopf.** Das fachliche Verhalten existiert (Belege mit
   fehlenden Pflichtdaten werden blockiert), aber im Cockpit gibt es keinen Knopf `'zurück an
   Bucher'`. Die Steuerung läuft über den Scope `'Topf'` und den Knopf `'Freigeben (an Automatik)'`.
   (Kapitel B6)

2. **„trotzdem bearbeiten" ist kein eigener Knopf.** Unvollständige Lieferungen werden im Panel
   `'Zugehörige Lieferung'` behandelt (`'Lieferung bestätigen'`, `'Lieferung trennen'`, `'Diesen
   Beleg entfernen'`). Einen expliziten Knopf `'trotzdem bearbeiten'` gibt es in der Cockpit-Oberfläche
   nicht. (Kapitel B6)

3. **Groß-Belege: keine sichtbare „Folgetag-Sperre" als eigene Funktion.** Groß-Belege werden über
   die `'Monster-Beleg-Schwelle (Teile)'` im Tab `'Bündel'` gesteuert; sie warten im Pool auf
   manuelle Entscheidung. Die Fortsetzungs-Logik (wer noch an einem großen Beleg hängt, bekommt am
   Folgetag kein neues Starter-Pack) ist Automatik-Verhalten, kein Bedien-Element. (Kapitel B6/B7)

4. **Überfälligkeit ohne Vorlauf.** Das frühere Konzept „Vorlauftage" (overdueLeadDays) ist im Code
   entfernt. Ein Verladeplan-Beleg ist schlicht ab dem Verladetag fällig und danach überfällig –
   ohne Vorlauf. Die Kapitel B7/Grundlagen sind entsprechend formuliert.

5. **CatMan ist nur Anzeige.** `'CatMan fällig'` erscheint als Kennzahl/Chip, beeinflusst die
   Priorisierung aber nicht. (Kapitel B1/B7)

6. **Kein „Bereiche"-Admin-Tab.** Bereiche (Regal/Palette/Hängebahn) leiten sich aus der Lagerklasse
   ab und werden über den Tab `'Lagerplätze'` gepflegt, nicht über einen eigenen „Bereiche"-Tab.
   (Kapitel B7)

7. **Mitarbeiter-App: kein Foto-Upload, keine kurzen Meldungen, kein Abmelden-Knopf.** Der
   Problem-Bildschirm zeigt nur den Text `'Foto: optional'` ohne Upload-Funktion; Rückmeldungen
   erscheinen als stehende Hinweis-Felder, nicht als aufblinkende Meldungen; ein Abmelden-Knopf ist
   nicht vorhanden. (Kapitel A6/A7)

## Browser-Viewer

`docs/handbook/index.html` ist ein leichtgewichtiger Viewer, der `SUMMARY.md` als Seitenleiste
liest und die Markdown-Kapitel (inkl. Mermaid-Diagramme) rendert. Am besten lokal über einen
kleinen Webserver öffnen (im Ordner `docs/handbook`: `python3 -m http.server`, dann
`http://localhost:8000/`) — direktes Öffnen per `file://` funktioniert wegen der Browser-Sicherheit
nicht. Neue Kapitel erscheinen automatisch im Viewer, sobald sie in `SUMMARY.md` verlinkt sind.

Der frühere einseitige HTML-Handbuch samt eigener Diagramm-Dateien (`img/`, `src/`) wurde durch
diesen Viewer + die Kapitel-Diagramme ersetzt und entfernt, damit es nur **ein** Handbuch gibt. Das
C4-Architekturmodell unter `docs/architecture/` bleibt davon unberührt und wird separat gepflegt.
