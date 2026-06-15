"""Parser GOLDEN-MASTER GATE (concept §17.2 / risk F.3 / §16.3).

Release is gated against a CATALOG of real document VARIANTS, not just the two
baseline example PDFs. For every variant in
``tests/fixtures/golden_variants.py`` this gate:

* parses the variant end-to-end through the real pipeline,
* asserts the routing decision (``parsed`` for clean variants,
  ``needs_review`` for the intentionally-degraded ones), and
* runs the variant-defining field assertions (e.g. Prio is a flag and not a
  section, Sicherung=Ja yields securing tasks while "Nicht sichern" yields none,
  Prüfung=% maps to percentage_check, multi-SKU rows stay grouped under one
  position).

If any variant regresses, the corresponding parametrised case fails loudly so
the gate blocks deployment (§16.3 "Regressionstest für Parser-Templates vor
Deployment"). The two baseline golden tests in ``test_golden_master.py`` stay
green alongside this gate.
"""

from __future__ import annotations

import pytest

from parser_worker.models import ParseJobInput, ParseJobResult, ParseStatus
from parser_worker.pipeline import parse_document_set
from tests.fixtures.golden_variants import VARIANTS, VariantSpec, generate_variants


@pytest.fixture(scope="module", autouse=True)
def _materialise_variants() -> None:
    # Self-contained: (re)create any missing variant PDFs before the gate runs.
    generate_variants(force=False)


def _run(spec: VariantSpec) -> ParseJobResult:
    files: list[dict[str, str]] = []
    if spec.include_work_instruction:
        files.append(
            {
                "kind": "work_instruction",
                "file_name": spec.aw_pdf.name,
                "storage_key": str(spec.aw_pdf),
            }
        )
    if spec.include_goods_receipt:
        files.append(
            {
                "kind": "goods_receipt",
                "file_name": spec.we_pdf.name,
                "storage_key": str(spec.we_pdf),
            }
        )
    # A Lieferschein is always carried but never parsed (H.1).
    files.append({"kind": "delivery_note", "file_name": "ls.pdf", "storage_key": "unused"})
    job = ParseJobInput.model_validate({"document_set_id": f"ds-{spec.slug}", "files": files})
    return parse_document_set(job)


_IDS = [s.slug for s in VARIANTS]


def test_catalog_is_non_trivial() -> None:
    # Guard the gate itself: it must cover more than the two baseline PDFs and
    # include both clean and intentionally-degraded variants.
    assert len(VARIANTS) >= 10, "variant catalog shrank below the F.3 minimum"
    statuses = {s.expected_status for s in VARIANTS}
    assert ParseStatus.PARSED in statuses
    assert ParseStatus.NEEDS_REVIEW in statuses


@pytest.mark.parametrize("spec", VARIANTS, ids=_IDS)
def test_variant_routing(spec: VariantSpec) -> None:
    """Every variant routes to its expected status (parsed vs needs_review)."""
    result = _run(spec)
    assert result.status is spec.expected_status, (
        f"{spec.slug}: expected {spec.expected_status.value}, got {result.status.value} "
        f"(confidence={result.parse_confidence}, warnings={result.warnings})"
    )


@pytest.mark.parametrize("spec", VARIANTS, ids=_IDS)
def test_variant_fields(spec: VariantSpec) -> None:
    """Every variant's defining field/guardrail is correctly extracted."""
    result = _run(spec)
    for assertion in spec.assertions:
        assertion(result)


def test_clean_variants_have_high_confidence() -> None:
    """Clean variants clear the parse threshold with no plausibility warnings."""
    for spec in VARIANTS:
        if spec.expected_status is not ParseStatus.PARSED:
            continue
        result = _run(spec)
        assert result.parse_confidence >= 0.8, f"{spec.slug} confidence {result.parse_confidence}"
        assert result.warnings == [], f"{spec.slug} unexpected warnings {result.warnings}"
