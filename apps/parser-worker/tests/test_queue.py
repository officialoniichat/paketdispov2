"""Queue handler tests – exercise handle_parse_job without a running Redis."""

from __future__ import annotations

from parser_worker.models import ParseJobFile
from parser_worker.queue import handle_parse_job
from tests.fixtures.generate_pdfs import AW_PDF, WE_PDF, generate


def _resolver(file: ParseJobFile) -> str:
    return file.storage_key


def test_handle_parse_job_emits_camelcase_result() -> None:
    generate(force=False)
    data = {
        "documentSetId": "ds-queue",
        "files": [
            {"kind": "work_instruction", "fileName": AW_PDF.name, "storageKey": str(AW_PDF)},
            {"kind": "goods_receipt", "fileName": WE_PDF.name, "storageKey": str(WE_PDF)},
        ],
    }
    result = handle_parse_job(data, resolver=_resolver)

    # camelCase wire shape (mirrors the Zod contract).
    assert result["documentSetId"] == "ds-queue"
    assert result["status"] == "parsed"
    assert result["parseConfidence"] >= 0.8
    assert result["workInstruction"]["header"]["weBelegNo"] == "3656860"
    assert result["receipt"]["positions"][0]["positionNo"] == 1


def test_handle_parse_job_accepts_snake_case_input_too() -> None:
    # populate_by_name=True keeps snake_case input valid (internal callers).
    generate(force=False)
    data = {
        "document_set_id": "ds-snake",
        "files": [
            {"kind": "goods_receipt", "file_name": WE_PDF.name, "storage_key": str(WE_PDF)},
        ],
    }
    result = handle_parse_job(data, resolver=_resolver)
    assert result["documentSetId"] == "ds-snake"
    # Missing AW -> needs_review, not auto-trusted.
    assert result["status"] == "needs_review"
