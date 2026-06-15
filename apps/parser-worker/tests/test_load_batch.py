"""Parser BATCH LOAD test (concept §17.2 "Lasttest für Batchimport von 20-30
Lieferscheinen plus Tagesnachschub").

Simulates a daily batch import: 30 document sets (cycled across the clean
variant catalog) parsed back-to-back. Asserts the whole batch parses correctly
and stays well within a practical throughput budget, so the import pipeline
holds up at real daily volume (risk F.3).
"""

from __future__ import annotations

import time

from parser_worker.models import ParseJobInput, ParseStatus
from parser_worker.pipeline import parse_document_set
from tests.fixtures.golden_variants import VARIANTS, generate_variants

BATCH_SIZE = 30  # 20-30 Lieferscheine + Tagesnachschub
# Generous wall-clock ceiling for the whole batch on commodity hardware.
BATCH_BUDGET_SECONDS = 20.0


def _job_for(spec, index: int) -> ParseJobInput:
    files: list[dict[str, str]] = [
        {
            "kind": "work_instruction",
            "file_name": spec.aw_pdf.name,
            "storage_key": str(spec.aw_pdf),
        },
        {
            "kind": "goods_receipt",
            "file_name": spec.we_pdf.name,
            "storage_key": str(spec.we_pdf),
        },
        {"kind": "delivery_note", "file_name": "ls.pdf", "storage_key": "unused"},
    ]
    return ParseJobInput.model_validate(
        {"document_set_id": f"batch-{index}-{spec.slug}", "files": files}
    )


def test_daily_batch_imports_within_budget() -> None:
    generate_variants(force=False)
    clean = [s for s in VARIANTS if s.expected_status is ParseStatus.PARSED]
    assert clean, "expected at least one clean variant to load"

    jobs = [_job_for(clean[i % len(clean)], i) for i in range(BATCH_SIZE)]

    start = time.perf_counter()
    results = [parse_document_set(job) for job in jobs]
    elapsed = time.perf_counter() - start

    assert len(results) == BATCH_SIZE
    # Every clean document set parses successfully (no needs_review/failed).
    assert all(r.status is ParseStatus.PARSED for r in results), [
        (r.document_set_id, r.status.value) for r in results if r.status is not ParseStatus.PARSED
    ]
    assert elapsed < BATCH_BUDGET_SECONDS, f"batch of {BATCH_SIZE} took {elapsed:.2f}s"
