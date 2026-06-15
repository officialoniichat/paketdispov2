from parser_worker.models import ParseResult, ParseStatus


def test_low_confidence_goes_to_needs_review() -> None:
    result = ParseResult.from_confidence("ds-1", 0.5)
    assert result.status is ParseStatus.NEEDS_REVIEW


def test_high_confidence_is_parsed() -> None:
    result = ParseResult.from_confidence("ds-1", 0.95)
    assert result.status is ParseStatus.PARSED


def test_confidence_bounds_enforced() -> None:
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ParseResult(document_set_id="ds-1", parse_confidence=1.5, status=ParseStatus.PARSED)
