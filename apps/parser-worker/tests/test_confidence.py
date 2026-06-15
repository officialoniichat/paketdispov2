from parser_worker.confidence import (
    aggregate_confidence,
    decide_status,
    has_all_critical,
)
from parser_worker.models import ParseStatus

_ALL_CRITICAL = {
    "workInstruction.header.we_beleg_no": 0.95,
    "receipt.weBelegNo": 0.95,
    "receipt.positions": 0.95,
}


def test_aggregate_is_mean() -> None:
    assert aggregate_confidence({"a": 0.8, "b": 0.6}) == 0.7
    assert aggregate_confidence({}) == 0.0


def test_has_all_critical() -> None:
    assert has_all_critical(_ALL_CRITICAL) is True
    missing = dict(_ALL_CRITICAL, **{"receipt.weBelegNo": 0.0})
    assert has_all_critical(missing) is False


def test_high_confidence_with_all_critical_is_parsed() -> None:
    assert decide_status(0.95, _ALL_CRITICAL) is ParseStatus.PARSED


def test_low_confidence_goes_to_needs_review() -> None:
    assert decide_status(0.5, _ALL_CRITICAL) is ParseStatus.NEEDS_REVIEW


def test_missing_critical_forces_needs_review_even_if_score_high() -> None:
    missing = dict(_ALL_CRITICAL, **{"receipt.positions": 0.0})
    assert decide_status(0.99, missing) is ParseStatus.NEEDS_REVIEW


def test_threshold_is_configurable() -> None:
    assert decide_status(0.75, _ALL_CRITICAL, threshold=0.7) is ParseStatus.PARSED
    assert decide_status(0.75, _ALL_CRITICAL, threshold=0.8) is ParseStatus.NEEDS_REVIEW
