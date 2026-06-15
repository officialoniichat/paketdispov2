import pytest
from pydantic import ValidationError

from parser_worker.models import ParseJobResult, ParseStatus


def test_parse_job_result_roundtrips() -> None:
    result = ParseJobResult(
        document_set_id="ds-1",
        parser_version="pw-0.1.0",
        parse_confidence=0.95,
        status=ParseStatus.PARSED,
    )
    assert result.status is ParseStatus.PARSED
    assert result.warnings == []


def test_confidence_bounds_enforced() -> None:
    with pytest.raises(ValidationError):
        ParseJobResult(
            document_set_id="ds-1",
            parser_version="pw-0.1.0",
            parse_confidence=1.5,
            status=ParseStatus.PARSED,
        )


def test_extra_fields_rejected() -> None:
    # extra='forbid' keeps the Python contract in lockstep with the Zod schema.
    with pytest.raises(ValidationError):
        ParseJobResult(
            document_set_id="ds-1",
            parser_version="pw-0.1.0",
            parse_confidence=0.9,
            status=ParseStatus.PARSED,
            unexpected="x",
        )
