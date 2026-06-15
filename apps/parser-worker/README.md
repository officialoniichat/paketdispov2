# parser-worker

Python PDF parser worker for the digital document distribution (EPIC 2).
Consumes a BullMQ `document-parse` job, extracts Kopf + Positionen from the
Arbeitsanweisung and the WE-Beleg per Anhang G, and emits a `ParseJobResult`
(camelCase, mirrors `@paket/domain-types` `parser-contract.ts`).

## Pipeline

```
ParseJobInput
  -> extraction/pdf_text   PyMuPDF text (pdfplumber fallback; OCR only as a hook)
  -> mapping/work_instruction + mapping/we_beleg   Anhang G.1/G.4 field mapping
  -> guardrails            Prüfung Nein -> quantity_only; Prio/NOS != Abschnitt
  -> confidence            per-field score -> parseConfidence -> status
  -> ParseJobResult        parsed | needs_review (low confidence never auto-trusted)
```

The Lieferschein is carried in the DocumentSet but never parsed (H.1).

## Setup

```bash
uv sync --dev
uv run pytest -q          # unit + golden-master tests
uv run ruff check .
uv run mypy src

# regenerate the golden-master example PDFs (Anhang G / Q5, Q6)
uv run python tests/fixtures/generate_pdfs.py

# run the worker against Redis/BullMQ
REDIS_URL=redis://localhost:6379 uv run python -m parser_worker
```

## Golden masters

`tests/fixtures/golden/` holds real text-layer PDFs encoding the Anhang G
example (Beleg-Nr 3.656.860, Menge 9, Positionen 1–5, Prüfung Nein). The
golden-master tests parse them end-to-end and assert the Anhang F/H guardrails;
parser changes are only accepted once these pass (H.5).
