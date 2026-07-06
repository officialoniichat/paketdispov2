# Task Plan: End-User Handbuch (GitBook/SOP, GERMAN)

## Goal
Create complete German end-user SOP documentation in `docs/handbook/` (README.md + SUMMARY.md
+ one chapter per topic) covering the WHOLE app — every employee & teamlead flow — based on
ACTUAL behavior on main. No code/paths/API terms. Exact on-screen labels in 'quotes'.

## Structure
- README.md (intro), SUMMARY.md (TOC)
- Grundlagen: glossar, ueberblick, rollen-apps
- Teil A (Mitarbeiter, Du-Form): A1..A7
- Teil B (Teamlead, Sie/neutral): B1..B8
- Mermaid flowchart TD, German labels.

## Phases
- [ ] Phase 1: Extract exact labels/flows from employee-pwa (agent)
- [ ] Phase 2: Extract exact labels/flows from teamlead-web (agent)
- [ ] Phase 3: Extract engine/backend semantics + terminologie (agent)
- [ ] Phase 4: (Optional) run stack, spot-check headline flows
- [ ] Phase 5: Write Grundlagen chapters
- [ ] Phase 6: Write Teil A chapters
- [ ] Phase 7: Write Teil B chapters
- [ ] Phase 8: README + SUMMARY + docs index link, maintainer notes, commit

## Decisions
- Source strings = authoritative on-screen labels (cheaper + faithful vs clicking every screen).
- Keep existing index.html HTML viewer; add markdown book alongside.

## Ablage-Lanes (exact, remoteDataset.ts)
Prio · Jeden-Tag-Ware · Verladeplan heute · Verladeplan morgen · Sonstige · Geparkt · Weitergeleitet · Problemfälle

## Status
**DONE** - committed e0ed985. Viewer browser-verified (chapters + Mermaid render). 21 md files
+ viewer; orphaned old handbook img/src removed.

## History (was: Phase 5-8) - extractions done (3 agents). Writing chapters. Discrepancies → pflegehinweise.md:
overdueLeadDays removed; no "zurück an Bucher" button (via Topf Freigeben); no "trotzdem
bearbeiten" button (via Lieferung freigeben/DeliveryGroup release); Groß-Beleg = pool wait, no
next-day-lock UI. Verification = source strings (authoritative for labels), not click-through.
