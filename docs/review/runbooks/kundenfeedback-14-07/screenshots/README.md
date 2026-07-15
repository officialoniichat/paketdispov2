# Screenshots — Beweis-Protokoll

Die Runbooks verweisen pro Schritt auf Screenshot-Dateien mit sprechenden Namen
(`<runbook>-<nr>-<name>.*`, z. B. `50-05-teilabschluss-zusammenfassung.png`).

## Evidenz-Mechanismus (Verifikationslauf 2026-07-15)

Der Lauf wurde **live via Claude-in-Chrome** (`mcp__claude-in-chrome__computer(screenshot)`)
gefahren. Jeder Schritt wurde dabei als Screenshot erfasst und **inline im Verifikationslauf**
angezeigt — das ist das maßgebliche Proof-of-Record dieses Durchlaufs. Zusätzlich wurde jeder
Zustand **hart per DB/Audit-Log** (`workflow_events`, `goods_receipt_cases`, `issues`,
`problem_reasons`) gegengeprüft; diese SQL-Belege stehen direkt in den Runbooks (z. B. das
Audit-Log in Runbook 80 §Audit-Beleg).

Für **erneute Läufe** (das ist der Zweck dieser Runbooks): Beim Nachfahren die Screenshots hier
unter den genannten Dateinamen ablegen. Empfohlen:

```
mcp__claude-in-chrome__computer(action=screenshot, save_to_disk=true)   # oder
mcp__plugin_playwright__browser_take_screenshot(filename="50-05-….png")
```

und die Datei nach `docs/review/runbooks/kundenfeedback-14-07/screenshots/` kopieren.

> Hinweis: Die maßgebliche Beweislage dieses ersten Laufs ist die Kombination aus
> **Schritt-für-Schritt-PASS/FAIL** (in den Runbooks) + **inline-Screenshots** + **DB/Audit-Log-
> Gegenprüfung**. Persistente PNG-Dateien werden bei den Wiederholungsläufen befüllt.
