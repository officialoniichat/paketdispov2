"""Parser output contract. Mirrors the domain ParseStatus so low-confidence
results land in ``needs_review`` instead of being auto-trusted (Anhang E.2)."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class ParseStatus(StrEnum):
    PENDING = "pending"
    PARSED = "parsed"
    NEEDS_REVIEW = "needs_review"
    FAILED = "failed"


class ParseResult(BaseModel):
    """Result of parsing one document set."""

    document_set_id: str
    parse_confidence: float = Field(ge=0.0, le=1.0)
    status: ParseStatus
    warnings: list[str] = Field(default_factory=list)

    @classmethod
    def from_confidence(
        cls, document_set_id: str, confidence: float, threshold: float = 0.8
    ) -> ParseResult:
        """Map a confidence score to a status using the review threshold."""
        status = ParseStatus.PARSED if confidence >= threshold else ParseStatus.NEEDS_REVIEW
        return cls(
            document_set_id=document_set_id,
            parse_confidence=confidence,
            status=status,
        )
