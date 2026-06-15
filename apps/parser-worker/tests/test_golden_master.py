"""Golden-master tests: parse the real example PDFs end-to-end (Anhang G / Q5,Q6).

These run the full pipeline against committed text-layer PDFs and assert both the
extracted values AND the Anhang F/H guardrails. Parser freedom ends here: a
regression in extraction or a guardrail violation fails the build (H.5).
"""

from __future__ import annotations

import pytest

from parser_worker.models import CheckMode, DocumentKind, ParseJobInput, ParseStatus
from parser_worker.pipeline import parse_document_set
from tests.fixtures.generate_pdfs import AW_PDF, WE_PDF, generate


@pytest.fixture(scope="module")
def golden_job() -> ParseJobInput:
    generate(force=False)  # self-contained: create fixtures if missing
    return ParseJobInput.model_validate(
        {
            "document_set_id": "ds-golden",
            "files": [
                {"kind": "work_instruction", "file_name": AW_PDF.name, "storage_key": str(AW_PDF)},
                {"kind": "goods_receipt", "file_name": WE_PDF.name, "storage_key": str(WE_PDF)},
                # Lieferschein is carried but never parsed (H.1) – a dummy entry.
                {"kind": "delivery_note", "file_name": "ls.pdf", "storage_key": "unused"},
            ],
        }
    )


def test_golden_is_parsed_with_high_confidence(golden_job: ParseJobInput) -> None:
    result = parse_document_set(golden_job)
    assert result.status is ParseStatus.PARSED
    assert result.parse_confidence >= 0.8
    assert result.warnings == []


def test_golden_header_fields(golden_job: ParseJobInput) -> None:
    header = parse_document_set(golden_job).work_instruction.header
    assert header.branch_no == "1"
    assert header.storage_location_code == "27"
    assert header.shop_area_no == "21"
    assert header.we_beleg_no == "3656860"  # normalised from 3.656.860 (G.1)
    assert header.total_quantity == 9
    assert header.price_label_print_required is True
    assert header.sort_by_article_color_size_required is True
    assert header.box_label_required is True
    assert header.zst_required is True


def test_guardrail_pruefung_nein_is_quantity_only(golden_job: ParseJobInput) -> None:
    header = parse_document_set(golden_job).work_instruction.header
    # 'Prüfung Nein' must NOT become 'no check' – quantity check stays mandatory.
    assert header.goods_receipt_check_mode is CheckMode.QUANTITY_ONLY
    assert header.minimum_quantity_check_always_required is True


def test_guardrail_prio_and_nos_are_not_a_section(golden_job: ParseJobInput) -> None:
    wi = parse_document_set(golden_job).work_instruction
    # NOS appears in the warenbezeichnung but section stays unset (NOS != Abschnitt).
    assert all(p.nos_indicator for p in wi.positions)
    assert wi.section is None
    # No prio marker in this example; prio is never derived from a section.
    assert wi.priority_flags == []
    assert wi.goods_type_text == "Vororder"


def test_aw_positions_have_label_and_no_security(golden_job: ParseJobInput) -> None:
    positions = parse_document_set(golden_job).work_instruction.positions
    assert [p.position_no for p in positions] == [1, 2, 3, 4, 5]
    assert all(p.label_attach_required is True for p in positions)
    # Point 10 "Nicht sichern" -> no security task generated (G.5).
    assert all(p.security_required is False for p in positions)


def test_guardrail_position_groups_sku_lines(golden_job: ParseJobInput) -> None:
    receipt = parse_document_set(golden_job).receipt
    assert [p.position_no for p in receipt.positions] == [1, 2, 3, 4, 5]
    # Position 1 carries multiple SKU lines (Position != SKU-Zeile).
    assert len(receipt.positions[0].sku_lines) == 2
    sku_sum = sum(s.expected_quantity for p in receipt.positions for s in p.sku_lines)
    assert sku_sum == 9  # matches Beleg-Menge 9


def test_aw_and_we_beleg_numbers_match(golden_job: ParseJobInput) -> None:
    result = parse_document_set(golden_job)
    assert result.work_instruction.header.we_beleg_no == result.receipt.we_beleg_no


def test_missing_documents_route_to_needs_review() -> None:
    # Only a Lieferschein present -> no parseable basis -> needs_review (E.2).
    job = ParseJobInput.model_validate(
        {
            "document_set_id": "ds-empty",
            "files": [{"kind": "delivery_note", "file_name": "ls.pdf", "storage_key": "x"}],
        }
    )
    result = parse_document_set(job)
    assert result.status is ParseStatus.NEEDS_REVIEW
    assert result.parse_confidence < 0.8


def test_unknown_documentkind_enum_is_stable() -> None:
    assert DocumentKind.WORK_INSTRUCTION == "work_instruction"
