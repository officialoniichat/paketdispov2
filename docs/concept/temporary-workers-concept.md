# Temporäre Kräfte (Azubis, Saisonaushilfen) — Konzept

Teamlead-Anforderung (Dustin Feldmann, Punkt 3): In Peakphasen arbeiten Azubis aus
dem Verkauf und Werkstudenten mit. Sie sind deutlich unproduktiver, und eine
Leistungserhebung ist wegen der kurzen Einsatzzeit nicht sinnvoll. Idee des Teamleads:
„Dummy-Mitarbeitende anlegen, auf die Belege manuell verteilt werden können — ohne
Leistungsmessung."

## Alternativen

1. **Fake-/Dummy-Entitäten** (Teamlead-Vorschlag): eigene Pseudo-Mitarbeiter neben den
   echten. *Nachteil:* doppeltes Mitarbeiter-Modell, parallele Sonderpfade in Zuweisung,
   Kapazität, Bereichen, Audit — verletzt Single-Source und „no legacy".
2. **Belege als „unverteilt/Sonstige" sammeln.** *Nachteil:* die Arbeit ist dann keiner
   Person zugeordnet; manuelle Verteilung und Mitarbeiterboard funktionieren nicht.
3. **Flag am echten Mitarbeiter-Modell (gewählt).** Ein `measured`-Schalter am `User`.
   Temp-Kräfte sind echte (aber nicht gemessene) Mitarbeiter.

## Entscheidung: `measured`-Flag am echten Mitarbeiter

`User.measured: boolean` (default `true`). Temp-/Aushilfskräfte = `measured: false`.

Konsequenzen:

- **Manuelle Verteilung** funktioniert unverändert — Temp-Kräfte sind normale Zuweisungs-
  ziele (Beleg-Split, Bundle-Add). Keine Sonderpfade.
- **Automatik** respektiert weiterhin ihren (typisch niedrigeren) `productivityFactor`;
  sie können auch automatisch Ziel sein, wenn sie eine Schicht/Kapazität haben.
- **Leistungsmessung** schließt `measured: false` aus. Trennung in der ZST-/KPI-Kachel
  (§10.1):
  - *Durchsatz* (`completedParts`, `completedCases`, `totalCases`) — bleibt sichtbar,
    zählt **alle** (auch Temp), damit der Tagesfortschritt vollständig bleibt.
  - *Leistung/Produktivität* (`effortPoints`, `workedMinutes`, `partsPerHour`,
    `effortPointsPerHour`) — zählt **nur** gemessene Mitarbeiter, damit Temp-Kräfte die
    Pro-Kopf-Produktivität nicht verzerren.
- **UI** markiert Temp-Kräfte klar (Chip „Temp · ohne Messung") und erlaubt schnelles
  Anlegen/Umschalten im Admin-Tab „Mitarbeiter".

## Single-Source

Die KPI-Trennung lebt in einer reinen Funktion `aggregateKpiTotals`
(`apps/backend-api/src/cases/kpi-aggregate.ts`), die der `teamlead-read.service.kpis()`
nach dem Laden aufruft. Die Fachregel „Durchsatz zählt alle, Leistung nur gemessene"
ist damit an genau einer Stelle definiert und unit-getestet.
