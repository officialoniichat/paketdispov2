"""Confidence aggregation and status routing (§4.2 steps 5/6, Anhang E.2).

The parser reports extraction quality. The decision rule is deliberately
conservative: anything below the threshold, or missing a critical field, becomes
``needs_review`` rather than false automation.
"""

from __future__ import annotations

from parser_worker.models import DEFAULT_PARSE_CONFIDENCE_THRESHOLD, ParseStatus

# Fields without which automatic processing is unsafe (§14.3). If any is absent,
# the set goes to needs_review regardless of the overall score.
CRITICAL_FIELDS: tuple[str, ...] = (
    "workInstruction.header.we_beleg_no",
    "receipt.weBelegNo",
    "receipt.positions",
)


def aggregate_confidence(field_confidences: dict[str, float]) -> float:
    """Mean of the per-field confidences (0.0 when nothing was extracted)."""
    if not field_confidences:
        return 0.0
    return sum(field_confidences.values()) / len(field_confidences)


def has_all_critical(field_confidences: dict[str, float]) -> bool:
    """True only if every critical field was extracted with non-zero confidence."""
    return all(field_confidences.get(field, 0.0) > 0.0 for field in CRITICAL_FIELDS)


def decide_status(
    confidence: float,
    field_confidences: dict[str, float],
    *,
    threshold: float = DEFAULT_PARSE_CONFIDENCE_THRESHOLD,
) -> ParseStatus:
    """Route a result: parsed only on high confidence AND all critical fields."""
    if not has_all_critical(field_confidences):
        return ParseStatus.NEEDS_REVIEW
    if confidence < threshold:
        return ParseStatus.NEEDS_REVIEW
    return ParseStatus.PARSED
